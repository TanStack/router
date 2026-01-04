import { isRunnableDevEnvironment } from 'vite'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { ENTRY_POINTS, VITE_ENVIRONMENT_NAMES } from '../constants'
import { resolveViteId } from '../utils'
import { extractHtmlScripts } from './extract-html-scripts'
import type { Connect, DevEnvironment, PluginOption } from 'vite'
import type { TanStackStartOutputConfig } from '../schema'

export function devServerPlugin({
  getConfig,
}: {
  getConfig: () => { startConfig: TanStackStartOutputConfig }
}): PluginOption {
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
        injectedHeadScripts = scripts
          .flatMap((script) => script.content ?? [])
          .join(';')

        return () => {
          const serverEnv = viteDevServer.environments[
            VITE_ENVIRONMENT_NAMES.server
          ] as DevEnvironment | undefined

          if (!serverEnv) {
            throw new Error(
              `Server environment ${VITE_ENVIRONMENT_NAMES.server} not found`,
            )
          }
          const { startConfig } = getConfig()
          const installMiddleware = startConfig.vite?.installDevServerMiddleware
          if (installMiddleware === false) {
            return
          }
          if (installMiddleware == undefined) {
            // do not install middleware in middlewareMode by default
            if (viteDevServer.config.server.middlewareMode) {
              return
            }

            // do not install middleware if SSR env in case another plugin already did
            if (
              !isRunnableDevEnvironment(serverEnv) ||
              // do not check via `isFetchableDevEnvironment` since nitro does implement the `FetchableDevEnvironment` interface but not via inheritance (which this helper checks)
              'dispatchFetch' in serverEnv
            ) {
              return
            }
          }

          if (!isRunnableDevEnvironment(serverEnv)) {
            throw new Error(
              'cannot install vite dev server middleware for TanStack Start since the SSR environment is not a RunnableDevEnvironment',
            )
          }

          viteDevServer.middlewares.use(async (req, res) => {
            // fix the request URL to match the original URL
            // otherwise, the request URL will '/index.html'
            if (req.originalUrl) {
              req.url = req.originalUrl
            }
            const webReq = new NodeRequest({ req, res })

            try {
              // Import and resolve the request by running the server request entry point
              // this request entry point must implement the `fetch` API as follows:
              /**
               * export default {
               *  fetch(req: Request): Promise<Response>
               * }
               */
              const serverEntry = await serverEnv.runner.import(
                ENTRY_POINTS.server,
              )
              const webRes = await serverEntry['default'].fetch(webReq)

              return sendNodeResponse(res, webRes)
            } catch (e) {
              console.error(e)
              try {
                viteDevServer.ssrFixStacktrace(e as Error)
              } catch {}

              if (
                webReq.headers.get('content-type')?.includes('application/json')
              ) {
                return sendNodeResponse(
                  res,
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

              return sendNodeResponse(
                res,
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
      sharedDuringBuild: true,
      applyToEnvironment: (env) => env.config.consumer === 'server',
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
    message: `An error occurred while server rendering ${req.url}:\n\n\t${
      typeof e === 'string' ? e : e.message
    } `,
    stack: typeof e === 'string' ? '' : e.stack,
  }
}
