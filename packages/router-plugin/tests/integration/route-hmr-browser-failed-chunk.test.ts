/**
 * An edit that breaks a route's split chunk (the chunk throws when it
 * evaluates, the route module does not), then the edit that fixes it, as on
 * main (R153): a chunk holding only the component keeps the component the
 * page shows (the bundler's HMR client reports the failure) and the fix
 * patches it in place with its state; a chunk holding the loader too fails
 * the route's load, which shows the route's error component (or the root's
 * error, without a reload), and the fix shows the fixed component in place,
 * also when the refresh runtime keeps the component the page held (the
 * fixed chunk exports the same component family). The route module's hot
 * import of the chunk is what fails, then succeeds. A real dev server with
 * React Refresh, a real page (`route-hmr-page.ts`).
 */
import { describe, expect } from 'vitest'
import { test } from '../test'

const timeout = 60_000

/**
 * The index route: its component reads `settings`, a module value only the
 * component's chunk needs; `loader` puts a loader into that chunk,
 * `errorComponent` gives the route an error component.
 */
const route = (
  settings: string,
  { loader, errorComponent }: { loader: boolean; errorComponent: boolean },
) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
const settings = JSON.parse(${JSON.stringify(settings)})
export const Route = createFileRoute('/')({
  ${loader ? `loader: () => 'loaded',\n  codeSplitGroupings: [['component', 'loader']],` : ''}
  component: Page,
  ${errorComponent ? 'errorComponent: Failed,' : ''}
})
function Failed({ error }: { error: Error }) {
  return <p>failed {error.name}</p>
}
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{settings.label} {count}</button>
}
`
const healthy = (label: string, shape: Parameters<typeof route>[1]) =>
  route(JSON.stringify({ label }), shape)
// JSON.parse throws a SyntaxError where the chunk evaluates
const broken = (shape: Parameters<typeof route>[1]) => route('{', shape)

describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
  test.for([false, true])(
    'a component chunk the edit breaks keeps the component on the page, the fixing edit patches it in place (error component: %s)',
    { timeout },
    async (errorComponent, { openRouteHmrPage }) => {
      const shape = { loader: false, errorComponent }
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': healthy('page v1', shape) },
        ready: 'page v1 0',
      })
      await app.click('#app button')
      await app.page.waitForText('page v1 1', { selector: '#app' })

      const failed = await app.edit(
        { 'routes/index.tsx': broken(shape) },
        'page v1 1',
      )
      // the bundler's HMR client reports the chunk's failure
      await expect
        .poll(() => failed.errors.some((e) => e.includes('SyntaxError')))
        .toBe(true)
      expect(
        await app.evaluate('document.querySelector("#app").innerText'),
      ).toBe('page v1 1')
      expect(failed.reloaded).toBe(false)

      const fixed = await app.edit(
        { 'routes/index.tsx': healthy('page v3', shape) },
        'page v3 1',
      )
      expect(fixed.reloaded).toBe(false)
    },
  )

  test.for([true, false])(
    'after an edit that breaks the split chunk holding the loader, the fixing edit shows the component in place (error component: %s)',
    { timeout },
    async (errorComponent, { openRouteHmrPage }) => {
      const shape = { loader: true, errorComponent }
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': healthy('page v1', shape) },
        ready: 'page v1 0',
      })
      await app.click('#app button')
      await app.page.waitForText('page v1 1', { selector: '#app' })

      const failed = await app.edit(
        { 'routes/index.tsx': broken(shape) },
        // the route's error component, or the root's default one
        errorComponent ? 'failed SyntaxError' : /Something went wrong/,
      )
      // The edit applies in place: the route module's hot import of the
      // chunk fails, the path this test is about. (Vite's client reloads the
      // page when an update fails to import within an import cycle; the
      // route module and its chunk are none. Source: design 3 step 4
      // review, finding 1: the chunk's `load` declared the route file with
      // `addWatchFile`, which Vite's dev server records as an import.)
      expect(failed.reloaded).toBe(false)

      const fixed = await app.edit(
        { 'routes/index.tsx': healthy('page v3', shape) },
        /page v3 \d/,
      )
      expect(fixed.reloaded).toBe(false)
    },
  )

  // Review of the route HMR implementation (11-23): the wrapper's own first
  // load failed, so it holds no component; an edit that leaves the chunk
  // broken fails its hot import too
  test.for([false, true])(
    'a component chunk that failed on the first load and after an edit shows the fixing edit (error component: %s)',
    { timeout },
    async (errorComponent, { openRouteHmrPage }) => {
      const shape = { loader: false, errorComponent }
      const failure = errorComponent
        ? 'failed SyntaxError'
        : /Something went wrong/
      const app = await openRouteHmrPage({
        bundler,
        files: { 'routes/index.tsx': broken(shape) },
        ready: failure,
      })
      await app.edit(
        {
          'routes/index.tsx': route('{"label": ', shape),
        },
        failure,
      )
      // The fixed chunk arrives after the route loaded again, as a chunk
      // with a few imports does (a local one is too fast to tell: review of
      // the route HMR implementation, Fable 2): the route's load must wait
      // for it, or the wrapper must import again at the route's next load
      await app.page.page.route(
        (url) => url.pathname !== '/',
        async (request) => {
          if (request.request().resourceType() === 'script') {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          await request.fallback()
        },
      )
      await app.edit(
        { 'routes/index.tsx': healthy('page v3', shape) },
        'page v3 0',
      )
      expect(app.loads()).toBe(1)
    },
  )
})
