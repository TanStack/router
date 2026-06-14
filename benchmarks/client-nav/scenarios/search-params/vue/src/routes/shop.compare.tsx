import * as Vue from 'vue'
import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
import {
  createCompareLoaderData,
  createCompareLoaderDeps,
  computeSearchChecksum,
  defaultCompareSearchStrip,
  formatCompareMarker,
  routeSubscriberIds,
  selectCompareLoaderDeps,
  selectCompareSearch,
  tenantSearchKeys,
  transientSearchKeys,
  validateCompareSearch,
  type CompareSearch,
} from '../../../shared'

const CompareSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: selectCompareSearch,
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const CompareLoaderDepsSubscriber = Vue.defineComponent({
  setup() {
    const loaderDeps = Route.useLoaderDeps({
      select: selectCompareLoaderDeps,
    })

    return () => {
      void computeSearchChecksum(loaderDeps.value)
      return null
    }
  },
})

const ComparePage = Vue.defineComponent({
  setup() {
    const search = Route.useSearch()
    const loaderData = Route.useLoaderData()

    return () => (
      <>
        {routeSubscriberIds.map((id) => (
          <CompareSearchSubscriber key={`compare-search-${id}`} />
        ))}
        {routeSubscriberIds.map((id) => (
          <CompareLoaderDepsSubscriber key={`compare-loader-deps-${id}`} />
        ))}
        <div data-testid="compare-marker">
          {formatCompareMarker(search.value, loaderData.value)}
        </div>
      </>
    )
  },
})

export const Route = createFileRoute('/shop/compare')({
  validateSearch: validateCompareSearch,
  search: {
    middlewares: [
      retainSearchParams<CompareSearch>(tenantSearchKeys),
      stripSearchParams<CompareSearch>(transientSearchKeys),
      stripSearchParams<CompareSearch>(defaultCompareSearchStrip),
    ],
  },
  loaderDeps: createCompareLoaderDeps,
  loader: createCompareLoaderData,
  staleTime: 60_000,
  gcTime: 60_000,
  component: ComparePage,
})
