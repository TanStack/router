/**
 * Route HMR after a render error the page recovered from without a route
 * edit. A router catch boundary that shows a render error makes route edits
 * reload the page (R70: the framework cannot recover in place), and the
 * reload discards that state. A page can also recover without a reload: a
 * navigation resets the boundary.
 *
 * Pin (R3-G9-2, open: the state is never cleared, see oracle/KNOWN-BUGS.md).
 */
import { test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const throwing = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
function Page(): never {
  throw new Error('page broke')
}
`

const other = (
  version: string,
) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({
  component: () => <p>other ${version}</p>,
})
`

// Bug: the global boundary's catch marks the router for a reload on the next
// route edit, and nothing clears the mark once the page recovered (here by
// navigating away: the boundary resets).
// Impact: one render error earlier in a session costs a full reload (and the
// page's state) on a later, unrelated route edit.
test.fails(
  'react, vite: a route edit after a render error the page navigated away from updates in place',
  { timeout: 60_000 },
  async ({ expect, onTestFinished }: TestContext) => {
    const app = await openRouteHmrPage({
      onTestFinished,
      files: { 'routes/index.tsx': throwing, 'routes/other.tsx': other('v1') },
      ready: 'Something went wrong!',
    })
    await app.evaluate(`void window.__APP_ROUTER__.navigate({ to: '/other' })`)
    await app.page.waitForText('other v1', { selector: '#app' })
    const edited = await app.edit(
      { 'routes/other.tsx': other('v2') },
      'other v2',
    )
    expect(edited.reloaded).toBe(false)
  },
)
