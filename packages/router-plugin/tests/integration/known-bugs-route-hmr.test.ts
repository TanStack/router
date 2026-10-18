// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../known-bugs-route-hmr.test.ts (fast tier); the
// production-build pins are in known-bugs-route-hmr-production.test.ts.
/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
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
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'
import type { EditResult, RouteHmrPageOptions } from '../route-hmr-page'

const inPlace = { reloaded: false, errors: [] }

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
   * Opens an app whose route file `file` is `route('v1')`, waits until it
   * shows `shows('v1')`, edits it to `route('v2')` and returns the result of
   * the edit once the page shows `shows('v2')`.
   */
  async function editRoute(
    {
      file,
      route,
      shows,
      ...options
    }: Partial<RouteHmrPageOptions> & {
      file: string
      route: (version: string) => string
      shows: (version: string) => string
    },
    onTestFinished: TestContext['onTestFinished'],
  ): Promise<EditResult> {
    const app = await openRouteHmrPage({
      ...options,
      onTestFinished,
      files: { ...options.files, [file]: route('v1') },
      ready: shows('v1'),
    })
    return app.edit({ [file]: route('v2') }, shows('v2'))
  }

  /** A route at `/` with the `component` option `option`, after `imports`. */
  const inlineRoute =
    (imports: string, option: (version: string) => string) =>
    (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
${imports}
export const Route = createFileRoute('/')({
  ${option(version)},
})
`

  // Controls for the inline component pins below (same harness): a
  // component wrapped in `memo` or `forwardRef` at the option, declared
  // under a name React Refresh registers, is patched in place with its
  // state.
  test.for(['memo', 'forwardRef'])(
    'vite: an edit of a component passed as %s(Page) shows in place with its state (autoCodeSplitting: false)',
    async (wrapper: string, { expect, onTestFinished }: TestContext) => {
      const route = inlineRoute('', () => `component: ${wrapper}(Page)`)
      const file = 'routes/index.tsx'
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting: false },
        files: {
          [file]: `import { ${wrapper}, useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page v1 count {count}</button>
}
${route('v1')}`,
        },
        ready: 'page v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('page v1 count 1', { selector: '#app' })
      expect(
        await app.edit(
          {
            [file]: `import { ${wrapper}, useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page v2 count {count}</button>
}
${route('v2')}`,
          },
          'page v2 count 1',
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand, a function wrapped in a TypeScript
  // `as` / `satisfies`) are neither hoisted nor registered for React
  // Refresh, nor is the function they wrap; route HMR keeps the previous
  // component for React Refresh to patch, which it cannot.
  // Impact: on unsplit routes (root routes, or file routes without automatic
  // code splitting), and for a split method-shorthand component, edits to
  // these components do not show until a reload.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline
  // functions" and "registers top-level variable declarations with arrow
  // functions"; #8504 react-refresh-route-components ("written inline and
  // wrapped in ..."), where the wrapped rows pass; ruling on #8721 "keeps a
  // method-shorthand component option" (split row). Formerly read React
  // Refresh's registrations and modelled its runtime (ruling 2026-10-18).
  // Any fix passes: the edit shows without a full reload.
  test.fails.for([
    ...[
      ['as any', '', `(() => <p>inline VERSION</p>) as any`],
      [
        'satisfies',
        `import type { FC } from 'react'`,
        `(() => <p>inline VERSION</p>) satisfies FC`,
      ],
      [
        'memo(() => ...)',
        `import { memo } from 'react'`,
        `memo(() => <p>inline VERSION</p>)`,
      ],
      [
        'forwardRef(function () { ... })',
        `import { forwardRef } from 'react'`,
        `forwardRef(function (props, ref) {
    return <p ref={ref}>inline VERSION</p>
  })`,
      ],
    ].map(([name, imports, component]) => ({
      name: name!,
      file: 'routes/index.tsx',
      pluginOptions: { autoCodeSplitting: false },
      route: inlineRoute(
        imports!,
        (version) => `component: ${component!.replace('VERSION', version)}`,
      ),
      shows: (version: string) => `inline ${version}`,
    })),
    ...[false, true].map((autoCodeSplitting) => ({
      name: 'method shorthand',
      file: 'routes/index.tsx',
      pluginOptions: { autoCodeSplitting },
      route: inlineRoute(
        '',
        (version) => `component() {
    return <p>inline ${version}</p>
  }`,
      ),
      shows: (version: string) => `inline ${version}`,
    })),
    {
      name: 'React.memo(forwardRef(...)) on a root route',
      file: 'routes/__root.tsx',
      pluginOptions: { autoCodeSplitting: true },
      route: (version: string) => `import React, { forwardRef } from 'react'
import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: React.memo(forwardRef(function Root(props, ref) {
    return <p ref={ref}>root ${version}</p>
  })),
})
`,
      shows: (version: string) => `root ${version}`,
    },
  ])(
    'vite: an edit of an inline component written as $name shows in place (autoCodeSplitting: $pluginOptions.autoCodeSplitting)',
    async (row, { expect, onTestFinished }: TestContext) => {
      expect(await editRoute(row, onTestFinished)).toEqual(inPlace)
    },
  )

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
  // Impact: every edit of a Solid or Vue route file with automatic code
  // splitting reloads the page in Vite dev, losing its state, instead of
  // patching it in place.
  // Goal (any fix): in a Vite dev server with the framework's plugin, the
  // edit shows without a full reload, and the live route keeps the component
  // the page rendered.
  // Source: decision D10 (Solid/Vue split components keep their identity
  // across hot updates, as React's do); gaps H8/H9.
  test.fails.for(['solid', 'vue'] as const)(
    'vite: an edit of a split %s route shows in place, keeping the split component',
    async (
      target: 'solid' | 'vue',
      { expect, onTestFinished }: TestContext,
    ) => {
      const route = frameworkRoute(target)
      const app = await openRouteHmrPage({
        target,
        onTestFinished,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page v1 data v1',
      })
      const liveComponent = `window.__TSR_ROUTER__.routesById['/'].options.component`
      await app.evaluate(`window.shownComponent = ${liveComponent}`)
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2 data v2'),
      ).toEqual(inPlace)
      expect(
        await app.evaluate(`window.shownComponent === ${liveComponent}`),
      ).toBe(true)
    },
  )

  // Bug: the Vite route HMR code calls `accept` on a local alias
  // (`const hot = import.meta.hot`), and Vite only marks a module
  // self-accepting when its code contains a literal `import.meta.hot.accept(`.
  // A route module is then never an HMR boundary of its own: the update
  // propagates to the route tree and the app entry, and the page reloads.
  // React apps are not affected because React Refresh makes route modules
  // boundaries (route-hmr-browser.test.ts); Solid Refresh only does for
  // modules that declare components (route-hmr-browser-frameworks.test.ts:
  // an unsplit Solid route applies in place), and Vue JSX only for
  // `defineComponent` components.
  // Impact: every edit of a Vue route file reloads the page in Vite dev (and
  // of a split Solid route: the pin above).
  // Any boundary (the route module or an importer that accepts it) passes.
  test.fails(
    'vite: an edit of an unsplit Vue route shows in place',
    async ({ expect, onTestFinished }: TestContext) => {
      expect(
        await editRoute(
          {
            target: 'vue',
            pluginOptions: { autoCodeSplitting: false },
            file: 'routes/index.tsx',
            route: frameworkRoute('vue'),
            shows: (version) => `page ${version} data ${version}`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: on Rsbuild, an edit of an unsplit Solid route file (the route HMR
  // plugin alone) shows its new loader data but keeps rendering the old
  // component: the route module runs again with Solid Refresh, the route
  // HMR code gives the live route the new options, but the rendered
  // component is not replaced nor refreshed. Split Solid routes on Rsbuild,
  // and unsplit Solid routes in Vite, apply in place
  // (route-hmr-browser-frameworks.test.ts).
  // Impact: edits of a Solid route's component do not show until a reload
  // in an Rsbuild app without automatic code splitting.
  // Source: NEW (W2-g, found by the Rsbuild Solid page).
  test.fails(
    'rsbuild: an edit of an unsplit Solid route shows its new component in place',
    async ({ expect, onTestFinished }: TestContext) => {
      expect(
        await editRoute(
          {
            bundler: 'rsbuild',
            target: 'solid',
            pluginOptions: { autoCodeSplitting: false },
            file: 'routes/index.tsx',
            route: frameworkRoute('solid'),
            shows: (version) => `page ${version} data ${version}`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: a route a helper function of the route file creates
  // (`export const Route = makeRoute()`, decision D11) edited without
  // automatic code splitting (the route HMR plugin alone) shows its new
  // loader data but keeps rendering the old inline component: the route HMR
  // code keeps the previous component for React Refresh to patch, but the
  // component inside the helper is neither hoisted nor registered. With
  // automatic code splitting, and for an IIFE, the edit shows
  // (route-hmr-browser-plugin.test.ts).
  // Impact: edits of such a route's component do not show until a reload.
  // Source: NEW (W2-g, found by the real page; the former in-process model
  // compared a component whose text did not change between versions).
  test.fails.for(['vite', 'rsbuild'] as const)(
    '%s: an edit of a route a helper function creates shows its new component in place (autoCodeSplitting: false)',
    async (
      bundler: 'vite' | 'rsbuild',
      { expect, onTestFinished }: TestContext,
    ) => {
      expect(
        await editRoute(
          {
            bundler,
            pluginOptions: { autoCodeSplitting: false },
            file: 'routes/index.tsx',
            route: (version) =>
              `import { createFileRoute } from '@tanstack/react-router'
function makeRoute() {
  return createFileRoute('/')({
    loader: () => 'data ${version}',
    component: () => <p>helper ${version} {Route.useLoaderData()}</p>,
  })
}
export const Route = makeRoute()
`,
            shows: (version) => `helper ${version} data ${version}`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
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
  test.fails.for([true, false])(
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
  test.fails.for([true, false])(
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
    test.fails.for([true, false])(
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

  // Bug: on Rsbuild (Rspack), an edit that only changes a loader split from
  // the route module (`codeSplitGroupings` with `loader` in a chunk) never
  // reaches the page: the route module's code is unchanged, so Rspack does
  // not run it again and the route HMR code (`webpack-adapter.ts`, in the
  // route module only) never refreshes the route; the split loader module
  // accepts no update of its own. The next load gets the new loader, but
  // nothing reloads the route. Vite updates the route in place
  // (route-hmr-browser.test.ts).
  // Impact: the page keeps the old loader's data until a reload or a
  // navigation, with no sign that the edit was not applied.
  // Source: router-plugin src/core/hmr/webpack-adapter.ts (HMR code only in
  // the route module); NEW (hmr-real).
  // Goal: a hot update showing the new loader's data, without a full reload.
  test.fails.for([`[['loader'], ['component']]`, `[['component', 'loader']]`])(
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

  /**
   * The index route whose loader throws, with (`errorComponent: Failed`) or
   * without its error component: without it, the router's default error
   * component shows the error.
   */
  const failingRoute = (version: string, errorComponent: boolean) =>
    counterRoute(
      version,
      'Page',
      `${errorComponent ? 'errorComponent: Failed,\n  ' : ''}loader: () => {
    throw new Error('loader failed')
  },`,
    )

  /**
   * Opens an app whose index route shows its error component, edits the
   * route so that it has no error component anymore, and returns the result
   * of the edit (without the deliberate loader error the app reports) once
   * the page shows the router's default error component.
   */
  async function removeErrorComponent(
    options: Pick<RouteHmrPageOptions, 'bundler' | 'pluginOptions'>,
    onTestFinished: TestContext['onTestFinished'],
  ) {
    const app = await openRouteHmrPage({
      ...options,
      onTestFinished,
      files: { 'routes/index.tsx': failingRoute('v1', true) },
      ready: 'failed v1',
    })
    const result = await app.edit(
      { 'routes/index.tsx': failingRoute('v2', false) },
      /^(?!.*failed v).*loader failed/,
    )
    return {
      reloaded: result.reloaded,
      errors: result.errors.filter((error) => !error.includes('loader failed')),
    }
  }

  // Bug: an edit that removes a split component option (here
  // `errorComponent`, which the page had loaded) leaves its split module in
  // Vite's module graph; Vite updates it with the rest of the route file, the
  // code splitter serves it without any export or import, and
  // `@vitejs/plugin-react` compiles that module's JSX as CommonJS
  // (`require("react/jsx-dev-runtime")`).
  // Impact: the page logs "[vite] ReferenceError: require is not defined"
  // and "[vite] Failed to reload /routes/index.tsx?tsr-split=errorComponent";
  // some runs reload the page.
  // Source: router-plugin src/core/code-splitter (the virtual split module
  // of an option the route file no longer has); NEW (hmr-real).
  // Goal (any fix): the edit applies in place, and the page logs no error.
  test.fails(
    'vite: an edit that removes a split option the page loaded applies in place without errors',
    async ({ expect, onTestFinished }: TestContext) => {
      expect(
        await removeErrorComponent(
          { pluginOptions: { autoCodeSplitting: true } },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Controls for the pin above: the same removal applies in place where the
  // option was not split (Vite), and on Rsbuild (its hot update replaces the
  // route module and its chunks together).
  test.for([
    { bundler: 'vite', autoCodeSplitting: false },
    { bundler: 'rsbuild', autoCodeSplitting: true },
    { bundler: 'rsbuild', autoCodeSplitting: false },
  ] as const)(
    '$bundler: an edit that removes a component option the page loaded applies in place without errors (autoCodeSplitting: $autoCodeSplitting)',
    async (
      { bundler, autoCodeSplitting },
      { expect, onTestFinished }: TestContext,
    ) => {
      expect(
        await removeErrorComponent(
          { bundler, pluginOptions: { autoCodeSplitting } },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: `handleRouteUpdate` keeps the previous component options for React
  // Refresh to patch in place, also when no React Refresh runtime is
  // installed (an Rsbuild React app with `pluginReact({ fastRefresh: false
  // })`, or webpack / Rspack without a refresh plugin, like the webpack
  // quickstart example with the default `addHmr`), so the new component
  // never renders. With automatic code splitting, the kept component is the
  // old chunk's.
  // Impact: the bundler reports the route as hot-updated, but the page shows
  // the old component until a reload; without the route HMR code the same
  // edit reloads the page.
  // Goal: a hot update rendering the new component (mounted anew, without a
  // refresh runtime), without a full reload.
  test.fails.for([true, false])(
    'rsbuild without React Refresh: an edit of the route component shows in place (autoCodeSplitting: %s)',
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      expect(
        await editRoute(
          {
            bundler: 'rsbuild',
            reactRefresh: false,
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

  /** A route at `/` declared under another name and exported as `Route`. */
  const aliasedRoute = (version: string) =>
    `import { createFileRoute } from '@tanstack/react-router'
const MyRoute = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: () => <p>page {MyRoute.useLoaderData()}</p>,
})
export { MyRoute as Route }
`

  // Bug: the injected HMR code reads the module's route through the
  // identifier `Route`, but a route may be declared under another name and
  // exported as `Route` (`export { MyRoute as Route }`).
  // Impact: Rsbuild (webpack-style HMR) apps throw "Route is not defined"
  // when the route module loads in development, so the page never renders;
  // Vite apps throw on the first hot update of the route, which never shows.
  // Control: the ordinary `export const Route` of every other test here.
  describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
    test.fails(
      'a route exported under another local name is hot-updated in place',
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: { 'routes/index.tsx': aliasedRoute('v1') },
          ready: 'page data v1',
          // Rsbuild: the page never renders
          readyTimeout: 4_000,
        })
        expect(
          await app.edit(
            { 'routes/index.tsx': aliasedRoute('v2') },
            'page data v2',
            // Vite: the update's callback throws, so the client never
            // reports it applied
            { timeout: 4_000 },
          ),
        ).toEqual(inPlace)
      },
    )
  })

  /**
   * The index route of an app without automatic code splitting (the route
   * HMR plugin alone) whose `pendingComponent` renders an `ErrorBoundary`
   * (`react-error-boundary`) around a child that throws, with the lowercase
   * `errorFallback` component as its fallback; `errorComponent` reads the
   * same component when `alsoErrorComponent`. The loader never settles, so
   * the pending component shows.
   */
  const errorBoundaryRoute = (alsoErrorComponent: boolean) =>
    `import { createFileRoute } from '@tanstack/react-router'
import { ErrorBoundary } from 'react-error-boundary'
const errorFallback = () => <p>fallback shown</p>
function Thrower() {
  throw new Error('child failed')
}
export const Route = createFileRoute('/')({
  loader: () => new Promise(() => {}),
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => (
    <ErrorBoundary FallbackComponent={errorFallback}>
      <Thrower />
    </ErrorBoundary>
  ),${alsoErrorComponent ? '\n  errorComponent: errorFallback,' : ''}
})
`

  // Control for the hoisted inline component pin below (same harness): an
  // inline component reading a lowercase component renders it (the real
  // `react-error-boundary` shows the fallback once its child throws).
  test('vite: an inline pending component rendering an error boundary with a lowercase fallback shows the fallback', async ({
    expect,
    onTestFinished,
  }: TestContext) => {
    const app = await openRouteHmrPage({
      onTestFinished,
      pluginOptions: { autoCodeSplitting: false },
      files: { 'routes/index.tsx': errorBoundaryRoute(false) },
      ready: 'fallback shown',
    })
    expect(
      app.page.errors.some((error) => error.includes('child failed')),
    ).toBe(true)
  })

  // Bug: React HMR hoists inline component options into declarations it
  // inserts after visiting every option, and renames a lowercase component
  // passed to a later option. The rename only reaches nodes attached to the
  // program, so a hoisted component still reads the old name.
  // Impact: in development, the hoisted component throws when it renders
  // (ReferenceError: errorFallback is not defined).
  // Fix: rename before hoisting (or insert hoisted declarations immediately),
  // or rename through the analyzer's binding references.
  test.fails(
    'vite: an inline pending component hoisted before a renamed lowercase component renders it',
    async ({ onTestFinished }: TestContext) => {
      await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting: false },
        files: { 'routes/index.tsx': errorBoundaryRoute(true) },
        ready: 'fallback shown',
        readyTimeout: 4_000,
      })
    },
  )
})
