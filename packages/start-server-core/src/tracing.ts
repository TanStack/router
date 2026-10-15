import { createTracingChannel } from '@tanstack/router-core/ssr/server'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

/**
 * Context published on `@tanstack/start:request` for each request middleware,
 * route handler and server function call.
 */
export interface RequestTraceContext {
  type: 'middleware' | 'handler' | 'server_function'
  name: string
  request: Request
  /** The pipeline context: `pathname`, `context`, `params` and `response`. */
  ctx: Record<string, unknown>
  result?: unknown
  error?: unknown
}

/**
 * Context published on `@tanstack/start:render` for each SSR document render.
 */
export interface RenderTraceContext {
  request: Request
  matchedRoutes: ReadonlyArray<AnyRoute>
  router: AnyRouter
  result?: unknown
  error?: unknown
}

/**
 * Traces request middleware, route handlers and server functions.
 */
export const requestChannel = createTracingChannel<RequestTraceContext>(
  '@tanstack/start:request',
)

/**
 * Traces the SSR document render of a page request.
 */
export const renderChannel = createTracingChannel<RenderTraceContext>(
  '@tanstack/start:render',
)
