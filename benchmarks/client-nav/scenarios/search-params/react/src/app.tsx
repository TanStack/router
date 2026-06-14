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
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
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

function Root() {
  return <Outlet />
}

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

function ShopSearchSubscriber() {
  const selected = shopRoute.useSearch({
    select: (search) => {
      const typedSearch = search as ShopSearchSchema

      return {
        tenant: typedSearch.tenant,
        locale: typedSearch.locale,
        flags: typedSearch.flags,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ShopPrimitiveSubscriber() {
  const selected = shopRoute.useSearch({
    select: (search) => `${search.tenant}:${search.locale}`,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductsSearchSubscriber() {
  const selected = productsRoute.useSearch({
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
  const selected = productsRoute.useSearch({
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
  const loaderDeps = productsRoute.useLoaderDeps({
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
  const loaderData = productsRoute.useLoaderData({
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

function DetailSearchSubscriber() {
  const selected = productDetailRoute.useSearch({
    select: (search) => {
      const typedSearch = search as DetailSearch

      return {
        tenant: typedSearch.tenant,
        filters: typedSearch.filters,
        detailTab: typedSearch.detailTab,
        panel: typedSearch.panel,
      }
    },
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function CompareSearchSubscriber() {
  const selected = compareRoute.useSearch({
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
  const loaderDeps = compareRoute.useLoaderDeps({
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

function ShopLayout() {
  return (
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
}

function ProductsPage() {
  const search = productsRoute.useSearch()
  const loaderData = productsRoute.useLoaderData()

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

function ProductDetailPage() {
  const params = productDetailRoute.useParams()
  const search = productDetailRoute.useSearch()

  return (
    <>
      {routeSubscriberIds.map((id) => (
        <DetailSearchSubscriber key={`detail-search-${id}`} />
      ))}
      <div data-testid="detail-marker">
        {`detail:${params.productId}:${search.tenant}:${search.detailTab}:${search.panel}`}
      </div>
    </>
  )
}

function ComparePage() {
  const search = compareRoute.useSearch()
  const loaderData = compareRoute.useLoaderData()

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

  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
