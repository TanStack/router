import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import {
  DEFAULT_FLAGS,
  buildCompareSearch,
  buildProductsSearch,
  computeSearchChecksum,
  shopSubscriberIds,
  validateShopSearch,
  type ShopSearchSchema,
} from '../../../shared'

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
  const selected = Route.useSearch({
    select: (search) => `${search.tenant}:${search.locale}`,
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
