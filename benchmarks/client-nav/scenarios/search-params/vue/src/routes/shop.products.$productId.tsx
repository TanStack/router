import * as Vue from 'vue'
import { createFileRoute, stripSearchParams } from '@tanstack/vue-router'
import {
  computeSearchChecksum,
  formatDetailMarker,
  routeSubscriberIds,
  selectDetailSearch,
  transientSearchKeys,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'

const DetailSearchSubscriber = Vue.defineComponent({
  setup() {
    const selected = Route.useSearch({
      select: selectDetailSearch,
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
          {formatDetailMarker(params.value.productId, search.value)}
        </div>
      </>
    )
  },
})

export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(transientSearchKeys)],
  },
  component: ProductDetailPage,
})
