import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_ROUTE_PATHS,
  parseScrollListParams,
  runScrollRenderComputation,
  scrollFillerRows,
  stringifyScrollListParams,
} from '../../../shared.ts'
import { RestoredMarker } from '../scroll-runtime'
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
            {scrollFillerRows.map((row) => (
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
  path: SCROLL_ROUTE_PATHS.listChild,
  params: {
    parse: parseScrollListParams,
    stringify: stringifyScrollListParams,
  },
  component: ListPage,
})
