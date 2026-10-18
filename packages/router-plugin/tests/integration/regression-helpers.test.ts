// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../regression-helpers.test.ts (fast tier).
/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`), and the route HMR page
 * (`route-hmr-page.ts`).
 */
import { describe, expect, it } from 'vitest'
import { buildAndRun, head } from '../regression-helpers'
import { openRouteHmrPage } from '../route-hmr-page'

describe('buildAndRun', () => {
  // A real app's package.json has no side-effect hint unless the app adds
  // one: a module the route file imports for its side effect runs.
  it.each([
    { sideEffects: undefined, ran: true },
    { sideEffects: false, ran: false },
  ])(
    'keeps a side-effect import unless the app declares "sideEffects": $sideEffects',
    async ({ sideEffects, ran }) => {
      expect(
        await buildAndRun(
          `${head}import '../effect'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })`,
          `return globalThis.effectRan === true`,
          {
            sideEffects,
            files: { 'effect.ts': `;(globalThis as any).effectRan = true\n` },
          },
        ),
      ).toBe(ran)
    },
    30_000,
  )
})

// Controls of the route HMR page (`openRouteHmrPage`): it tells kept state
// from lost state, a hot update from a full reload (the browser's own
// reload API, as a user pressing reload), an update the page applied
// without showing the edit (it fails without waiting for its timeout), and
// what the page logged. A React app whose route component renders a
// counter.
describe.each(['vite', 'rsbuild'] as const)(
  'openRouteHmrPage (%s)',
  (bundler) => {
    const route = (
      version: string,
      child = 'Counter',
      effect = '',
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function ${child}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${child} ${version} count {count}</button>
}
function Page() {
  ${effect}
  return <div><${child} /></div>
}
export const Route = createFileRoute('/')({ component: Page })
`

    it('sees kept state, lost state, full reloads and what the page logs', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'Counter v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('Counter v1 count 1')
      // An edit of the component's body: React Refresh keeps its state.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v2') },
          'Counter v2 count 1',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      // A component the edit renames is another component for React Refresh:
      // React mounts it anew.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v3', 'Renamed') },
          'Renamed v3 count 0',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      // What the app logs with `console.error` during an edit is reported.
      expect(
        await app.edit(
          {
            'routes/index.tsx': route(
              'v4',
              'Renamed',
              `console.error('MARK_LOGGED')`,
            ),
          },
          'Renamed v4 count 0',
        ),
      ).toEqual({ reloaded: false, errors: ['MARK_LOGGED'] })
      // A full reload of the page (here: the browser's own reload) counts
      // as a load; the app starts anew.
      const loads = app.loads()
      await app.page.page.reload()
      await app.page.waitForText('Renamed v4 count 0')
      expect(app.loads()).toBe(loads + 1)
    }, 60_000)

    it('fails an edit the page applied without showing it, without waiting for its timeout', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'Counter v1 count 0',
      })
      const started = Date.now()
      await expect(
        app.edit({ 'routes/index.tsx': route('v2') }, 'Counter v3', {
          timeout: 20_000,
        }),
      ).rejects.toThrow(/applied the update .* but the page does not show/s)
      expect(Date.now() - started).toBeLessThan(10_000)
    }, 60_000)
  },
)
