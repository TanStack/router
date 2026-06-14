import * as Vue from 'vue'
import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateCompareSearch,
  type CompareSearch,
} from '../../../shared'

const CompareSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: (search) => ({
        tenant: search.tenant,
        compareIds: search.compareIds,
        slots: search.slots,
        matrix: search.matrix,
      }),
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
      select: (deps) => ({
        compareIds: deps.compareIds,
        slots: deps.slots,
        revision: deps.revision,
      }),
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
          {`compare:${search.value.tenant}:${search.value.compareIds.length}:${loaderData.value.itemCount}:${loaderData.value.checksum}`}
        </div>
      </>
    )
  },
})

export const Route = createFileRoute('/shop/compare')({
  validateSearch: validateCompareSearch,
  search: {
    middlewares: [
      retainSearchParams<CompareSearch>(['tenant']),
      stripSearchParams<CompareSearch>(['debug', 'junk']),
      stripSearchParams<CompareSearch>({ includeRelated: false }),
    ],
  },
  loaderDeps: ({ search }) => ({
    tenant: search.tenant,
    compareIds: search.compareIds,
    slots: search.slots,
    matrix: search.matrix,
    revision: search.revision,
  }),
  loader: ({ deps }) => ({
    checksum: computeSearchChecksum(deps),
    itemCount: deps.compareIds.length,
  }),
  staleTime: 60_000,
  gcTime: 60_000,
  component: ComparePage,
})
