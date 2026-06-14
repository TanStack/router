import { createRoute } from '@tanstack/react-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_ROUTE_PATHS,
  scrollFillerRows,
} from '../../../shared.ts'
import { RestoredMarker } from '../scroll-runtime'
import { scrollRoute } from './scroll'

export const staticRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: SCROLL_ROUTE_PATHS.staticChild,
  component: StaticPage,
})

function StaticPage() {
  return (
    <section data-scroll-page="static">
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.static}
        data-scroll-region="static"
      >
        <RestoredMarker id="static" />
        {scrollFillerRows.map((row) => (
          <p key={`static-${row}`}>{`Static row ${row}`}</p>
        ))}
      </div>
    </section>
  )
}
