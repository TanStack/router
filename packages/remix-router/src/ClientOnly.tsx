/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import type { Handle, RemixNode } from '@remix-run/ui'

export interface ClientOnlyProps {
  children?: RemixNode
  fallback?: RemixNode
}

const isClient = typeof document !== 'undefined'

/**
 * Render `children` once the document has loaded on the client. SSR (and the
 * pre-hydration first render on the client) renders `fallback` instead.
 *
 * Mirrors `<ClientOnly>` from `@tanstack/react-router`.
 */
export function ClientOnly(handle: Handle<ClientOnlyProps>) {
  let hydrated = false
  if (isClient) {
    // Flip after the next render so we mirror React's "first render is server,
    // second is client" hydration semantics. Components that depend on us
    // re-render via this handle.update().
    handle.queueTask(() => {
      hydrated = true
      void handle.update()
    })
  }
  return ({ children, fallback }: ClientOnlyProps): RemixNode =>
    hydrated ? <>{children}</> : <>{fallback}</>
}

/**
 * Returns `true` once the component has hydrated on the client.
 *
 * Use it inside a render function — the returned value is recomputed via
 * `handle.update()` after first paint.
 */
export function useHydrated(handle: Handle<any, any>): () => boolean {
  let hydrated = false
  if (isClient) {
    handle.queueTask(() => {
      hydrated = true
      void handle.update()
    })
  }
  return () => hydrated
}
