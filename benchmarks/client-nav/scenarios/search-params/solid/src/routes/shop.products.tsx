import { For } from 'solid-js'
import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  createProductsLoaderData,
  createProductsLoaderDeps,
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
import { PerfValue } from '../perf'

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
  })

  return <PerfValue value={() => selected()} />
}

function ProductsPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: selectProductsPrimitiveSearch,
  })

  return <PerfValue value={() => selected()} />
}

function ProductsLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: selectProductsLoaderDeps,
  })

  return <PerfValue value={() => loaderDeps()} />
}

function ProductsLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: selectProductsLoaderData,
  })

  return <PerfValue value={() => loaderData()} />
}

function ProductsPage() {
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()

  return (
    <>
      <For each={routeSubscriberIds}>{() => <ProductsSearchSubscriber />}</For>
      <For each={routeSubscriberIds}>
        {() => <ProductsPrimitiveSubscriber />}
      </For>
      <For each={routeSubscriberIds}>
        {() => <ProductsLoaderDepsSubscriber />}
      </For>
      <For each={routeSubscriberIds}>
        {() => <ProductsLoaderDataSubscriber />}
      </For>
      <div data-testid="products-marker">
        {formatProductsMarker(search(), loaderData())}
      </div>
      <Outlet />
    </>
  )
}
