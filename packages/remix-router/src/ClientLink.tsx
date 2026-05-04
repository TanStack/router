/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { clientEntry, on } from '@remix-run/ui'
import { isDangerousProtocol } from '@tanstack/router-core'
import { getActiveRouter } from './activeRouter'
import type { EntryComponent, Handle, RemixNode } from '@remix-run/ui'

/**
 * Subset of `LinkComponentProps<'a'>` that's safe to JSON-serialize for
 * client-entry hydration. Drops callback props and the
 * `_fromLocation` / `unsafeRelative` low-level options.
 */
export interface ClientLinkProps {
  to: string
  params?: Record<string, unknown>
  search?: Record<string, unknown>
  hash?: string
  replace?: boolean
  resetScroll?: boolean
  viewTransition?: boolean
  preload?: 'intent' | 'render' | 'viewport' | false
  target?: string
  class?: string
  className?: string
  children?: RemixNode
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}

/**
 * Selectively-hydrated link.
 *
 * Marked with `clientEntry()` so the SSR pipeline emits a hydration
 * marker (`<!-- rmx:h:hN -->`) and serializes the props as JSON; the
 * client runtime imports the entry module, reads the props, and mounts
 * just this component without hydrating the rest of the page.
 *
 * Trade-offs vs. {@link Link}:
 *
 * - **Smaller client bundle**: only the ClientLink module + its deps
 *   ship to the browser. The route tree, loaders, and most of the
 *   binding don't need to be hydrated.
 * - **Restricted prop set**: callbacks (`onClick`, `onFocus`, etc.) and
 *   `activeProps`/`inactiveProps`-as-functions can't be JSON-serialized.
 *   Use the regular `<Link>` if you need those.
 * - **Active state is client-only**: SSR can't compute it without the
 *   match tree, so the SSR'd HTML doesn't include `data-status="active"`
 *   until hydration runs. Use a CSS-only `:has()` selector if you need
 *   active styling without JS.
 *
 * Required setup: call `setActiveRouter(router)` (or use `mountRouter`)
 * on the client before any ClientLink hydrates.
 */
export const ClientLink: EntryComponent = clientEntry(
  '@tanstack/remix-router/ClientLink#ClientLink',
  function ClientLink(handle: Handle<any>) {
    return (rawProps: any): RemixNode => {
      const props = rawProps as ClientLinkProps
      void handle
      const router = (() => {
        try {
          return getActiveRouter()
        } catch {
          return undefined
        }
      })()

      // Build the href without subscribing to anything — ClientLink is
      // statically rendered by SSR; the client runtime hydrates it once
      // and only re-renders on prop changes.
      const built = router?.buildLocation({
        to: props.to,
        params: props.params as any,
        search: props.search as any,
        hash: props.hash,
      } as any)

      const href = (() => {
        if (!built) return props.to
        const display = built.maskedLocation ?? built
        const url = display.publicHref
        const external = display.external
        if (external) {
          if (isDangerousProtocol(url, router!.protocolAllowlist)) return undefined
          return url
        }
        return router!.history.createHref(url) || '/'
      })()

      function handleClick(e: MouseEvent) {
        if (!router) return
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (props.target && props.target !== '_self')
        ) {
          return
        }
        e.preventDefault()
        void router.navigate({
          to: props.to,
          params: props.params as any,
          search: props.search as any,
          hash: props.hash,
          replace: props.replace,
          resetScroll: props.resetScroll,
          viewTransition: props.viewTransition,
        } as any)
      }

      function handlePointerEnter() {
        if (!router) return
        if (props.preload === 'intent' || props.preload === undefined) {
          void router
            .preloadRoute({
              to: props.to,
              params: props.params as any,
              search: props.search as any,
            } as any)
            .catch(() => {})
        }
      }

      const { children, to, params, search, hash, replace, resetScroll,
        viewTransition, preload, ...rest } = props

      return (
        <a
          href={href}
          mix={[
            on<HTMLAnchorElement, 'click'>('click', handleClick),
            on<HTMLAnchorElement, 'pointerenter'>('pointerenter', handlePointerEnter),
          ]}
          {...(rest as any)}
        >
          {children}
        </a>
      )
    }
  },
)
