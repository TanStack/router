import * as Vue from 'vue'
import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
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

const ProductsSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: selectProductsSearch,
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
      select: selectProductsPrimitiveSearch,
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
      select: selectProductsLoaderDeps,
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
      select: selectProductsLoaderData,
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
          {formatProductsMarker(search.value, loaderData.value)}
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
