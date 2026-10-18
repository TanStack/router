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
// from lost state, and a hot update from a full reload. A React app whose
// route component renders a counter, and whose entry renders a header
// imported from a module that no HMR boundary accepts.
describe.each(['vite', 'rsbuild'] as const)(
  'openRouteHmrPage (%s)',
  (bundler) => {
    const route = (
      version: string,
      child = 'Counter',
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function ${child}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${child} ${version} count {count}</button>
}
function Page() {
  return <div><${child} /></div>
}
export const Route = createFileRoute('/')({ component: Page })
`
    const main = `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { header } from './header'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(
  <>
    <p>{header}</p>
    <RouterProvider router={router} />
  </>,
)
`

    it('sees kept state, lost state and full reloads', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: {
          'main.tsx': main,
          'header.ts': `export const header = 'header v1'`,
          'routes/index.tsx': route('v1'),
        },
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
      ).toEqual({ reloaded: false })
      // A component the edit renames is another component for React Refresh:
      // React mounts it anew.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v3', 'Renamed') },
          'Renamed v3 count 0',
        ),
      ).toEqual({ reloaded: false })
      // An edit of a module that no HMR boundary accepts reloads the page.
      expect(
        await app.edit(
          { 'header.ts': `export const header = 'header v2'` },
          'header v2',
        ),
      ).toEqual({ reloaded: true })
    }, 60_000)
  },
)
