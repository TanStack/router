import * as Vue from 'vue'
import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateProductsSearch,
  type ProductsSearch,
} from '../../../shared'

const ProductsSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: (search) => ({
        filters: search.filters,
        flags: search.flags,
      }),
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const ProductsPrimitiveSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: (search) => ({
        page: search.page,
        pageSize: search.pageSize,
        sort: search.sort,
      }),
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const ProductsLoaderDepsSubscriber = Vue.defineComponent({
  setup() {
    const loaderDeps = Route.useLoaderDeps({
      select: (deps) => ({
        page: deps.page,
        filters: deps.filters,
        flags: deps.flags,
      }),
    })

    return () => {
      void computeSearchChecksum(loaderDeps.value)
      return null
    }
  },
})

const ProductsLoaderDataSubscriber = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData({
      select: (data) => ({
        checksum: data.checksum,
        visibleRows: data.visibleRows,
      }),
    })

    return () => {
      void computeSearchChecksum(loaderData.value)
      return null
    }
  },
})

const ProductsPage = Vue.defineComponent({
  setup() {
    const search = Route.useSearch()
    const loaderData = Route.useLoaderData()

    return () => (
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
          {`products:${search.value.tenant}:${search.value.page}:${search.value.filters.price.max}:${search.value.filters.attributes.color}:${loaderData.value.checksum}`}
        </div>
        <Outlet />
      </>
    )
  },
})

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
