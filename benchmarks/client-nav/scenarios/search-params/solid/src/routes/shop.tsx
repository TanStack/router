import { For } from 'solid-js'
import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  buildCompareSearch,
  buildProductsSearch,
  defaultShopSearchStrip,
  selectShopPrimitiveSearch,
  selectShopSearch,
  shopSubscriberIds,
  tenantSearchKeys,
  transientSearchKeys,
  validateShopSearch,
  type ShopSearchSchema,
} from '../../../shared'
import { PerfValue } from '../perf'

export const Route = createFileRoute('/shop')({
  validateSearch: validateShopSearch,
  search: {
    middlewares: [
      retainSearchParams<ShopSearchSchema>(tenantSearchKeys),
      stripSearchParams<ShopSearchSchema>(transientSearchKeys),
      stripSearchParams<ShopSearchSchema>(defaultShopSearchStrip),
    ],
  },
  component: ShopLayout,
})

function ShopSearchSubscriber() {
  const selected = Route.useSearch({
    select: selectShopSearch,
  })

  return <PerfValue value={() => selected()} />
}

function ShopPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: selectShopPrimitiveSearch,
  })

  return <PerfValue value={() => selected()} />
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
          search={buildProductsSearch(41)}
          replace
          activeOptions={{ includeSearch: true }}
        >
          Products stripped link
        </Link>
        <Link
          data-testid="compare-strip-link"
          to="/shop/compare"
          search={buildCompareSearch(17)}
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
