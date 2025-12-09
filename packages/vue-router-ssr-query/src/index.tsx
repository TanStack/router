import * as Vue from 'vue'
import { setupCoreRouterSsrQueryIntegration } from '@tanstack/router-ssr-query-core'
import type { RouterSsrQueryOptions } from '@tanstack/router-ssr-query-core'
import type { AnyRouter } from '@tanstack/vue-router'
import type { QueryClient } from '@tanstack/query-core'

// Vue Query uses this string as the injection key
const VUE_QUERY_CLIENT = 'VUE_QUERY_CLIENT'

export type Options<TRouter extends AnyRouter> =
  RouterSsrQueryOptions<TRouter> & {
    wrapQueryClient?: boolean
  }

export function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(
  opts: Options<TRouter>,
) {
  setupCoreRouterSsrQueryIntegration(opts)

  if (opts.wrapQueryClient === false) {
    return
  }

  const OGWrap =
    opts.router.options.Wrap || ((props: { children: any }) => props.children)

  opts.router.options.Wrap = (props) => {
    return Vue.h(QueryClientProvider, { client: opts.queryClient }, () =>
      Vue.h(OGWrap, null, () => props.children),
    )
  }
}

const QueryClientProvider = Vue.defineComponent({
  name: 'QueryClientProvider',
  props: {
    client: {
      type: Object as () => QueryClient,
      required: true,
    },
  },
  setup(props, { slots }) {
    Vue.provide(VUE_QUERY_CLIENT, props.client)
    return () => slots.default?.()
  },
})
