import * as Vue from 'vue'
import { createFileRoute, stripSearchParams } from '@tanstack/vue-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'

const DetailSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
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

const ProductDetailPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()
    const search = Route.useSearch()

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

export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(['debug', 'junk'])],
  },
  component: ProductDetailPage,
})
