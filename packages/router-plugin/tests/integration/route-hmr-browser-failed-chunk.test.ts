/**
 * An edit that breaks a route's split chunk (the chunk throws when it
 * evaluates, the route module does not) shows the route's error component;
 * the edit that fixes it shows the fixed component in place, also when the
 * refresh runtime keeps the component the page held (the fixed chunk exports
 * the same component family). The chunk holds the component and the loader,
 * so it is no React Refresh boundary (its loader export is no component): the
 * route module's hot import of the chunk is what fails, then succeeds. A real
 * dev server with React Refresh, a real page (`route-hmr-page.ts`). (Solid
 * reloads the page on such edits: its route boundary marks the router for a
 * reload.)
 */
import { describe, expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 60_000

/** The index route: its component reads `settings`, a module value only the component's chunk needs. */
const route = (settings: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
const settings = JSON.parse(${JSON.stringify(settings)})
export const Route = createFileRoute('/')({
  loader: () => 'loaded',
  component: Page,
  errorComponent: Failed,
  codeSplitGroupings: [['component', 'loader']],
})
function Failed({ error }: { error: Error }) {
  return <p>failed {error.name}</p>
}
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{settings.label} {count}</button>
}
`
const healthy = (label: string) => route(JSON.stringify({ label }))
// JSON.parse throws a SyntaxError where the chunk evaluates
const broken = route('{')

describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
  test(
    'after an edit that breaks the split chunk, the fixing edit shows the component in place',
    async ({ onTestFinished }) => {
      const app = await openRouteHmrPage({
        bundler,
        onTestFinished,
        files: { 'routes/index.tsx': healthy('page v1') },
        ready: 'page v1 0',
      })
      await app.click('#app button')
      await app.page.waitForText('page v1 1', { selector: '#app' })

      const failed = await app.edit(
        { 'routes/index.tsx': broken },
        'failed SyntaxError',
      )
      // Rsbuild applies the edit in place: the route module's hot import of
      // the chunk fails, the path this test is about. Vite reloads the page
      // instead: @vitejs/plugin-react makes the chunk (it registers `Page`)
      // import itself, and Vite reloads an update that fails within a
      // circular import; the fixing edit then reaches a wrapper whose first
      // load failed.
      if (bundler === 'rsbuild') {
        expect(failed.reloaded).toBe(false)
      }

      const fixed = await app.edit(
        { 'routes/index.tsx': healthy('page v3') },
        /page v3 \d/,
      )
      expect(fixed.reloaded).toBe(false)
    },
    timeout,
  )
})
