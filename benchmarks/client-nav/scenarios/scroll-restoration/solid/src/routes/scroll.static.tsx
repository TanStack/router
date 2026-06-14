import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import { SCROLL_CONTAINER_IDS } from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { scrollRoute } from './scroll'

export const staticRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: 'static',
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
        <For each={fillerRows}>{(row) => <p>{`Static row ${row}`}</p>}</For>
      </div>
    </section>
  )
}
