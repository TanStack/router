import { createRoute } from '@tanstack/react-router'
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
  const hashId = getHashAnchorId(params.itemId)
  const checksum = runScrollRenderComputation(params.itemId.length * 17)

  return (
    <section
      data-scroll-page="detail"
      data-list-id={params.listId}
      data-item-id={params.itemId}
    >
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.detail}
        data-scroll-region="detail"
        data-detail-checksum={checksum}
      >
        <RestoredMarker id="detail" />
        <h2 id={hashId}>{`Detail ${params.itemId}`}</h2>
        {fillerRows.map((row) => (
          <p key={`detail-${params.itemId}-${row}`}>{`Detail row ${row}`}</p>
        ))}
      </div>
    </section>
  )
}
