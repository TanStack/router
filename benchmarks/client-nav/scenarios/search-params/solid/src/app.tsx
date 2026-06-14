import { For, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
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
} from '@tanstack/solid-router'
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

function PerfValue(props: { value: () => unknown }) {
  createRenderEffect(() => {
    void computeSearchChecksum(props.value())
  })

  return null
}

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
    select: (search) => ({
      tenant: search.tenant,
      locale: search.locale,
      flags: search.flags,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ShopPrimitiveSubscriber() {
  const selected = shopRoute.useSearch({
    select: (search) => `${search.tenant}:${search.locale}`,
  })

  return <PerfValue value={() => selected()} />
}

function ProductsSearchSubscriber() {
  const selected = productsRoute.useSearch({
    select: (search) => ({
      filters: search.filters,
      flags: search.flags,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ProductsPrimitiveSubscriber() {
  const selected = productsRoute.useSearch({
    select: (search) => ({
      page: search.page,
      pageSize: search.pageSize,
      sort: search.sort,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ProductsLoaderDepsSubscriber() {
  const loaderDeps = productsRoute.useLoaderDeps({
    select: (deps) => ({
      page: deps.page,
      filters: deps.filters,
      flags: deps.flags,
    }),
  })

  return <PerfValue value={() => loaderDeps()} />
}

function ProductsLoaderDataSubscriber() {
  const loaderData = productsRoute.useLoaderData({
    select: (data) => ({
      checksum: data.checksum,
      visibleRows: data.visibleRows,
    }),
  })

  return <PerfValue value={() => loaderData()} />
}

function DetailSearchSubscriber() {
  const selected = productDetailRoute.useSearch({
    select: (search) => ({
      tenant: search.tenant,
      filters: search.filters,
      detailTab: search.detailTab,
      panel: search.panel,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function CompareSearchSubscriber() {
  const selected = compareRoute.useSearch({
    select: (search) => ({
      tenant: search.tenant,
      compareIds: search.compareIds,
      slots: search.slots,
      matrix: search.matrix,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function CompareLoaderDepsSubscriber() {
  const loaderDeps = compareRoute.useLoaderDeps({
    select: (deps) => ({
      compareIds: deps.compareIds,
      slots: deps.slots,
      revision: deps.revision,
    }),
  })

  return <PerfValue value={() => loaderDeps()} />
}

function ShopLayout() {
  return (
    <>
      <For each={shopSubscriberIds}>{() => <ShopSearchSubscriber />}</For>
      <For each={shopSubscriberIds}>{() => <ShopPrimitiveSubscriber />}</For>
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

function ProductDetailPage() {
  const params = productDetailRoute.useParams()
  const search = productDetailRoute.useSearch()

  return (
    <>
      <For each={routeSubscriberIds}>{() => <DetailSearchSubscriber />}</For>
      <div data-testid="detail-marker">
        {`detail:${params().productId}:${search().tenant}:${search().detailTab}:${search().panel}`}
      </div>
    </>
  )
}

function ComparePage() {
  const search = compareRoute.useSearch()
  const loaderData = compareRoute.useLoaderData()

  return (
    <>
      <For each={routeSubscriberIds}>{() => <CompareSearchSubscriber />}</For>
      <For each={routeSubscriberIds}>
        {() => <CompareLoaderDepsSubscriber />}
      </For>
      <div data-testid="compare-marker">
        {`compare:${search().tenant}:${search().compareIds.length}:${loaderData().itemCount}:${loaderData().checksum}`}
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

  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
