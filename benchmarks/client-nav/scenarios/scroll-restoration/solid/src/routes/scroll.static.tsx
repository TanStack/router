import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
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
        <For each={scrollFillerRows}>
          {(row) => <p>{`Static row ${row}`}</p>}
        </For>
      </div>
    </section>
  )
}
