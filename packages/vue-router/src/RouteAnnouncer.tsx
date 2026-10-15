import * as Vue from 'vue'
import { setupRouteAnnouncer } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { RouteAnnouncerOptions } from '@tanstack/router-core'

export type RouteAnnouncerProps = RouteAnnouncerOptions

const visuallyHidden: Vue.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * Moves focus to the new page and announces its title to screen readers after
 * a client-side navigation to a new path. Render it once, in the root route,
 * so that its live region is already in the document before it changes.
 */
export const RouteAnnouncer = Vue.defineComponent({
  name: 'RouteAnnouncer',
  props: {
    focusSelectors: {
      type: Array as Vue.PropType<Array<string>>,
    },
  },
  setup(props) {
    const router = useRouter()
    const region = Vue.ref<HTMLDivElement | null>(null)

    let unsubscribe: (() => void) | undefined

    Vue.onMounted(() => {
      // `props` is read on every navigation, so later prop changes apply.
      unsubscribe = setupRouteAnnouncer(router, region.value!, props)
    })
    Vue.onUnmounted(() => unsubscribe?.())

    return () => (
      <div
        ref={region}
        aria-live="polite"
        aria-atomic="true"
        style={visuallyHidden}
      />
    )
  },
})
