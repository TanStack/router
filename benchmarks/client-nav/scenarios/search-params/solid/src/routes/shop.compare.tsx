import { For } from 'solid-js'
import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  createCompareLoaderData,
  createCompareLoaderDeps,
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
import { PerfValue } from '../perf'

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

function CompareSearchSubscriber() {
  const selected = Route.useSearch({
    select: selectCompareSearch,
  })

  return <PerfValue value={() => selected()} />
}

function CompareLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: selectCompareLoaderDeps,
  })

  return <PerfValue value={() => loaderDeps()} />
}

function ComparePage() {
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={routeSubscriberIds}>{() => <CompareSearchSubscriber />}</For>
      <For each={routeSubscriberIds}>
        {() => <CompareLoaderDepsSubscriber />}
      </For>
      <div data-testid="compare-marker">
        {formatCompareMarker(search(), loaderData())}
      </div>
    </>
  )
}
