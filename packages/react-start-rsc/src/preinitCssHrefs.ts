import ReactDOM from 'react-dom'

/**
 * Vite's HMR cache-bust query, e.g. `?t=1776450256042`
 * Vite only adds this during dev, never in a prod build
 */
const HMR_CACHE_BUST = /[?&]t=\d+/

/**
 * Tells React 19 Float to start fetching each CSS file early and put a
 * <link rel="stylesheet" data-precedence="high"> in <head> during production builds
 */
export function preinitCssHrefs(cssHrefs: Iterable<string> | undefined): void {
  if (!cssHrefs) return
  for (const href of cssHrefs) {
    // Skip Vite's HMR cache-bust query so that no stale <link>s pile up
    // in <head> during dev from HMR edits. In prod builds, there are no `?t=` hrefs
    if (HMR_CACHE_BUST.test(href)) continue
    ReactDOM.preinit(href, { as: 'style', precedence: 'high' })
  }
}

export const _internals = { HMR_CACHE_BUST }
