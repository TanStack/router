// Slow-tier pins of route HMR in a real page (continued from
// known-bugs-route-hmr.test.ts: two files, to keep each within the per-file
// time budget): edits that remove options, aliased route exports, and
// error boundaries.
/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
 * See known-bugs-route-hmr.test.ts for how the pins observe the page.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { editRoute, inPlace } from '../route-hmr-edit'
import type { TestContext } from 'vitest'
import type { RouteHmrPageOptions } from '../route-hmr-page'

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
