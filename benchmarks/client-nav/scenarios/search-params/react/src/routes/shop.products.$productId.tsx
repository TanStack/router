import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import {
  computeSearchChecksum,
  formatDetailMarker,
  routeSubscriberIds,
  selectDetailSearch,
  transientSearchKeys,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'

export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(transientSearchKeys)],
  },
  component: ProductDetailPage,
})

function DetailSearchSubscriber() {
  const selected = Route.useSearch({
    select: selectDetailSearch,
    structuralSharing: true,
  })

  void computeSearchChecksum(selected)
  return null
}

function ProductDetailPage() {
  const params = Route.useParams()
  const search = Route.useSearch()

  return (
    <>
      {routeSubscriberIds.map((id) => (
        <DetailSearchSubscriber key={`detail-search-${id}`} />
      ))}
      <div data-testid="detail-marker">
        {formatDetailMarker(params.productId, search)}
      </div>
    </>
  )
}
