/**
 * Route HMR in Solid and Vue apps, as the developer sees it: a real dev
 * server (Vite with `vite-plugin-solid` / `@vitejs/plugin-vue-jsx`, or
 * Rsbuild with `@rsbuild/plugin-solid` / `@rsbuild/plugin-vue` +
 * `@rsbuild/plugin-vue-jsx`) serves a file-based app with the framework's
 * router package to a real browser page, and the test edits its route files
 * on disk (`route-hmr-page.ts`). An edit of a route file shows its new
 * code: the new loader's data and the new component body. Whether without a
 * full reload, keeping the split component (SPEC J3.2): where it does,
 * required here; where it does not, pinned in known-bugs-route-hmr.test.ts.
 *
 * React apps: route-hmr-browser.test.ts.
 */
import { describe, it } from 'vitest'
import { runPins } from '@tanstack/compiler-test-utils/pins'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 90_000

/**
 * A route file of `target` at `/` whose loader and component name the
 * version of the file; the component declares its own `Page`, which Solid
 * Refresh and Vue's HMR runtime can patch.
 */
const route = (target: 'solid' | 'vue', version: string) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {${target === 'vue' ? 'data.value' : 'data()'}}</p>
}
`

/** A cell of the bundler × framework × code-splitting matrix. */
interface Cell {
  bundler: 'vite' | 'rsbuild'
  target: 'solid' | 'vue'
  autoCodeSplitting: boolean
}

const same = (a: Cell, b: Cell) =>
  a.bundler === b.bundler &&
  a.target === b.target &&
  a.autoCodeSplitting === b.autoCodeSplitting

/**
 * Where an edit of a route file applies in place today: Solid in Vite
 * without automatic code splitting (Solid Refresh makes a module that
 * declares its component a boundary), split Solid and Vue on Rsbuild (the
 * route module runs again). The other cells reload the page (Vite: the
 * route module's accept call is on an alias) and are pinned in
 * known-bugs-route-hmr.test.ts ("an edit of a split Solid/Vue route", "an
 * edit of an unsplit Vue route"). With `COMPILER_TESTS_PINS=run`, every
 * cell is required to apply in place.
 */
const hotToday = (cell: Cell) =>
  runPins ||
  [
    { bundler: 'vite', target: 'solid', autoCodeSplitting: false },
    { bundler: 'rsbuild', target: 'solid', autoCodeSplitting: true },
    { bundler: 'rsbuild', target: 'vue', autoCodeSplitting: true },
    { bundler: 'rsbuild', target: 'vue', autoCodeSplitting: false },
  ].some((hot) => same(hot as Cell, cell))

/**
 * Where the edit does not show at all today: an unsplit Solid route on
 * Rsbuild keeps its old component (pinned in known-bugs-route-hmr.test.ts
 * "rsbuild: an edit of an unsplit Solid route"). With
 * `COMPILER_TESTS_PINS=run`, no cell is left out.
 */
const brokenToday = (cell: Cell) =>
  !runPins &&
  same(cell, { bundler: 'rsbuild', target: 'solid', autoCodeSplitting: false })

describe.concurrent.each([
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it.for(
    [true, false].filter(
      (autoCodeSplitting) =>
        !brokenToday({ bundler, target, autoCodeSplitting }),
    ),
  )(
    'shows the new code of an edited route file (autoCodeSplitting: %s)',
    { timeout },
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route(target, 'v1') },
        ready: 'page v1 data v1',
      })
      const result = await app.edit(
        { 'routes/index.tsx': route(target, 'v2') },
        'page v2 data v2',
      )
      if (hotToday({ bundler, target, autoCodeSplitting })) {
        expect(result).toEqual({ reloaded: false, errors: [] })
      }
    },
  )
})
