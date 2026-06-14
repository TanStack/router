import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateCompareSearch,
  type CompareSearch,
} from '../../../shared'

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
    select: (search) => {
      const typedSearch = search as CompareSearch

      return {
        tenant: typedSearch.tenant,
        compareIds: typedSearch.compareIds,
        slots: typedSearch.slots,
        matrix: typedSearch.matrix,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function CompareLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: (deps) => {
      const typedDeps = deps as {
        compareIds: CompareSearch['compareIds']
        slots: CompareSearch['slots']
        revision: number
      }

      return {
        compareIds: typedDeps.compareIds,
        slots: typedDeps.slots,
        revision: typedDeps.revision,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(loaderDeps)
  return null
}

function ComparePage() {
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()

  return (
    <>
      {routeSubscriberIds.map((id) => (
        <CompareSearchSubscriber key={`compare-search-${id}`} />
      ))}
      {routeSubscriberIds.map((id) => (
        <CompareLoaderDepsSubscriber key={`compare-loader-deps-${id}`} />
      ))}
      <div data-testid="compare-marker">
        {`compare:${search.tenant}:${search.compareIds.length}:${loaderData.itemCount}:${loaderData.checksum}`}
      </div>
    </>
  )
}
