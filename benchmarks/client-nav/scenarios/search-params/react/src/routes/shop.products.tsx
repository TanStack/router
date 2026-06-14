import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import {
  createProductsLoaderData,
  createProductsLoaderDeps,
  computeSearchChecksum,
  defaultProductsSearchStrip,
  formatProductsMarker,
  routeSubscriberIds,
  selectProductsLoaderData,
  selectProductsLoaderDeps,
  selectProductsPrimitiveSearch,
  selectProductsSearch,
  tenantSearchKeys,
  transientSearchKeys,
  validateProductsSearch,
  type ProductsSearch,
} from '../../../shared'

export const Route = createFileRoute('/shop/products')({
  validateSearch: validateProductsSearch,
  search: {
    middlewares: [
      retainSearchParams<ProductsSearch>(tenantSearchKeys),
      stripSearchParams<ProductsSearch>(transientSearchKeys),
      stripSearchParams<ProductsSearch>(defaultProductsSearchStrip),
    ],
  },
  loaderDeps: createProductsLoaderDeps,
  loader: createProductsLoaderData,
  staleTime: 60_000,
  gcTime: 60_000,
  component: ProductsPage,
})

function ProductsSearchSubscriber() {
  const selected = Route.useSearch({
    select: selectProductsSearch,
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductsPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: selectProductsPrimitiveSearch,
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductsLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: selectProductsLoaderDeps,
    structuralSharing: true,
  })

  void computeSearchChecksum(loaderDeps)
  return null
}

function ProductsLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: selectProductsLoaderData,
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
        {formatProductsMarker(search, loaderData)}
      </div>
      <Outlet />
    </>
  )
}
