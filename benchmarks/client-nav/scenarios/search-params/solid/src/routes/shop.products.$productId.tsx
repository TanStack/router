import { For } from 'solid-js'
import { createFileRoute, stripSearchParams } from '@tanstack/solid-router'
import {
  routeSubscriberIds,
  validateDetailSearch,
  type DetailSearch,
} from '../../../shared'
import { PerfValue } from '../perf'

export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: validateDetailSearch,
  search: {
    middlewares: [stripSearchParams<DetailSearch>(['debug', 'junk'])],
  },
  component: ProductDetailPage,
})

function DetailSearchSubscriber() {
  const selected = Route.useSearch({
    select: (search) => ({
      tenant: search.tenant,
      filters: search.filters,
      detailTab: search.detailTab,
      panel: search.panel,
    }),
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
        {`detail:${params().productId}:${search().tenant}:${search().detailTab}:${search().panel}`}
      </div>
    </>
  )
}
