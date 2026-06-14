import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import {
  buildCompareSearch,
  buildProductsSearch,
  computeSearchChecksum,
  defaultShopSearchStrip,
  selectShopPrimitiveSearch,
  selectShopSearch,
  shopSubscriberIds,
  tenantSearchKeys,
  transientSearchKeys,
  validateShopSearch,
  type ShopSearchSchema,
} from '../../../shared'

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
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ShopPrimitiveSubscriber() {
  const selected = Route.useSearch({
    select: selectShopPrimitiveSearch,
  })

  void computeSearchChecksum(selected)
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
