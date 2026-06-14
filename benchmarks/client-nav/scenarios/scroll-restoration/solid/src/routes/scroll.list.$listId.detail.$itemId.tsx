import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
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
        <For each={scrollFillerRows}>
          {(row) => <p>{`Detail row ${row}`}</p>}
        </For>
      </div>
    </section>
  )
}
