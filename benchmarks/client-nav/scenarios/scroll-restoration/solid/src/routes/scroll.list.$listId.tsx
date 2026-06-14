import { For } from 'solid-js'
import { Outlet, createRoute } from '@tanstack/solid-router'
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

export const listRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: SCROLL_ROUTE_PATHS.listChild,
  params: {
    parse: parseScrollListParams,
    stringify: stringifyScrollListParams,
  },
  component: ListPage,
})

function ListPage() {
  const params = listRoute.useParams()

  return (
    <section data-scroll-page="list" data-list-id={params().listId}>
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.list}
        data-scroll-region="list"
        data-list-checksum={runScrollRenderComputation(params().listId.length)}
      >
        <RestoredMarker id="list" />
        <For each={scrollFillerRows}>
          {(row) => <article>{`List ${params().listId} row ${row}`}</article>}
        </For>
        <Outlet />
      </div>
    </section>
  )
}
