import {
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
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
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function CompareLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: selectCompareLoaderDeps,
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
        {formatCompareMarker(search, loaderData)}
      </div>
    </>
  )
}
