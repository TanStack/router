import { Fragment } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createCoreSsrQueryPlugin } from '@tanstack/router-ssr-query-core'
import type {
  RouterSsrQueryOptions,
  SsrQueryPluginOptions,
} from '@tanstack/router-ssr-query-core'
import type { AnyRouter, RouterPlugin } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export type Options<TRouter extends AnyRouter> =
  RouterSsrQueryOptions<TRouter> & {
    wrapQueryClient?: boolean
  }

export type SsrQueryPluginReactOptions = SsrQueryPluginOptions & {
  /**
   * If `false`, the plugin will not wrap the router with `QueryClientProvider`.
   * Useful if you are already providing the QueryClient via a parent provider.
   *
   * @default true
   */
  wrapQueryClient?: boolean
}

/**
 * Create a router plugin that integrates TanStack Query with SSR for React.
 *
 * The plugin contributes `{ queryClient: QueryClient }` to the router context,
 * sets up dehydrate/hydrate for SSR, and wraps the app with `QueryClientProvider`.
 *
 * @example
 * ```tsx
 * const queryClient = new QueryClient()
 * const ssrQueryPlugin = createSsrQueryPlugin({ queryClient })
 *
 * const router = createRouter({
 *   routeTree,
 *   plugins: [ssrQueryPlugin],
 * })
 * ```
 */
export function createSsrQueryPlugin(
  opts: SsrQueryPluginReactOptions,
): RouterPlugin<{ queryClient: QueryClient }> {
  const corePlugin = createCoreSsrQueryPlugin(opts)

  return {
    '~types': null as any,
    setup: (router: AnyRouter) => {
      corePlugin.setup(router)

      if (opts.wrapQueryClient === false) {
        return
      }

      const OGWrap = router.options.Wrap || Fragment

      router.options.Wrap = ({ children }) => {
        return (
          <QueryClientProvider client={opts.queryClient}>
            <OGWrap>{children}</OGWrap>
          </QueryClientProvider>
        )
      }
    },
  }
}

/**
 * @deprecated Use `createSsrQueryPlugin` instead. This function will be removed in a future version.
 */
export function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(
  opts: Options<TRouter>,
) {
  createSsrQueryPlugin({
    queryClient: opts.queryClient,
    handleRedirects: opts.handleRedirects,
    wrapQueryClient: opts.wrapQueryClient,
  }).setup(opts.router)
}
