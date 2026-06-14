import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import {
  PerfValue,
  normalizeFilter,
  normalizePage,
  routeSelectors,
  runPerfSelectorComputation,
} from '../shared'

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

function SearchStateSubscriber() {
  const search = Route.useSearch({
    select: (search) =>
      runPerfSelectorComputation(search.page + search.filter.length),
  })

  return <PerfValue value={() => runPerfSelectorComputation(search())} />
}

function SearchLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: (loaderDeps) =>
      runPerfSelectorComputation(loaderDeps.page + loaderDeps.filter.length),
  })

  return <PerfValue value={() => runPerfSelectorComputation(loaderDeps())} />
}

function SearchLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (loaderData) =>
      runPerfSelectorComputation(loaderData.seed + loaderData.checksum),
  })

  return <PerfValue value={() => runPerfSelectorComputation(loaderData())} />
}

function SearchPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <SearchStateSubscriber />}</For>
      <For each={routeSelectors}>{() => <SearchLoaderDepsSubscriber />}</For>
      <For each={routeSelectors}>{() => <SearchLoaderDataSubscriber />}</For>
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
}
