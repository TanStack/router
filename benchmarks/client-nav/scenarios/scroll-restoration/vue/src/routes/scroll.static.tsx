import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { SCROLL_CONTAINER_IDS } from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { scrollRoute } from './scroll'

const StaticPage = Vue.defineComponent({
  setup() {
    return () => (
      <section data-scroll-page="static">
        <div
          data-scroll-restoration-id={SCROLL_CONTAINER_IDS.static}
          data-scroll-region="static"
        >
          <RestoredMarker id="static" />
          {fillerRows.map((row) => (
            <p key={`static-${row}`}>{`Static row ${row}`}</p>
          ))}
        </div>
      </section>
    )
  },
})

export const staticRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: 'static',
  component: StaticPage,
})
