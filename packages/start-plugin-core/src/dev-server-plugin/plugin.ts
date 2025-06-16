import { createEvent, getHeader, sendWebResponse } from 'h3'
import { isRunnableDevEnvironment } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { extractHtmlScripts } from './extract-html-scripts'
import type { Connect, DevEnvironment, Plugin, ViteDevServer } from 'vite'

declare global {
  // eslint-disable-next-line no-var
  var TSS_INJECTED_HEAD_SCRIPTS: string | undefined
}

export function devServerPlugin(): Plugin {
  // let config: UserConfig
  let isTest = false

  return {
    name: 'start-dev-ssr-plugin',
    config(userConfig, { mode }) {
      // config = userConfig
      isTest = isTest ? isTest : mode === 'test'
    },
    configureServer(viteDevServer) {
      if (isTest) {
        return
      }

      ;(globalThis as any).viteDevServer = viteDevServer

      return () => {
        remove_html_middlewares(viteDevServer.middlewares)
        let cachedScripts: string | undefined

        viteDevServer.middlewares.use(async (req, res) => {
          // Create an H3Event to have it passed into the server entry
          // i.e: event => defineEventHandler(event)
          const event = createEvent(req, res)

          const serverEnv = viteDevServer.environments[
            VITE_ENVIRONMENT_NAMES.server
          ] as DevEnvironment | undefined

          try {
            if (!serverEnv) {
              throw new Error(
                `Server environment ${VITE_ENVIRONMENT_NAMES.server} not found`,
              )
            }

            if (!isRunnableDevEnvironment(serverEnv)) {
              throw new Error(
                `Expected server environment ${VITE_ENVIRONMENT_NAMES.server} to be a RunnableDevEnvironment. This can be caused by multiple vite versions being installed in the project.`,
              )
            }

            // Extract the scripts that Vite plugins would inject into the initial HTML
            if (cachedScripts === undefined) {
              const templateHtml = `<html><head></head><body></body></html>`
              const transformedHtml = await viteDevServer.transformIndexHtml(
                req.url || '/',
                templateHtml,
              )
              const scripts = extractHtmlScripts(transformedHtml)
              globalThis.TSS_INJECTED_HEAD_SCRIPTS = scripts
                .map((script) => script.content ?? '')
                .join(';')
            }

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
  }
}

/**
 * Removes Vite internal middleware
 *
 * @param server
 */
function remove_html_middlewares(server: ViteDevServer['middlewares']) {
  const html_middlewares = [
    'viteIndexHtmlMiddleware',
    'vite404Middleware',
    'viteSpaFallbackMiddleware',
  ]
  for (let i = server.stack.length - 1; i > 0; i--) {
    if (
      html_middlewares.includes(
        // @ts-expect-error
        server.stack[i].handle.name,
      )
    ) {
      server.stack.splice(i, 1)
    }
  }
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
