import * as Vue from 'vue'
import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
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

const ShopSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: selectShopSearch,
    })

    return () => {
      void computeSearchChecksum(selected.value)
      return null
    }
  },
})

const ShopPrimitiveSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: selectShopPrimitiveSearch,
    })

    return () => {
      void computeSearchChecksum(selected.value)
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
  },
})

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
