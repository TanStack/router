import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateProductsSearch,
  type ProductsSearch,
} from '../../../shared'

export const Route = createFileRoute('/shop/products')({
  validateSearch: validateProductsSearch,
  search: {
    middlewares: [
      retainSearchParams<ProductsSearch>(['tenant']),
      stripSearchParams<ProductsSearch>(['debug', 'junk']),
      stripSearchParams<ProductsSearch>({ view: 'grid' }),
    ],
  },
  loaderDeps: ({ search }) => ({
    tenant: search.tenant,
    locale: search.locale,
    page: search.page,
    pageSize: search.pageSize,
    sort: search.sort,
    filters: search.filters,
    flags: search.flags,
  }),
  loader: ({ deps }) => ({
    checksum: computeSearchChecksum(deps),
    visibleRows: deps.page * deps.pageSize,
  }),
  staleTime: 60_000,
  gcTime: 60_000,
  component: ProductsPage,
})

function ProductsSearchSubscriber() {
  const selected = Route.useSearch({
    select: (search) => {
      const typedSearch = search as ProductsSearch

      return {
        filters: typedSearch.filters,
        flags: typedSearch.flags,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductsPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: (search) => {
      const typedSearch = search as ProductsSearch

      return {
        page: typedSearch.page,
        pageSize: typedSearch.pageSize,
        sort: typedSearch.sort,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductsLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: (deps) => {
      const typedDeps = deps as {
        page: number
        filters: ProductsSearch['filters']
        flags: ProductsSearch['flags']
      }

      return {
        page: typedDeps.page,
        filters: typedDeps.filters,
        flags: typedDeps.flags,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(loaderDeps)
  return null
}

function ProductsLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => {
      const typedData = data as { checksum: number; visibleRows: number }

      return {
        checksum: typedData.checksum,
        visibleRows: typedData.visibleRows,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(loaderData)
  return null
}

function ProductsPage() {
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()

  return (
    <>
      {routeSubscriberIds.map((id) => (
        <ProductsSearchSubscriber key={`products-search-${id}`} />
      ))}
      {routeSubscriberIds.map((id) => (
        <ProductsPrimitiveSubscriber key={`products-primitive-${id}`} />
      ))}
      {routeSubscriberIds.map((id) => (
        <ProductsLoaderDepsSubscriber key={`products-loader-deps-${id}`} />
      ))}
      {routeSubscriberIds.map((id) => (
        <ProductsLoaderDataSubscriber key={`products-loader-data-${id}`} />
      ))}
      <div data-testid="products-marker">
        {`products:${search.tenant}:${search.page}:${search.filters.price.max}:${search.filters.attributes.color}:${loaderData.checksum}`}
      </div>
      <Outlet />
    </>
  )
}
