import * as Vue from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
import {
  DEFAULT_FLAGS,
  compareLinkSearch,
  computeSearchChecksum,
  initialProductsSearch,
  parseJsonSearch,
  productsLinkSearch,
  routeSubscriberIds,
  shopSubscriberIds,
  stringifyJsonSearch,
  validateCompareSearch,
  validateDetailSearch,
  validateProductsSearch,
  validateShopSearch,
  type CompareSearch,
  type DetailSearch,
  type ProductsSearch,
  type ShopSearchSchema,
} from '../../shared'

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const ShopSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = shopRoute.useSearch({
      select: (search) => ({
        tenant: search.tenant,
        locale: search.locale,
        flags: search.flags,
      }),
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const ShopPrimitiveSubscriber = Vue.defineComponent({
  setup() {
    const selected = shopRoute.useSearch({
      select: (search) => `${search.tenant}:${search.locale}`,
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const ProductsSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = productsRoute.useSearch({
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
    const selected = productsRoute.useSearch({
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
    const loaderDeps = productsRoute.useLoaderDeps({
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
    const loaderData = productsRoute.useLoaderData({
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

const DetailSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = productDetailRoute.useSearch({
      select: (search) => ({
        tenant: search.tenant,
        filters: search.filters,
        detailTab: search.detailTab,
        panel: search.panel,
      }),
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const CompareSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = compareRoute.useSearch({
      select: (search) => ({
        tenant: search.tenant,
        compareIds: search.compareIds,
        slots: search.slots,
        matrix: search.matrix,
      }),
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const CompareLoaderDepsSubscriber = Vue.defineComponent({
  setup() {
    const loaderDeps = compareRoute.useLoaderDeps({
      select: (deps) => ({
        compareIds: deps.compareIds,
        slots: deps.slots,
        revision: deps.revision,
      }),
    })

    return () => {
      void computeSearchChecksum(loaderDeps.value)
      return null
    }
  },
})

const ShopLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {shopSubscriberIds.map((id) => (
          <ShopSearchSubscriber key={`shop-search-${id}`} />
        ))}
        {shopSubscriberIds.map((id) => (
          <ShopPrimitiveSubscriber key={`shop-primitive-${id}`} />
        ))}
        <nav>
          <Link
            data-testid="products-strip-link"
            to="/shop/products"
            search={productsLinkSearch}
            replace
            activeOptions={{ includeSearch: true }}
          >
            Products stripped link
          </Link>
          <Link
            data-testid="compare-strip-link"
            to="/shop/compare"
            search={compareLinkSearch}
            replace
            activeOptions={{ includeSearch: true }}
          >
            Compare stripped link
          </Link>
        </nav>
        <Outlet />
      </>
    )
  },
})

const ProductsPage = Vue.defineComponent({
  setup() {
    const search = productsRoute.useSearch()
    const loaderData = productsRoute.useLoaderData()

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

const ProductDetailPage = Vue.defineComponent({
  setup() {
    const params = productDetailRoute.useParams()
    const search = productDetailRoute.useSearch()

    return () => (
      <>
        {routeSubscriberIds.map((id) => (
          <DetailSearchSubscriber key={`detail-search-${id}`} />
        ))}
        <div data-testid="detail-marker">
          {`detail:${params.value.productId}:${search.value.tenant}:${search.value.detailTab}:${search.value.panel}`}
        </div>
      </>
    )
  },
})

const ComparePage = Vue.defineComponent({
  setup() {
    const search = compareRoute.useSearch()
    const loaderData = compareRoute.useLoaderData()

    return () => (
      <>
        {routeSubscriberIds.map((id) => (
          <CompareSearchSubscriber key={`compare-search-${id}`} />
        ))}
        {routeSubscriberIds.map((id) => (
          <CompareLoaderDepsSubscriber key={`compare-loader-deps-${id}`} />
        ))}
        <div data-testid="compare-marker">
          {`compare:${search.value.tenant}:${search.value.compareIds.length}:${loaderData.value.itemCount}:${loaderData.value.checksum}`}
        </div>
      </>
    )
  },
})

const rootRoute = createRootRoute({
  component: Root,
})

const shopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shop',
  validateSearch: validateShopSearch,
  search: {
    middlewares: [
      retainSearchParams<ShopSearchSchema>(['tenant']),
      stripSearchParams<ShopSearchSchema>(['debug', 'junk']),
      stripSearchParams<ShopSearchSchema>({ flags: DEFAULT_FLAGS }),
    ],
  },
  component: ShopLayout,
})

const productsRoute = createRoute({
  getParentRoute: () => shopRoute,
  path: 'products',
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

const productDetailRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: '$productId',
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(['debug', 'junk'])],
  },
  component: ProductDetailPage,
})

const compareRoute = createRoute({
  getParentRoute: () => shopRoute,
  path: 'compare',
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

export function mountTestApp(container: HTMLDivElement) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [
        `/shop/products${stringifyJsonSearch(initialProductsSearch)}`,
      ],
    }),
    parseSearch: parseJsonSearch,
    stringifySearch: stringifyJsonSearch,
    search: { strict: true },
    routeTree: rootRoute.addChildren([
      shopRoute.addChildren([
        productsRoute.addChildren([productDetailRoute]),
        compareRoute,
      ]),
    ]),
  })

  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
