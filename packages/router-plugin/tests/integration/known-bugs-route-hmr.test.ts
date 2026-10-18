/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload. Pins of what
 * the page shows run a real dev server and a real browser page
 * (`route-hmr-page.ts`).
 */

import { describe, expect, test } from 'vitest'
import type { TestContext } from 'vitest'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
import { openRouteHmrPage } from '../route-hmr-page'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

// Route HMR in a real dev server and a real browser page
// (`route-hmr-page.ts`, as route-hmr-browser.test.ts). A pin waits for the
// new code at most `pinTimeout`, well under the test timeout.
// Concurrent: each pin mostly waits (`pinTimeout`) for an edit that never
// shows.
describe.concurrent('route HMR in a real page', { timeout: 60_000 }, () => {
  const pinTimeout = 3_000

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
   * Opens a React app in Vite whose route file `file` is `route('v1')`,
   * waits until it shows `shows('v1')`, edits it to `route('v2')` and
   * returns whether the page reloaded once it shows `shows('v2')` (waiting
   * at most `timeout`).
   */
  async function editComponent(
    {
      file,
      autoCodeSplitting,
      route,
      shows,
    }: {
      file: string
      autoCodeSplitting: boolean
      route: (version: string) => string
      shows: (version: string) => string
    },
    onTestFinished: TestContext['onTestFinished'],
    timeout?: number,
  ) {
    const app = await openRouteHmrPage({
      onTestFinished,
      pluginOptions: { autoCodeSplitting },
      files: { [file]: route('v1') },
      ready: shows('v1'),
    })
    return app.edit({ [file]: route('v2') }, shows('v2'), { timeout })
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

  // Control for the inline component pins below (same harness).
  test('vite: an edit of a component passed as memo(Page) shows in place (autoCodeSplitting: false)', async ({
    expect,
    onTestFinished,
  }) => {
    expect(
      await editComponent(
        {
          file: 'routes/index.tsx',
          autoCodeSplitting: false,
          route: inlineRoute(
            `import { memo } from 'react'
function Page() {
  return <p>page v1</p>
}`,
            () => 'component: memo(Page)',
          ),
          shows: () => 'page v1',
        },
        onTestFinished,
      ),
    ).toEqual({ reloaded: false })
  })

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
      autoCodeSplitting: false,
      route: inlineRoute(
        imports!,
        (version) => `component: ${component!.replace('VERSION', version)}`,
      ),
      shows: (version: string) => `inline ${version}`,
    })),
    ...[false, true].map((autoCodeSplitting) => ({
      name: 'method shorthand',
      file: 'routes/index.tsx',
      autoCodeSplitting,
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
      autoCodeSplitting: true,
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
    'vite: an edit of an inline component written as $name shows in place (autoCodeSplitting: $autoCodeSplitting)',
    async (row, { expect, onTestFinished }: TestContext) => {
      expect(await editComponent(row, onTestFinished, pinTimeout)).toEqual({
        reloaded: false,
      })
    },
  )

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
      const route = (version: string) =>
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
      const app = await openRouteHmrPage({
        target,
        onTestFinished,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page v1 data v1',
      })
      const liveComponent = `window.__TSR_ROUTER__.routesById['/'].options.component`
      await app.evaluate(`window.shownComponent = ${liveComponent}`)
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2 data v2', {
          timeout: pinTimeout,
        }),
      ).toEqual({ reloaded: false })
      expect(
        await app.evaluate(`window.shownComponent === ${liveComponent}`),
      ).toBe(true)
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
  // Any fix passes: a hot update rendering the new component (React mounts
  // it anew), or a reload.
  describe.each(['vite', 'rsbuild'] as const)('%s', (bundler) => {
    test.fails.for([true, false])(
      'renaming the route component shows the renamed component (autoCodeSplitting: %s)',
      async (autoCodeSplitting: boolean, { onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: { 'routes/index.tsx': counterRoute('v1') },
          ready: 'Page v1 count 0',
        })
        await app.edit(
          { 'routes/index.tsx': counterRoute('v2', 'Renamed') },
          'Renamed v2 count',
          { timeout: pinTimeout },
        )
      },
    )
  })

  // Bug: on Rsbuild (Rspack), an edit that only changes a loader split from
  // the route module (`codeSplitGroupings` with `loader` in a chunk) never
  // reaches the page: the route module's code is unchanged, so Rspack does
  // not run it again and the route HMR code (`webpack-adapter.ts`, in the
  // route module only) never refreshes the route; the split loader module
  // accepts no update of its own. With Rsbuild's default lazy compilation
  // the loaded chunk is not even updated; without it (`dev.lazyCompilation:
  // false`), the next load gets the new loader, but nothing reloads the
  // route. Vite updates the route in place (route-hmr-browser.test.ts).
  // Impact: the page keeps the old loader's data until a reload or a
  // navigation, with no sign that the edit was not applied.
  // Source: router-plugin src/core/hmr/webpack-adapter.ts (HMR code only in
  // the route module); NEW (hmr-real).
  // Any fix passes: a hot update showing the new loader's data, or a reload.
  test.fails.for([`[['loader'], ['component']]`, `[['component', 'loader']]`])(
    'rsbuild: an edit of a split loader (codeSplitGroupings: %s) shows its data',
    async (groupings: string, { onTestFinished }: TestContext) => {
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
      await app.edit({ 'routes/index.tsx': route('v2') }, 'loader v2', {
        timeout: pinTimeout,
      })
    },
  )

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
    'vite: an edit that removes a split option the page loaded applies without errors',
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        files: {
          'routes/index.tsx': counterRoute(
            'v1',
            'Page',
            `errorComponent: Failed,
  loader: () => {
    throw new Error('loader failed')
  },`,
          ),
        },
        ready: 'failed v1',
      })
      const errors = app.page.errors.length
      expect(
        await app.edit({ 'routes/index.tsx': counterRoute('v2') }, 'Page v2', {
          timeout: pinTimeout,
        }),
      ).toEqual({ reloaded: false })
      expect(app.page.errors.slice(errors)).toEqual([])
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
  // Any fix passes: a hot update rendering the new component, or a reload.
  test.fails.for([true, false])(
    'rsbuild without React Refresh: an edit of the route component shows (autoCodeSplitting: %s)',
    async (autoCodeSplitting: boolean, { onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        bundler: 'rsbuild',
        onTestFinished,
        reactRefresh: false,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': counterRoute('v1') },
        ready: 'Page v1 count 0',
      })
      await app.edit({ 'routes/index.tsx': counterRoute('v2') }, 'Page v2', {
        timeout: pinTimeout,
      })
    },
  )
})

