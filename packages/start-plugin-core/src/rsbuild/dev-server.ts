import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RsbuildConfig } from '@rsbuild/core'

type ServerSetupFn = Extract<
  NonNullable<NonNullable<RsbuildConfig['server']>['setup']>,
  (...args: Array<any>) => any
>
type SSRMiddleware = (
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  next: () => void,
) => Promise<void>

/**
 * Returns a `server.setup` function for rsbuild v2.
 *
 * Two middleware positions are used:
 *
 * 1. **Setup body** (BEFORE built-ins): Intercepts `/_serverFn/` URLs so
 *    they never reach rsbuild's htmlFallback/htmlCompletion middleware,
 *    which can swallow long base64 function IDs.
 *
 * 2. **Returned callback** (AFTER built-ins, BEFORE fallback): Handles
 *    all remaining SSR requests (page navigations). This position lets
 *    rsbuild's asset middleware serve compiled JS/CSS first.
 *
 * See rsbuild source: devMiddlewares.ts `applyDefaultMiddlewares()`.
 */
export function createServerSetup(opts: {
  serverFnBasePath: string
}): ServerSetupFn {
  return (context) => {
    // Only install SSR middleware in dev mode
    if (context.action !== 'dev') {
      return () => {}
    }

    const serverFnBase = opts.serverFnBasePath

    const handleSSR: SSRMiddleware = async (req, res, next) => {
      const ssrEnv =
        context.server.environments[RSBUILD_ENVIRONMENT_NAMES.server]

      if (!ssrEnv) {
        console.error(
          `[tanstack-start] SSR environment "${RSBUILD_ENVIRONMENT_NAMES.server}" not found`,
        )
        return next()
      }

      try {
        const serverEntry = await ssrEnv.loadBundle<{
          default: { fetch: (req: Request) => Promise<Response> }
        }>('index')

        // Restore the original URL (rsbuild may rewrite to /index.html)
        if (req.originalUrl) {
          req.url = req.originalUrl
        }

        const webReq = new NodeRequest({ req, res })
        const webRes = await serverEntry.default.fetch(webReq)
        return sendNodeResponse(res, webRes)
      } catch (e) {
        console.error('[tanstack-start] SSR error:', e)

        const webReq = new NodeRequest({ req, res })
        if (webReq.headers.get('content-type')?.includes('application/json')) {
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
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          )
        }

        return sendNodeResponse(
          res,
          new Response(
            `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Error</title></head>
  <body>
    <h1>Internal Server Error</h1>
    <pre>${e instanceof Error ? e.message : String(e)}</pre>
  </body>
</html>`,
            {
              status: 500,
              headers: { 'Content-Type': 'text/html' },
            },
          ),
        )
      }
    }

    // Position 1: BEFORE built-ins — intercept server function calls
    // early so they are not swallowed by htmlFallback or assetsMiddleware.
    context.server.middlewares.use(async (req, res, next) => {
      const url = req.url || '/'
      if (url.startsWith(serverFnBase)) {
        return handleSSR(req, res, next)
      }
      return next()
    })

    // Position 2: AFTER built-ins, before fallback — SSR catch-all for
    // page navigations. Assets are already handled by rsbuild middleware.
    return () => {
      context.server.middlewares.use(handleSSR)
    }
  }
}
