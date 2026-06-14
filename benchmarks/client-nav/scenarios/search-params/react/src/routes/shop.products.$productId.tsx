import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import {
  computeSearchChecksum,
  routeSubscriberIds,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'

export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(['debug', 'junk'])],
  },
  component: ProductDetailPage,
})

function DetailSearchSubscriber() {
  const selected = Route.useSearch({
    select: (search) => {
      const typedSearch = search as DetailSearch

      return {
        tenant: typedSearch.tenant,
        filters: typedSearch.filters,
        detailTab: typedSearch.detailTab,
        panel: typedSearch.panel,
      }
    },
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
        {`detail:${params.productId}:${search.tenant}:${search.detailTab}:${search.panel}`}
      </div>
    </>
  )
}
