import * as Vue from 'vue'
import {
  defaultGetScrollRestorationKey,
  escapeHtml,
  restoreScroll,
  storageKey,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { ScriptOnce } from './ScriptOnce'

/**
 * ScrollRestoration component for Vue.
 * On server: renders a ScriptOnce with scroll restoration logic.
 * On client during hydration: renders a matching ScriptOnce to avoid mismatch.
 * After mount: renders nothing.
 */
export const ScrollRestoration = Vue.defineComponent({
  name: 'ScrollRestoration',
  setup() {
    const router = useRouter()

    // Track mounted state for hydration handling
    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      // After mount, render nothing
      if (mounted.value) {
        return null
      }

      // Check if scroll restoration is enabled
      if (!router.isScrollRestoring) {
        return null
      }

      // Check custom scroll restoration function
      if (typeof router.options.scrollRestoration === 'function') {
        const shouldRestore = router.options.scrollRestoration({
          location: router.latestLocation,
        })
        if (!shouldRestore) {
          return null
        }
      }

      const getKey =
        router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
      const userKey = getKey(router.latestLocation)
      const resolvedKey =
        userKey !== defaultGetScrollRestorationKey(router.latestLocation)
          ? userKey
          : undefined

      const restoreScrollOptions: Parameters<typeof restoreScroll>[0] = {
        storageKey,
        shouldScrollRestoration: true,
      }
      if (resolvedKey) {
        restoreScrollOptions.key = resolvedKey
      }

      // Server-side: render the actual scroll restoration script
      if (isServer ?? router.isServer) {
        return (
          <ScriptOnce
            children={`(${restoreScroll.toString()})(${escapeHtml(JSON.stringify(restoreScrollOptions))})`}
          />
        )
      }

      // Client-side during hydration: render empty ScriptOnce to match server structure
      return <ScriptOnce children="" />
    }
  },
})
