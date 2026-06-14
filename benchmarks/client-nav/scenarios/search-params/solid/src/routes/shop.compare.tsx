import { For } from 'solid-js'
import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateCompareSearch,
  type CompareSearch,
} from '../../../shared'
import { PerfValue } from '../perf'

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

function CompareSearchSubscriber() {
  const selected = Route.useSearch({
    select: (search) => ({
      tenant: search.tenant,
      compareIds: search.compareIds,
      slots: search.slots,
      matrix: search.matrix,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function CompareLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: (deps) => ({
      compareIds: deps.compareIds,
      slots: deps.slots,
      revision: deps.revision,
    }),
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
        {`compare:${search().tenant}:${search().compareIds.length}:${loaderData().itemCount}:${loaderData().checksum}`}
      </div>
    </>
  )
}
