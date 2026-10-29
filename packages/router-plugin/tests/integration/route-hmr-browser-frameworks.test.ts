/**
 * Route HMR in Solid and Vue apps, as the developer sees it: a real dev
 * server (Vite with `vite-plugin-solid` / `@vitejs/plugin-vue-jsx`, or
 * Rsbuild with `@rsbuild/plugin-solid` / `@rsbuild/plugin-vue` +
 * `@rsbuild/plugin-vue-jsx`) serves a file-based app with the framework's
 * router package to a real browser page, and the test edits its route files
 * on disk (`route-hmr-page.ts`). An edit of a route file shows its new
 * code in place: the new loader's data and the new component body, without
 * a full reload (that the split component is kept, SPEC J3.2:
 * known-bugs-route-hmr.test.ts).
 *
 * React apps: route-hmr-browser.test.ts.
 */
import { describe, it } from 'vitest'
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

describe.concurrent.each([
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it.for([true, false])(
    'shows the new code of an edited route file in place (autoCodeSplitting: %s)',
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
      expect(
        await app.edit(
          { 'routes/index.tsx': route(target, 'v2') },
          'page v2 data v2',
        ),
      ).toEqual({ reloaded: false, errors: [] })
    },
  )
})

/**
 * A Solid root route whose component names the version of the file and
 * renders the child route.
 */
const solidRoot = (version: string) =>
  `import { Outlet, createRootRoute } from '@tanstack/solid-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return <div><p>root ${version}</p><Outlet /></div>
}
`

// SPEC J3.5: an edit of the root route (never split) hot-updates. On
// Rsbuild: known-bugs-route-hmr.test.ts ("rsbuild: an edit of a Solid root
// route"). React apps: route-hmr-browser.test.ts.
describe.concurrent('vite: a solid app', () => {
  it.for([true, false])(
    'shows the new code of an edited root route in place (autoCodeSplitting: %s)',
    { timeout },
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        target: 'solid',
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: {
          'routes/__root.tsx': solidRoot('v1'),
          'routes/index.tsx': route('solid', 'v1'),
        },
        ready: /root v1[\s\S]*page v1 data v1/,
      })
      const result = await app.edit(
        { 'routes/__root.tsx': solidRoot('v2') },
        /root v2[\s\S]*page v1 data v1/,
      )
      expect(result).toEqual({ reloaded: false, errors: [] })
    },
  )
})
