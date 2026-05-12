/**
 * Server-side SSR exports. Mirrors `@tanstack/react-router/ssr/server` /
 * `@tanstack/solid-router/ssr/server`.
 *
 * Two layers:
 *
 * - **Render primitives** — `renderRouterToStream` (streaming) and
 *   `renderRouterToString` (non-streaming) take `{ request?, router,
 *   responseHeaders, children }` and produce a Response. Suitable for
 *   composing into custom `defineHandlerCallback`-shaped handlers.
 * - **Default handlers** — `defaultStreamHandler` and
 *   `defaultRenderHandler` are pre-composed callbacks that wrap the
 *   above primitives with `<RouterServer>` (a minimal
 *   `<RouterProvider>` wrapper). Drop these into Start's
 *   `createStartHandler`.
 *
 * Plus the Remix-specific `createRouterHandler` — a single-shot
 * `(Request) => Response` that owns the full lifecycle (history,
 * attach, load, dehydrate, render). For apps that don't want the
 * Start plugin pipeline.
 *
 * `<Frame>` SSR works through the Remix UI runtime by default; pass
 * `resolveFrame` on `createRouterHandler` to wire frame URLs through a
 * composed handler.
 */
export * from '@tanstack/router-core/ssr/server'
export { createRouterHandler } from '../server'
export type {
  CreateRouterHandlerOptions,
  RouterRequestHandler,
  ResolveFrameContext,
  ServerResolveFrame,
} from '../server'
export { renderRouterToStream } from './renderRouterToStream'
export { renderRouterToString } from './renderRouterToString'
export { defaultStreamHandler } from './defaultStreamHandler'
export { defaultRenderHandler } from './defaultRenderHandler'
export { RouterServer } from './RouterServer'
