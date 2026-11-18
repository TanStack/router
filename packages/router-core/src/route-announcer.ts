import type { AnyRouter } from './router'

export type RouteAnnouncerOptions = {
  /**
   * Selectors tried in order to find the element that receives focus after a
   * navigation to a new path. The first match wins. Pass an empty array to
   * leave focus alone and only announce the new page.
   *
   * @default ['h1', 'main']
   */
  focusSelectors?: Array<string>
}

const defaultFocusSelectors = ['h1', 'main']

/**
 * After a client-side navigation to a new path, moves focus to the new page
 * and writes its title into `region`, which should be an `aria-live` region
 * that is already in the document. Search-only and hash-only changes are
 * ignored, and so is the first render: the browser has already read that page.
 *
 * `options` is read on every navigation, so it can be a reactive props object.
 *
 * @returns A function that removes the listener.
 */
export function setupRouteAnnouncer(
  router: AnyRouter,
  region: HTMLElement,
  options?: RouteAnnouncerOptions,
): () => void {
  // `onRendered` fires after the new route has rendered, so its title and
  // heading are in the document, and after scroll restoration has run.
  return router.subscribe('onRendered', (event) => {
    // The first render has no previous location, or the same one after
    // hydration.
    if (!event.fromLocation || !event.pathChanged) {
      return
    }

    for (const selector of options?.focusSelectors ?? defaultFocusSelectors) {
      const target = document.querySelector<HTMLElement>(selector)
      if (target) {
        if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1')
        }
        target.focus({ preventScroll: true })
        break
      }
    }

    region.textContent =
      document.title ||
      document.querySelector('h1')?.textContent ||
      event.toLocation.pathname
  })
}
