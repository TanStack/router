// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../known-bugs-route-hmr.test.ts (fast tier); the
// production-build pins are in known-bugs-route-hmr-production.test.ts.
/**
 * Known route HMR and React Refresh bugs. Each test asserts the correct
 * behaviour for a bug main had, which today's compiler fixes (a regression
 * test, oracle/KNOWN-BUGS.md).
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload. Pins of what
 * the page shows run a real dev server and a real browser page
 * (`route-hmr-page.ts`): an edit must show its new code without a full
 * reload and without errors in the page. A pin fails as soon as the page's
 * HMR client reports the update applied without the new code showing.
 *
 * Concurrent: each pin has its own dev server and page, and mostly waits.
 * The pins of component shapes React Refresh does not register (inline
 * wrapped components, lowercase split components) are in
 * known-bugs-route-hmr-components.test.ts (two files, to keep each within
 * its time budget).
 */
import { describe, test } from 'vitest'
import {
  expectEditShownOrReportedFallback,
  openRouteHmrPage,
} from '../route-hmr-page'
import { editRoute, inPlace } from '../route-hmr-edit'
import type { TestContext } from 'vitest'

describe.concurrent('route HMR in a real page', { timeout: 60_000 }, () => {
  /** A React route at `/` whose component, `name`, keeps a click count. */
  const counterRoute = (
    version: string,
    name = 'Page',
    options = '',
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function ${name}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${name} ${version} count {count}</button>
}
function Failed() {
  return <p>failed ${version}</p>
}
export const Route = createFileRoute('/')({
  component: ${name},
  ${options}
})
`

  /**
   * A route file of `target` at `/` whose loader and component name the
   * version of the file; the component declares its own `Page`.
   */
  const frameworkRoute = (target: 'solid' | 'vue') => (version: string) =>
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

  // Bug: route HMR keeps the previous split components only for React: for
  // Solid and Vue, the route module creates a new lazy component on every
  // update and `handleRouteUpdate` keeps no component option
  // (`getFrameworkHmrCompilerPlugins` returns no plugin and the kept
  // component keys are empty for other targets); in Vite, the route module
  // is not an HMR boundary either (its accept call is on an alias), so the
  // page reloads.
  // Impact: every edit of a split Solid/Vue route remounts the route
  // component: the router renders a new component, so the page loses the
  // component's local state (signals, refs, form input) on both hosts, and
  // on Vite the whole document reloads, losing all client state. Rsbuild's
  // new text alone does not prove that the live component kept its identity.
  // Goal (any fix): with either host and the framework's plugin, the
  // edit shows without a full reload, and the live route keeps the component
  // the page rendered.
  // SPEC J3.2: Solid/Vue split components keep their identity across hot
  // updates, as React's do.
  test.for(
    (['vite', 'rsbuild'] as const).flatMap((bundler) =>
      (['solid', 'vue'] as const).map((target) => ({ bundler, target })),
    ),
  )(
    '$bundler: an edit of a split $target route shows in place, keeping the split component',
    async ({ bundler, target }, { expect, onTestFinished }: TestContext) => {
      const route = frameworkRoute(target)
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page v1 data v1',
      })
      const liveComponent = `window.__APP_ROUTER__.routesById['/'].options.component`
      await app.evaluate(`window.shownComponent = ${liveComponent}`)
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2 data v2'),
      ).toEqual(inPlace)
      expect(
        await app.evaluate(`window.shownComponent === ${liveComponent}`),
      ).toBe(true)
    },
  )

  // Bug on main: on Rsbuild, an edit of a Solid root route (its module
  // always holds its component and the route HMR code: root routes are never
  // split) kept showing the old root component, with or without automatic
  // code splitting. The webpack-style route HMR code assigned
  // `hot.data ??= {}` before Solid Refresh's `$$refresh(…, module.hot,
  // registry)`, which takes a truthy `hot.data` for the data of a previous
  // run, so the next update had no registry to patch the live component
  // with. An unsplit Solid route, and Vite: route-hmr-browser-frameworks.test.ts.
  // SPEC J3.5.
  test.for([true, false])(
    'rsbuild: an edit of a Solid root route shows its new component in place (autoCodeSplitting: %s)',
    async (autoCodeSplitting, { expect, onTestFinished }: TestContext) => {
      expect(
        await editRoute(
          {
            bundler: 'rsbuild',
            target: 'solid',
            pluginOptions: { autoCodeSplitting },
            files: { 'routes/index.tsx': frameworkRoute('solid')('v1') },
            file: 'routes/__root.tsx',
            route: (version) =>
              `import { Outlet, createRootRoute } from '@tanstack/solid-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return <div><p>root ${version}</p><Outlet /></div>
}
`,
            shows: (version) => `root ${version}page v1 data v1`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: a route a helper function of the route file creates
  // (`export const Route = makeRoute()`) edited without automatic code
  // splitting (the route HMR plugin alone) shows its new loader data but
  // keeps rendering the old inline component, and nothing warns: the route
  // HMR code keeps the previous component for React Refresh to patch, but
  // the component inside the helper is neither hoisted nor registered. With
  // automatic code splitting, and for an IIFE, the edit shows
  // (route-hmr-browser-plugin.test.ts).
  // Impact: edits of such a route's component do not show until a reload,
  // silently.
  // Source: review (found by the real page; the former in-process model
  // compared a component whose text did not change between versions).
  // SPEC J2.10, J2.8: same-file route factories are
  // unsupported but user-fixable. Any fix passes: the edit takes effect
  // without errors, in place, or, when the compiler warns naming the route
  // file through a real channel (the dev server's logger or console, or the
  // page), possibly after a reload. A warning never excuses an edit that
  // does not show (SPEC G10; `expectEditShownOrReportedFallback`).
  // Silent wrong output fails.
  test.for(['vite', 'rsbuild'] as const)(
    '%s: an edit of a route a helper function creates shows its new component, reloading only when the file is reported (autoCodeSplitting: false)',
    async (bundler: 'vite' | 'rsbuild', { onTestFinished }: TestContext) => {
      const route = (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
function makeRoute() {
  return createFileRoute('/')({
    loader: () => 'data ${version}',
    component: () => <p>helper ${version} {Route.useLoaderData()}</p>,
  })
}
export const Route = makeRoute()
`
      const app = await openRouteHmrPage({
        bundler,
        onTestFinished,
        pluginOptions: { autoCodeSplitting: false },
        files: { 'routes/index.tsx': route('v1') },
        ready: 'helper v1 data v1',
      })
      await expectEditShownOrReportedFallback(
        app,
        { 'routes/index.tsx': route('v2') },
        'helper v2 data v2',
        'routes/index.tsx',
      )
    },
  )

  /** A root route rendering the loader data of the active matches. */
  const rootShowingLoaderData = `import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => {
    const data = useRouterState({
      select: (state) => state.matches.map((match) => match.loaderData ?? '').join(''),
    })
    return <p>root {data}<Outlet /></p>
  },
})
`

  // Bug: same root cause as the pin above, for a React route file without
  // JSX (`.ts`): React Refresh registers no component in it, so it is not a
  // boundary either.
  // Source: round-3 mutation testing (route HMR side finding).
  // Impact: every edit of a React `.ts` route file reloads the page in Vite
  // dev.
  test.for([true, false])(
    'vite: an edit of a React .ts route module shows its new loader data in place (autoCodeSplitting: %s)',
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      expect(
        await editRoute(
          {
            pluginOptions: { autoCodeSplitting },
            files: { 'routes/__root.tsx': rootShowingLoaderData },
            file: 'routes/index.ts',
            route: (version) =>
              `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'data ${version}' })
`,
            shows: (version) => `root data ${version}`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: same root cause, for a React app without `@vitejs/plugin-react`
  // (Vite compiles the JSX itself; nothing registers React Refresh
  // boundaries): the route module's own accept call is on an alias, so the
  // page reloads on every edit. (Without a refresh runtime, the new
  // component may be mounted anew: a subtree replacement, not a document
  // reload.)
  // Impact: every edit of a route file reloads the page in a Vite React app
  // without the React plugin.
  test.for([true, false])(
    'vite: an edit of a route component in an app without @vitejs/plugin-react shows in place (autoCodeSplitting: %s)',
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      expect(
        await editRoute(
          {
            frameworkPlugin: false,
            pluginOptions: { autoCodeSplitting },
            file: 'routes/index.tsx',
            route: (version) => counterRoute(version),
            shows: (version) => `Page ${version} count`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: `handleRouteUpdate` keeps the previous component options so that
  // React Refresh patches them in place, also when the edit replaced the
  // component with another one (renamed, so another component family for
  // React Refresh), which React Refresh never patches. With automatic code
  // splitting, the kept lazy component keeps the component its chunk loaded
  // first. The same happens when an edit replaces inline route options of a
  // split route with options a factory call builds.
  // Impact: after renaming a route's component, the page keeps showing the
  // old component until a reload (Vite and Rsbuild).
  // Source: router-plugin src/core/hmr/handle-route-update.ts (component
  // keys kept whenever both versions have them); NEW (hmr-real, found by the
  // real-page harness; the former model treated it as expected).
  // Goal: a hot update rendering the new component (React mounts it anew),
  // without a full reload or errors.
  describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
    test.for([true, false])(
      'renaming the route component shows the renamed component in place (autoCodeSplitting: %s)',
      async (
        autoCodeSplitting: boolean,
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': counterRoute('v1') },
          ready: 'Page v1 count 0',
        })
        expect(
          await app.edit(
            { 'routes/index.tsx': counterRoute('v2', 'Renamed') },
            'Renamed v2 count',
          ),
        ).toEqual(inPlace)
      },
    )
  })

  // On Rsbuild (Rspack), an edit that only changes a loader split from the
  // route module (`codeSplitGroupings` with `loader` in a chunk) leaves the
  // route module's code unchanged: the chunk's own dev block asks the live
  // route to refresh when the chunk is evaluated again after its hot update
  // (its export is no React Refresh boundary, so the update reaches its
  // importer, which re-imports it). Vite re-runs the route module itself
  // (route-hmr-browser.test.ts).
  // Source: NEW (hmr-real).
  test.for([`[['loader'], ['component']]`, `[['component', 'loader']]`])(
    'rsbuild: an edit of a split loader (codeSplitGroupings: %s) shows its data in place',
    async (groupings: string, { expect, onTestFinished }: TestContext) => {
      const route = (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return <p>{Route.useLoaderData()}</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'loader ${version}',
  component: Page,
  codeSplitGroupings: ${groupings},
})
`
      const app = await openRouteHmrPage({
        bundler: 'rsbuild',
        onTestFinished,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'loader v1',
      })
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'loader v2'),
      ).toEqual(inPlace)
    },
  )
})
