import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  SCROLL_CONTAINER_IDS,
  getHashAnchorId,
  normalizeScrollSegment,
  runScrollRenderComputation,
} from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { listRoute } from './scroll.list.$listId'

const DetailPage = Vue.defineComponent({
  setup() {
    const params = detailRoute.useParams()

    return () => {
      const listId = params.value.listId
      const itemId = params.value.itemId
      const checksum = runScrollRenderComputation(itemId.length * 17)

      return (
        <section
          data-scroll-page="detail"
          data-list-id={listId}
          data-item-id={itemId}
        >
          <div
            data-scroll-restoration-id={SCROLL_CONTAINER_IDS.detail}
            data-scroll-region="detail"
            data-detail-checksum={checksum}
          >
            <RestoredMarker id="detail" />
            <h2 id={getHashAnchorId(itemId)}>{`Detail ${itemId}`}</h2>
            {fillerRows.map((row) => (
              <p key={`detail-${itemId}-${row}`}>{`Detail row ${row}`}</p>
            ))}
          </div>
        </section>
      )
    }
  },
})

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
