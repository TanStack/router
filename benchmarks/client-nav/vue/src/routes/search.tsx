import * as Vue from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import {
  normalizeFilter,
  normalizePage,
  routeSelectors,
  runPerfSelectorComputation,
} from '../shared'

const SearchStateSubscriber = Vue.defineComponent({
  setup() {
    const search = Route.useSearch({
      select: (search) =>
        runPerfSelectorComputation(search.page + search.filter.length),
    })

    return () => {
      void runPerfSelectorComputation(search.value)
      return null
    }
  },
})

const SearchLoaderDepsSubscriber = Vue.defineComponent({
  setup() {
    const loaderDeps = Route.useLoaderDeps({
      select: (loaderDeps) =>
        runPerfSelectorComputation(loaderDeps.page + loaderDeps.filter.length),
    })

    return () => {
      void runPerfSelectorComputation(loaderDeps.value)
      return null
    }
  },
})

const SearchLoaderDataSubscriber = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData({
      select: (loaderData) =>
        runPerfSelectorComputation(loaderData.seed + loaderData.checksum),
    })

    return () => {
      void runPerfSelectorComputation(loaderData.value)
      return null
    }
  },
})

const SearchPage = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {routeSelectors.map((selector) => (
          <SearchStateSubscriber key={`search-state-${selector}`} />
        ))}
        {routeSelectors.map((selector) => (
          <SearchLoaderDepsSubscriber key={`search-loader-deps-${selector}`} />
        ))}
        {routeSelectors.map((selector) => (
          <SearchLoaderDataSubscriber key={`search-loader-data-${selector}`} />
        ))}
        <Link
          data-testid="search-next-page"
          from={Route.fullPath}
          to="."
          replace
          search={(prev: { page: number; filter: string }) => ({
            page: prev.page + 1,
            filter: prev.filter,
            junk: 'local-updater',
          })}
          activeOptions={{ includeSearch: true }}
          activeProps={{ class: 'active-link' }}
          inactiveProps={{ class: 'inactive-link' }}
        >
          Next page
        </Link>
      </>
    )
  },
})

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: normalizePage(search.page),
    filter: normalizeFilter(search.filter),
  }),
  search: {
    middlewares: [
      ({ search, next }) => {
        const result = next(search)
        return {
          page: result.page,
          filter: result.filter,
        }
      },
    ],
  },
  loaderDeps: ({ search }) => ({
    page: search.page,
    filter: search.filter,
  }),
  loader: ({ deps }) => ({
    seed: deps.page * 31 + deps.filter.length,
    checksum: deps.page * 17 + deps.filter.length,
  }),
  staleTime: 60_000,
  gcTime: 60_000,
  component: SearchPage,
})
