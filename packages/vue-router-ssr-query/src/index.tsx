import * as Vue from 'vue'
import { createCoreSsrQueryPlugin } from '@tanstack/router-ssr-query-core'
import type {
  RouterSsrQueryOptions,
  SsrQueryPluginOptions,
} from '@tanstack/router-ssr-query-core'
import type { AnyRouter, RouterPlugin } from '@tanstack/vue-router'
import type { QueryClient } from '@tanstack/vue-query'

// Vue Query uses this string as the injection key
const VUE_QUERY_CLIENT = 'VUE_QUERY_CLIENT'

export type Options<TRouter extends AnyRouter> =
  RouterSsrQueryOptions<TRouter> & {
    wrapQueryClient?: boolean
  }

export type SsrQueryPluginVueOptions = SsrQueryPluginOptions & {
  /**
   * If `false`, the plugin will not wrap the router with the Vue Query provider.
   * Useful if you are already providing the QueryClient via a parent provider.
   *
   * @default true
   */
  wrapQueryClient?: boolean
}

/**
 * Create a router plugin that integrates TanStack Query with SSR for Vue.
 *
 * The plugin contributes `{ queryClient: QueryClient }` to the router context,
 * sets up dehydrate/hydrate for SSR, and provides the QueryClient via Vue's injection system.
 *
 * @example
 * ```ts
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
  opts: SsrQueryPluginVueOptions,
): RouterPlugin<{ queryClient: QueryClient }> {
  const corePlugin = createCoreSsrQueryPlugin(opts)

  return {
    '~types': null as any,
    setup: (router: AnyRouter) => {
      corePlugin.setup(router)

      if (opts.wrapQueryClient === false) {
        return
      }

      const OGWrap = router.options.Wrap

      router.options.Wrap = Vue.defineComponent({
        name: 'QueryClientWrapper',
        setup(_, { slots }) {
          Vue.provide(VUE_QUERY_CLIENT, opts.queryClient)
          return () => {
            const children = slots.default?.()
            if (OGWrap) {
              return Vue.h(OGWrap, null, () => children)
            }
            return children
          }
        },
      }) as any
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
