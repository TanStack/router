import { handleServerAction } from '@tanstack/start-server-core'
import { createRouterHandler } from '@tanstack/remix-router/server'
import type {
  CreateRouterHandlerOptions,
  RouterRequestHandler,
} from '@tanstack/remix-router/server'

const SERVER_FN_BASE =
  (typeof process !== 'undefined' && process.env.TSS_SERVER_FN_BASE) ||
  '/_serverFn'

export interface CreateStartHandlerOptions extends CreateRouterHandlerOptions {
  /**
   * Base path under which `createServerFn`-generated handlers are exposed.
   * Defaults to `process.env.TSS_SERVER_FN_BASE` or `'/_serverFn'`.
   *
   * The handler routes `${serverFnBase}/<id>` to `handleServerAction`
   * from `@tanstack/start-server-core`; everything else falls through
   * to the TSR app handler. Server-fn URLs are also valid `<Frame src>`
   * targets — the default `resolveFrame` recurses through this same
   * handler, so a frame whose `src` lives under `serverFnBase` resolves
   * via the server-action runtime automatically.
   */
  serverFnBase?: string
  /**
   * Optional context passed to every server function invocation. Same
   * shape as the React/Solid Start handler — typically populated by
   * upstream middleware (sessions, auth, etc.) before the handler runs.
   */
  serverFnContext?: () => Record<string, unknown>
}

/**
 * Plain `(request: Request) => Promise<Response>` handler returned by
 * {@link createStartHandler}.
 */
export type StartRequestHandler = RouterRequestHandler

/**
 * Build the Start handler — a single `(Request) => Promise<Response>`
 * that dispatches:
 *
 * 1. `${serverFnBase}/<id>` requests to `handleServerAction` from
 *    `@tanstack/start-server-core` (the framework-agnostic RPC runtime).
 * 2. Everything else to `createRouterHandler` from
 *    `@tanstack/remix-router/server` — which loads matches, SSRs the
 *    tree through `@remix-run/ui`, and emits the dehydration payload.
 *
 * The handler doesn't assume a particular HTTP shell. Wire it up
 * however your deployment adapter prefers (Node `http`, Bun, Cloudflare,
 * Deno, nitro, …):
 *
 * ```ts
 * import { createServer } from 'node:http'
 * import { createStartHandler } from '@tanstack/remix-start/server'
 * import { router } from './app/router'
 *
 * const handler = createStartHandler({ createRouter: () => router })
 *
 * createServer(async (req, res) => {
 *   const request = toWebRequest(req)
 *   const response = await handler(request)
 *   sendResponse(res, response)
 * }).listen(3000)
 * ```
 *
 * `<Frame>` SSR works out of the box — the underlying router handler's
 * default `resolveFrame` dispatches the frame's `src` back through
 * *this* handler so server-fn URLs and route URLs both resolve as frame
 * sources without extra config. Override via `opts.resolveFrame` to
 * route some sources elsewhere.
 *
 * If you also want pieces of Remix 3's modular toolkit (sessions,
 * forms, file storage, CSRF), compose them around this handler at the
 * app layer — they're just `(Request) => Response` middleware too.
 */
export function createStartHandler(
  opts: CreateStartHandlerOptions,
): StartRequestHandler {
  const tsrHandler = createRouterHandler(opts)
  const serverFnBase = opts.serverFnBase ?? SERVER_FN_BASE
  const prefix = serverFnBase.endsWith('/') ? serverFnBase : `${serverFnBase}/`

  const startHandler: StartRequestHandler = async function startHandler(context) {
    const request: Request =
      context instanceof Request
        ? context
        : (context as { request: Request }).request
    const url = new URL(request.url)

    if (url.pathname.startsWith(prefix)) {
      const serverFnId = url.pathname.slice(prefix.length)
      const ctx = opts.serverFnContext?.() ?? {}
      return handleServerAction({
        request,
        context: ctx,
        serverFnId,
      } as any)
    }

    return tsrHandler(context)
  }

  return startHandler
}
