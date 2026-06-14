import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import {
  SCROLL_CONTAINER_IDS,
  getHashAnchorId,
  normalizeScrollSegment,
  runScrollRenderComputation,
} from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { listRoute } from './scroll.list.$listId'

export const detailRoute = createRoute({
  getParentRoute: () => listRoute,
  path: 'detail/$itemId',
  params: {
    parse: (params) => ({
      itemId: normalizeScrollSegment(params.itemId, 'missing-item'),
    }),
    stringify: (params) => ({
      itemId: normalizeScrollSegment(params.itemId, 'missing-item'),
    }),
  },
  component: DetailPage,
})

function DetailPage() {
  const params = detailRoute.useParams()

  return (
    <section
      data-scroll-page="detail"
      data-list-id={params().listId}
      data-item-id={params().itemId}
    >
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.detail}
        data-scroll-region="detail"
        data-detail-checksum={runScrollRenderComputation(
          params().itemId.length * 17,
        )}
      >
        <RestoredMarker id="detail" />
        <h2
          id={getHashAnchorId(params().itemId)}
        >{`Detail ${params().itemId}`}</h2>
        <For each={fillerRows}>{(row) => <p>{`Detail row ${row}`}</p>}</For>
      </div>
    </section>
  )
}
