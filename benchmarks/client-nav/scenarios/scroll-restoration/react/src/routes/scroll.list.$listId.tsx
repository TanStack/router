import { Outlet, createRoute } from '@tanstack/react-router'
import {
  SCROLL_CONTAINER_IDS,
  normalizeScrollSegment,
  runScrollRenderComputation,
} from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { scrollRoute } from './scroll'

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

function ListPage() {
  const params = listRoute.useParams()
  const checksum = runScrollRenderComputation(params.listId.length)

  return (
    <section data-scroll-page="list" data-list-id={params.listId}>
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.list}
        data-scroll-region="list"
        data-list-checksum={checksum}
      >
        <RestoredMarker id="list" />
        {fillerRows.map((row) => (
          <article key={`list-${params.listId}-${row}`}>
            {`List ${params.listId} row ${row}`}
          </article>
        ))}
        <Outlet />
      </div>
    </section>
  )
}
