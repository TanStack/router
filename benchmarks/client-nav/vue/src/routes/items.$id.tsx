import * as Vue from 'vue'
import { Link, Outlet, createFileRoute } from '@tanstack/vue-router'
import {
  noop,
  normalizePage,
  routeSelectors,
  runPerfSelectorComputation,
} from '../shared'

export const ItemParamsSubscriber = Vue.defineComponent({
  setup() {
    const params = Route.useParams({
      select: (params) => runPerfSelectorComputation(params.id),
    })

    return () => {
      void runPerfSelectorComputation(params.value)
      return null
    }
  },
})

const ItemsPage = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {routeSelectors.map((selector) => (
          <ItemParamsSubscriber key={`item-params-${selector}`} />
        ))}
        <Link
          data-testid="items-details"
          from={Route.fullPath}
          to="./details"
          replace
        >
          Details
        </Link>
        <Link
          from={Route.fullPath}
          to="."
          search={true}
          activeOptions={{ includeSearch: true }}
        >
          Preserve search on item
        </Link>
        <Outlet />
      </>
    )
  },
})

export const Route = createFileRoute('/items/$id')({
  params: {
    parse: (params) => ({
      ...params,
      id: normalizePage(params.id),
    }),
    stringify: (params) => ({
      ...params,
      id: `${params.id}`,
    }),
  },
  onEnter: noop,
  onStay: noop,
  onLeave: noop,
  component: ItemsPage,
})
