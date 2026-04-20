import ReactDOM from 'react-dom'

/**
 * Emit a <link rel="stylesheet"> for each CSS href so the browser starts
 * fetching early during production SSR
 */
export function preinitCssHrefs(cssHrefs: Iterable<string> | undefined): void {
  // Dev: plugin-rsc already emits a <link> per href and refreshes it on HMR
  // A preinit <link> is never removed, so stale rules from the original CSS
  // survive every edit - therefore skip preinit in dev
  if (process.env.NODE_ENV !== 'production') return
  if (!cssHrefs) return
  for (const href of cssHrefs) {
    ReactDOM.preinit(href, { as: 'style', precedence: 'high' })
  }
}
