import { For } from 'solid-js'
import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateProductsSearch,
  type ProductsSearch,
} from '../../../shared'
import { PerfValue } from '../perf'

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
    select: (search) => ({
      filters: search.filters,
      flags: search.flags,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ProductsPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: (search) => ({
      page: search.page,
      pageSize: search.pageSize,
      sort: search.sort,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ProductsLoaderDepsSubscriber() {
  const loaderDeps = Route.useLoaderDeps({
    select: (deps) => ({
      page: deps.page,
      filters: deps.filters,
      flags: deps.flags,
    }),
  })

  return <PerfValue value={() => loaderDeps()} />
}

function ProductsLoaderDataSubscriber() {
  const loaderData = Route.useLoaderData({
    select: (data) => ({
      checksum: data.checksum,
      visibleRows: data.visibleRows,
    }),
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
        {`products:${search().tenant}:${search().page}:${search().filters.price.max}:${search().filters.attributes.color}:${loaderData().checksum}`}
      </div>
      <Outlet />
    </>
  )
}
