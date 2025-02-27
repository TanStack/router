// SSR dev server, middleware and error page source modified from
// https://github.com/solidjs/solid-start/blob/main/packages/start/dev/server.js

import { createEvent, sendWebResponse } from 'h3'

import { registerDevServerMiddleware } from '../utils/register-dev-middleware.js'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import type { TanStackStartOutputConfig } from '../../schema.js'

export function devServerPlugin(options: TanStackStartOutputConfig): Plugin {
  // let config: UserConfig
  let isTest = false

  return {
    name: 'startjs-dev-ssr-plugin',
    config(userConfig, { mode }) {
      // config = userConfig
      isTest = isTest ? isTest : mode === 'test'

      return {
        resolve: {
          alias: {
            '~start/ssr-entry': options.ssrEntryPath,
          },
        },
      }
    },
    configureServer(viteServer) {
      if (isTest) {
        return
      }

      return () => {
        remove_html_middlewares(viteServer.middlewares)
        registerDevServerMiddleware(options.root, viteServer)

        viteServer.middlewares.use(async (req, res) => {
          try {
            const serverEntry = (
              await viteServer.ssrLoadModule('~start/ssr-entry')
            )['default']

            const event = createEvent(req, res)
            const result: string | Response = await serverEntry(event)

            if (result instanceof Response) {
              sendWebResponse(event, result)
              return
            }
            res.setHeader('Content-Type', 'text/html')
            res.end(result)
          } catch (e) {
            viteServer.ssrFixStacktrace(e as Error)
            res.statusCode = 500
            res.end(`
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
            `)
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
