import { createRoute } from '@tanstack/react-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_ROUTE_PATHS,
  getHashAnchorId,
  parseScrollDetailParams,
  runScrollRenderComputation,
  scrollFillerRows,
  stringifyScrollDetailParams,
} from '../../../shared.ts'
import { RestoredMarker } from '../scroll-runtime'
import { listRoute } from './scroll.list.$listId'

export const detailRoute = createRoute({
  getParentRoute: () => listRoute,
  path: SCROLL_ROUTE_PATHS.detailChild,
  params: {
    parse: parseScrollDetailParams,
    stringify: stringifyScrollDetailParams,
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
        {scrollFillerRows.map((row) => (
          <p key={`detail-${params.itemId}-${row}`}>{`Detail row ${row}`}</p>
        ))}
      </div>
    </section>
  )
}
