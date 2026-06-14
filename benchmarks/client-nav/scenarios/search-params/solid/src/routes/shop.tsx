import { For } from 'solid-js'
import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/solid-router'
import {
  DEFAULT_FLAGS,
  buildCompareSearch,
  buildProductsSearch,
  shopSubscriberIds,
  validateShopSearch,
  type ShopSearchSchema,
} from '../../../shared'
import { PerfValue } from '../perf'

export const Route = createFileRoute('/shop')({
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

function ShopSearchSubscriber() {
  const selected = Route.useSearch({
    select: (search) => ({
      tenant: search.tenant,
      locale: search.locale,
      flags: search.flags,
    }),
  })

  return <PerfValue value={() => selected()} />
}

function ShopPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: (search) => `${search.tenant}:${search.locale}`,
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
