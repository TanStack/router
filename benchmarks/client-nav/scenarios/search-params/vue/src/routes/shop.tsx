import * as Vue from 'vue'
import {
  Link,
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/vue-router'
import {
  DEFAULT_FLAGS,
  compareLinkSearch,
  computeSearchChecksum,
  productsLinkSearch,
  shopSubscriberIds,
  validateShopSearch,
  type ShopSearchSchema,
} from '../../../shared'

const ShopSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
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
    const selected = Route.useSearch({
      select: (search) => `${search.tenant}:${search.locale}`,
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
