// SSR dev server, middleware and error page source modified from
// https://github.com/solidjs/solid-start/blob/main/packages/start/dev/server.js

import { createEvent, getHeader, sendWebResponse } from 'h3'
import { isRunnableDevEnvironment } from 'vite'
import { __internal_devHtmlUtils } from '@tanstack/router-core'
import type { ExtractedHtmlTagInfo } from '@tanstack/router-core'
import type { Connect, Environment, Plugin, ViteDevServer } from 'vite'
import type { TanStackStartOutputConfig } from '../schema.js'

declare global {
  // eslint-disable-next-line no-var
  var TSS_INJECTED_HEAD_SCRIPTS_INFO: Array<ExtractedHtmlTagInfo> | undefined
}

export function devServerPlugin(options: TanStackStartOutputConfig): Plugin {
  // let config: UserConfig
  let isTest = false

  return {
    name: 'start-dev-ssr-plugin',
    config(userConfig, { mode }) {
      // config = userConfig
      isTest = isTest ? isTest : mode === 'test'

      return {
        resolve: {
          alias: {
            '/~start/ssr-entry': options.serverEntryPath,
          },
        },
      }
    },
    configureServer(viteDevServer) {
      if (isTest) {
        return
      }

      ;(globalThis as any).viteDevServer = viteDevServer

      return () => {
        remove_html_middlewares(viteDevServer.middlewares)

        viteDevServer.middlewares.use(async (req, res) => {
          const event = createEvent(req, res)
          const serverEnv = viteDevServer.environments['server'] as Environment

          try {
            if (!isRunnableDevEnvironment(serverEnv)) {
              throw new Error('Server environment not found')
            }

            const templateHtml = `<html><head></head><body></body></html>`
            const transformedHtml = await viteDevServer.transformIndexHtml(
              req.url || '/',
              templateHtml,
            )

            const headScripts = __internal_devHtmlUtils.extractHtmlTagInfo(
              'script',
              __internal_devHtmlUtils.extractHeadContent(transformedHtml),
            )
            globalThis.TSS_INJECTED_HEAD_SCRIPTS_INFO = headScripts

            const serverEntry =
              await serverEnv.runner.import('/~start/ssr-entry')

            const response = await serverEntry['default'](event)

            sendWebResponse(event, response)
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

            sendWebResponse(
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
