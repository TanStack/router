import { createEvent, getHeader, sendWebResponse } from 'h3'
import { isRunnableDevEnvironment } from 'vite'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { resolveViteId } from '../utils'
import { extractHtmlScripts } from './extract-html-scripts'
import type { Connect, DevEnvironment, PluginOption } from 'vite'

export function devServerPlugin(): PluginOption {
  let isTest = false

  let injectedHeadScripts: string | undefined

  return [
    {
      name: 'tanstack-start-core:dev-server',
      config(_userConfig, { mode }) {
        isTest = isTest ? isTest : mode === 'test'
      },
      async configureServer(viteDevServer) {
        if (isTest) {
          return
        }

        // Extract the scripts that Vite plugins would inject into the initial HTML
        const templateHtml = `<html><head></head><body></body></html>`
        const transformedHtml = await viteDevServer.transformIndexHtml(
          '/',
          templateHtml,
        )
        const scripts = extractHtmlScripts(transformedHtml)
        injectedHeadScripts = scripts.filter((script) => script.content)
          .join(';')

        return () => {
          // do not install middleware in middlewareMode
          if (viteDevServer.config.server.middlewareMode) {
            return
          }

          const serverEnv = viteDevServer.environments[
            VITE_ENVIRONMENT_NAMES.server
          ] as DevEnvironment | undefined

          if (!serverEnv) {
            throw new Error(
              `Server environment ${VITE_ENVIRONMENT_NAMES.server} not found`,
            )
          }

          // do not install middleware if SSR env in case another plugin already did
          if (
            !isRunnableDevEnvironment(serverEnv) ||
            // do not check via `isFetchableDevEnvironment` since nitro does implement the `FetchableDevEnvironment` interface but not via inheritance (which this helper checks)
            'dispatchFetch' in serverEnv
          ) {
            return
          }

          viteDevServer.middlewares.use(async (req, res) => {
            // Create an H3Event to have it passed into the server entry
            // i.e: event => defineEventHandler(event)

            // fix the request URL to match the original URL
            // otherwise, the request URL will '/index.html'
            if (req.originalUrl) {
              req.url = req.originalUrl
            }
            const event = createEvent(req, res)

            try {
              // Import and resolve the request by running the server entry point
              // i.e export default defineEventHandler((event) => { ... })
              const serverEntry = await serverEnv.runner.import(
                '/~start/server-entry',
              )
              const response = await serverEntry['default'](event)

              return sendWebResponse(event, response)
            } catch (e) {
              console.error(e)
              viteDevServer.ssrFixStacktrace(e as Error)

              if (
                getHeader(event, 'content-type')?.includes('application/json')
              ) {
                return sendWebResponse(
                  event,
                  new Response(
                    JSON.stringify(
                      {
                        status: 500,
                        error: 'Internal Server Error',
                        message:
                          'An unexpected error occurred. Please try again later.',
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json',
                      },
                    },
                  ),
                )
              }

              return sendWebResponse(
                event,
                new Response(
                  `
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(
                      prepareError(req, e),
                    ).replace(/</g, '\\u003c')}))
                  </script>
                </head>
                <body>
                </body>
              </html>
            `,
                  {
                    status: 500,
                    headers: {
                      'Content-Type': 'text/html',
                    },
                  },
                ),
              )
            }
          })
        }
      },
    },
    {
      name: 'tanstack-start-core:dev-server:injected-head-scripts',
      applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.server,
      resolveId: {
        filter: { id: new RegExp(VIRTUAL_MODULES.injectedHeadScripts) },
        handler(_id) {
          return resolveViteId(VIRTUAL_MODULES.injectedHeadScripts)
        },
      },
      load: {
        filter: {
          id: new RegExp(resolveViteId(VIRTUAL_MODULES.injectedHeadScripts)),
        },
        handler() {
          const mod = `
        export const injectedHeadScripts = ${JSON.stringify(injectedHeadScripts) || 'undefined'}`
          return mod
        },
      },
    },
  ]
}

/**
 * Formats error for SSR message in error overlay
 * @param req
 * @param error
 * @returns
 */
function prepareError(req: Connect.IncomingMessage, error: unknown) {
  const e = error as Error
  return {
    message: `An error occured while server rendering ${req.url}:\n\n\t${
      typeof e === 'string' ? e : e.message
    } `,
    stack: typeof e === 'string' ? '' : e.stack,
  }
}
