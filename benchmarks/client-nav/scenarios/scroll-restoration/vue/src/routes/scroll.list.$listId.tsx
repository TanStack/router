import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  SCROLL_CONTAINER_IDS,
  normalizeScrollSegment,
  runScrollRenderComputation,
} from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { scrollRoute } from './scroll'

const ListPage = Vue.defineComponent({
  setup() {
    const params = listRoute.useParams()

    return () => {
      const listId = params.value.listId
      const checksum = runScrollRenderComputation(listId.length)

      return (
        <section data-scroll-page="list" data-list-id={listId}>
          <div
            data-scroll-restoration-id={SCROLL_CONTAINER_IDS.list}
            data-scroll-region="list"
            data-list-checksum={checksum}
          >
            <RestoredMarker id="list" />
            {fillerRows.map((row) => (
              <article
                key={`list-${listId}-${row}`}
              >{`List ${listId} row ${row}`}</article>
            ))}
            <Outlet />
          </div>
        </section>
      )
    }
  },
})

export const listRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: 'list/$listId',
  params: {
    parse: (params) => ({
      listId: normalizeScrollSegment(params.listId, 'missing-list'),
    }),
    stringify: (params) => ({
      listId: normalizeScrollSegment(params.listId, 'missing-list'),
    }),
  },
  component: ListPage,
})
