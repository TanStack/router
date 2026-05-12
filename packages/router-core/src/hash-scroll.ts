import type { AnyRouter } from './router'

/**
 * @private
 * Handles hash-based scrolling after navigation completes.
 * To be used in framework-specific <Transitioner> components during the onResolved event.
 */
export function handleHashScroll(router: AnyRouter) {
  if (typeof document !== 'undefined' && (document as any).querySelector) {
    const location = router.stores.location.get()
    const hashScrollIntoViewOptions =
      location.state.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions && location.hash !== '') {
      const el = document.getElementById(location.hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }
  }
}