describe('production builds', () => {
  /**
   * Builds a production client bundle with automatic code splitting on or
   * off (off: the route HMR plugin's case), the plugin's own `addHmr`
   * default and `NODE_ENV` as given (`null`: unset), and returns where a
   * bundler HMR API is used.
   */
  async function hmrPlacement(
    bundler: Bundler,
    autoCodeSplitting: boolean,
    nodeEnv?: null,
  ) {
    const app = await build({
      bundler,
      env: 'client',
      nodeEnv,
      pluginOptions: {
        autoCodeSplitting,
        codeSplittingOptions: { addHmr: undefined },
      },
      files: routeApp(
        `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        { env: 'client' },
      ),
    })
    return app.where(/import\.meta\.(?:webpackHot|hot)\b|\bmodule\.hot\b/)
  }

  // No Vite rows: Vite replaces `import.meta.hot` with `undefined` in a
  // build and drops the code it guards, so they could not fail.

  // Control for the pin below: with `NODE_ENV=production` exported.
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, false)).toBe('nowhere')
    },
    60_000,
  )

  // Source: gap P1 / DV51. (No esbuild row: the esbuild plugin neither
  // generates nor splits routes, pinned in build-harness.test.ts, so it
  // could not fail.)
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle with automatic code splitting has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, true)).toBe('nowhere')
    },
    60_000,
  )

  // Bug: with automatic code splitting off, the composed router plugin adds
  // the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
  // created (`router-composed-plugin.ts`), instead of following the
  // bundler's mode. webpack and Rspack set `NODE_ENV` only inside the bundle.
  // Source: gap CC-P1 / routes.md R7.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` ship the route HMR code of every route.
  test.fails.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code when NODE_ENV is unset (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, false, null)).toBe('nowhere')
    },
    60_000,
  )
})
