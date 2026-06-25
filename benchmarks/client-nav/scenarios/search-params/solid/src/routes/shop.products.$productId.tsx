import { For } from 'solid-js'
import { createFileRoute, stripSearchParams } from '@tanstack/solid-router'
import {
  formatDetailMarker,
  routeSubscriberIds,
  selectDetailSearch,
  transientSearchKeys,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'
import { PerfValue } from '../perf'

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
  })

  return <PerfValue value={() => selected()} />
}

function ProductDetailPage() {
  const params = Route.useParams()
  const search = Route.useSearch()

  return (
    <>
      <For each={routeSubscriberIds}>{() => <DetailSearchSubscriber />}</For>
      <div data-testid="detail-marker">
        {formatDetailMarker(params().productId, search())}
      </div>
    </>
  )
}
