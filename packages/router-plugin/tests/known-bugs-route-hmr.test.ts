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
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { describe, expect, test } from 'vitest'
import type { TestContext } from 'vitest'
import { build, routeApp } from './build-harness'
import {
  evaluateModule,
  expectValidModules,
  head,
  hotUpdate,
  loadRoute,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { openRouteHmrPage } from './route-hmr-page'
import { editRouteFile } from './vite-hot-update'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { PluginOption } from 'vite'

describe('React Refresh registration', () => {
  // Inline components that are not plain functions (`memo(...)`, ...):
  // pinned in a real page below ("route HMR in a real page").

  /**
   * Loads, with React HMR and React Refresh, a route whose `component` option
   * is `name`, declared by `declaration`, and returns the component the route
   * renders once its lazy option loaded, and the components React Refresh
   * registers.
   */
  async function splitComponentRegistration(declaration: string, name: string) {
    const route = await loadRoute(
      `${head}${declaration}
export const Route = createFileRoute('/')({ component: ${name} })`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    const binding = await route.load('component')
    expect(binding).toBeDefined()
    return { binding, registered: [...route.registered.keys()] }
  }

  // Source: add-hmr snapshot fixture createFileRoute-lowercase-components:
  // with the default groupings, the lowercase `component` and
  // `errorComponent` are split and `pendingComponent` stays in the route
  // module; each one is registered.
  test('registers lowercase function components, split and unsplit, with the default groupings', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})
function pendingComponent() {
  return <div>Pending</div>
}
function errorComponent() {
  return <div>Error</div>
}
function component() {
  return <div>Hello</div>
}`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    expect(
      ['component', 'errorComponent', 'pendingComponent'].map(route.isLazy),
    ).toEqual([true, true, false])
    for (const [option, text] of [
      ['component', 'Hello'],
      ['errorComponent', 'Error'],
      ['pendingComponent', 'Pending'],
    ]) {
      const component = await route.load(option!)
      expect(component()).toBe(`<div>${text}</div>`)
      expect(route.registered.has(component), option).toBe(true)
    }
  })

  // Control for the lowercase pin below (same harness).
  test('registers a PascalCase split component', async () => {
    const { binding, registered } = await splitComponentRegistration(
      `const Page = () => <p>hi</p>`,
      'Page',
    )
    expect(registered).toContain(binding)
  })

  // Control for the lowercase pin below: lowercase function declarations
  // of each split component option are registered.
  test.each(['component', 'pendingComponent', 'errorComponent'])(
    'registers a split %s declared as a lowercase function',
    async (option) => {
      const route = await loadRoute(
        `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['pendingComponent'], ['errorComponent']],
  ${option},
})
function ${option}() {
  return <div>lowercase function declaration</div>
}`,
        { hmr: true, refresh: true },
      )
      await expectValidModules(route.modules)
      expect(route.isLazy(option)).toBe(true)
      expect(route.registered.has(await route.load(option))).toBe(true)
    },
  )

  // Bug: a lowercase component declared as a variable keeps its name in its
  // split chunk, and React Refresh registers PascalCase names only (a
  // lowercase `function` declaration is renamed, a variable is not).
  // Impact: edits to the component are not hot-updated; the cached lazy
  // component keeps rendering the old code until a reload.
  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  test.fails.each([
    ['an arrow function', `const page = () => <p>hi</p>`],
    [
      'a function expression',
      `const page = function page() {\n  return <p>hi</p>\n}`,
    ],
  ])(
    'registers a lowercase split component declared as %s',
    async (_, declaration) => {
      const { binding, registered } = await splitComponentRegistration(
        declaration,
        'page',
      )
      expect(registered).toContain(binding)
    },
  )
})

describe('generated code', () => {
  /** Evaluates the route module compiled with HMR and returns its route. */
  async function evaluateRoute(code: string) {
    const { Route } = await loadRoute(code, { hmr: true })
    return Route as { options: { component?: unknown } }
  }

  // Control for the options-in-a-variable pins below (same harness).
  test.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
})`,
    },
    {
      name: 'a split file route',
      code: `${head}export const Route = createFileRoute('/')({
  component: () => <p>home</p>,
})`,
    },
  ])(
    'inline route options ($name) evaluate to a route with a component',
    async ({ code }) => {
      const Route = await evaluateRoute(code)
      expect(typeof Route.options.component).toBe('function')
    },
  )

  // Bug: when the route options are passed through a variable, the HMR
  // transforms replace `component` in the options object with a generated
  // binding declared after the object that reads it.
  // Impact: the route module throws a TDZ ReferenceError in development.
  test.fails.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
const options = {
  component: () => <Outlet />,
}
export const Route = createRootRoute(options)`,
    },
    {
      name: 'a split file route',
      code: `${head}const options = {
  component: () => <p>home</p>,
}
export const Route = createFileRoute('/')(options)`,
    },
  ])(
    'route options in a variable ($name) evaluate to a route with a component',
    async ({ code }) => {
      const Route = await evaluateRoute(code)
      expect(typeof Route.options.component).toBe('function')
    },
  )

  // Bug: our `react-refresh-ignored-route-exports` compiler plugin injects a
  // top-level `const hot = import.meta.hot` that collides with a user's
  // top-level `hot` binding (compile error `Duplicate declaration "hot"`).
  // Impact: the route cannot be served in development.
  test.fails.each([
    { name: 'a constant', declaration: `const hot = 'hot'`, exported: false },
    {
      name: 'an exported constant',
      declaration: `export const hot = 'hot'`,
      exported: true,
    },
  ])(
    'a user binding named hot ($name) does not collide with the injected HMR code',
    async ({ declaration, exported }) => {
      const route = await loadRoute(
        `${head}${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>{hot}</p>,
})`,
        { hmr: true },
      )
      await expectValidModules(route.modules)
      expect((await route.load('component'))()).toBe('<p>hot</p>')
      if (exported) {
        // A module importing it gets the user's value.
        const { hot } = await route.importFromRoute(
          `export { hot } from '${routeSpecifier}'`,
        )
        expect(hot).toBe('hot')
      }
    },
  )

  /**
   * Loads, with HMR, a route whose `page` component (declared by
   * `declaration`) is both the `component` and the `notFoundComponent`,
   * which the default groupings split into two chunks, so the code splitter
   * shares `page` between them. Renders the component, then the not-found
   * component. `page` counts its renders in a module-level `let` initialized
   * by `init` from `./state`. Returns both renders and how many times `init`
   * ran.
   */
  async function renderSharedComponent(declaration: string) {
    let inits = 0
    const route = await loadRoute(
      `${head}import { init } from './state'
let renders = init(0)
${declaration}
export const Route = createFileRoute('/')({
  component: page,
  notFoundComponent: page,
})`,
      {
        hmr: true,
        stubs: {
          './state': {
            init: (value: number) => {
              inits++
              return value
            },
          },
        },
      },
    )
    const component = await route.load('component')
    const notFound = await route.load('notFoundComponent')
    return [component(), notFound(), inits]
  }

  // Control for the lowercase shared component pin below (same harness).
  test('a lowercase arrow component split into two chunks renders with the module state they share', async () => {
    expect(
      await renderSharedComponent(`const page = () => {
  renders++
  return <p>{renders}</p>
}`),
    ).toEqual(['<p>1</p>', '<p>2</p>', 1])
  })

  // Bug: React HMR renames a lowercase `function` component in its split
  // chunk even when the code splitter moved the component to the shared
  // module, so the chunk exports `SplitComponent`, which nothing declares.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  test.fails(
    'a lowercase function component split into two chunks renders with the module state they share',
    async () => {
      expect(
        await renderSharedComponent(`function page() {
  renders++
  return <p>{renders}</p>
}`),
      ).toEqual(['<p>1</p>', '<p>2</p>', 1])
    },
  )

  // Bug: same root cause as the pin above, for a lowercase component that
  // the split `component` and the unsplit `pendingComponent` share. Both
  // options must be registered: a lowercase `pendingComponent` that React
  // Refresh never registers, or a renamed copy in the chunk (another
  // function than the pendingComponent), is still this bug.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined), or the pending
  // component loses its state on hot updates.
  // Source: #8504 react-refresh-route-components ("that is also the unsplit
  // pendingComponent"), which checks the chunk's registration only.
  test.fails(
    'a lowercase function component that is also the unsplit pendingComponent is registered in both',
    async () => {
      const route = await loadRoute(
        `${head}function page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: page, pendingComponent: page })`,
        { hmr: true, refresh: true },
      )
      await expectValidModules(route.modules)
      const component = await route.load('component')
      const pending = await route.load('pendingComponent')
      expect([component(), pending()]).toEqual(['<p>hi</p>', '<p>hi</p>'])
      expect(route.registered.has(component)).toBe(true)
      expect(route.registered.has(pending)).toBe(true)
    },
  )

  // Bug: with React HMR, the code splitter moves a component exported by an
  // export list (`export { page }`) into its chunk and leaves the export list
  // in the route module (same root cause as known-bugs-code-splitter.test.ts
  // "a split component that an export list reads renders from both").
  // Impact: in development, the route module fails to load
  // (SyntaxError: Export 'page' is not defined).
  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" (`export { Baz }`); #8504 react-refresh-route-components
  // ("keeps a component exported by specifier in the route module"), where it
  // passes. Whether the component is split is the code splitter's goal; either
  // way the export and the route render the same, registered component.
  test.fails(
    'a component exported by an export list is the registered component the route renders',
    async () => {
      const route = await loadRoute(
        `${head}const page = () => <p>hi</p>
export { page }
export const Route = createFileRoute('/')({ component: page })`,
        { hmr: true, refresh: true },
      )
      await expectValidModules(route.modules)
      const component = await route.load('component')
      expect(route.exports.page).toBe(component)
      expect(component()).toBe('<p>hi</p>')
      expect(route.registered.has(component)).toBe(true)
    },
  )

  /**
   * Compiles a route with the route HMR plugin (automatic code splitting
   * off), evaluates it and returns its route. `react-error-boundary`'s
   * `ErrorBoundary` renders its `FallbackComponent`, as when its children
   * throw.
   */
  async function evaluateUnsplitRoute(code: string) {
    const { Route } = await evaluateModule(transformWithRouteHmrPlugin(code), {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
      'react-error-boundary': {
        ErrorBoundary: ({
          FallbackComponent,
        }: {
          FallbackComponent: (props: object) => unknown
        }) => FallbackComponent({}),
      },
    })
    return Route as unknown as { options: Record<string, any> }
  }

  // Control for the lowercase shared component pins above: a lowercase
  // `function` loader that the split component also calls.
  test('a lowercase function loader the split component calls loads from its chunk', async () => {
    const route = await loadRoute(
      `${head}function getData() {
  return 'data'
}
export const Route = createFileRoute('/')({
  loader: getData,
  component: () => <p>{getData()}</p>,
  codeSplitGroupings: [['loader'], ['component']],
})`,
      { hmr: true },
    )
    await expectValidModules(route.modules)
    expect(route.isLazy('loader')).toBe(true)
    expect(await route.options.loader()).toBe('data')
    expect((await route.load('component'))()).toBe('<p>data</p>')
  })

  /** A lowercase error fallback, and an import of `ErrorBoundary`. */
  const errorFallback = `${head}import { ErrorBoundary } from 'react-error-boundary'
const errorFallback = () => <p>error</p>`

  // Control for the hoisted inline component pin below: an option that is
  // not an inline component, reading a lowercase component a later option
  // passes.
  test('an option reading a lowercase component a later option passes gets that component', async () => {
    const Route = await evaluateUnsplitRoute(`${errorFallback}
export const Route = createFileRoute('/')({
  staticData: { errorFallback },
  errorComponent: errorFallback,
})`)
    expect(Route.options.staticData.errorFallback).toBe(
      Route.options.errorComponent,
    )
    expect(Route.options.errorComponent()).toBe('<p>error</p>')
  })

  // Control for the hoisted inline component pin below (same harness).
  test('an inline component reading a lowercase component renders it', async () => {
    const Route = await evaluateUnsplitRoute(`${errorFallback}
export const Route = createFileRoute('/')({
  pendingComponent: () => (
    <ErrorBoundary FallbackComponent={errorFallback}>
      <p>loading</p>
    </ErrorBoundary>
  ),
})`)
    expect(Route.options.pendingComponent()).toBe('<p>error</p>')
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
    'an inline component hoisted before a renamed lowercase component renders it',
    async () => {
      const Route = await evaluateUnsplitRoute(`${errorFallback}
export const Route = createFileRoute('/')({
  pendingComponent: () => (
    <ErrorBoundary FallbackComponent={errorFallback}>
      <p>loading</p>
    </ErrorBoundary>
  ),
  errorComponent: errorFallback,
})`)
      expect(Route.options.pendingComponent()).toBe('<p>error</p>')
      expect(Route.options.errorComponent()).toBe('<p>error</p>')
    },
  )
})

describe('route updates', () => {
  /**
   * Compiles a route file at `/` with the route HMR plugin for `style` and
   * runs a hot update (`hotUpdate`). Returns whether the update reaches the
   * page: the live route now has the new module's `option`, or the module
   * asked the bundler for a full reload (`hot.invalidate()`).
   */
  async function updatesOption(
    code: string,
    style: 'vite' | 'webpack',
    option = 'loader',
  ) {
    const update = await hotUpdate(code, { style })
    return (
      update.invalidated || update.live[option] === update.created[1]![option]
    )
  }

  // Control for the route update pins below (same harness).
  test.each(['vite', 'webpack'] as const)(
    '%s: a hot update gives the live route the new options',
    async (style) => {
      expect(
        await updatesOption(
          `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})`,
          style,
        ),
      ).toBe(true)
    },
  )

  // Bug: the injected HMR code reads the module's route through the
  // identifier `Route`, but a route may be declared under another name and
  // exported as `Route` (`export { MyRoute as Route }`).
  // Impact: webpack and Rspack apps throw "Route is not defined" when the
  // route module loads in development; Vite apps throw on the first hot
  // update of the route.
  test.fails.each(['vite', 'webpack'] as const)(
    '%s: a route exported under another local name is hot-updated',
    async (style) => {
      expect(
        await updatesOption(
          `${head}const MyRoute = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})
export { MyRoute as Route }`,
          style,
        ),
      ).toBe(true)
    },
  )
})

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

describe('Vite HMR boundaries', () => {
  /** A route file of `target` whose component renders `text`. */
  const route =
    (target: 'react' | 'solid' | 'vue') =>
    (
      text: string,
    ) => `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => '${text}',
  component: Page,
})
function Page() {
  return <div>${text}</div>
}`

  /**
   * Edits the route file (`route` of `target`) in a dev server with the
   * framework's Vite plugins, after the page loaded it and, when split, its
   * component (`editRouteFile`).
   */
  const edit = (
    target: 'react' | 'solid' | 'vue',
    autoCodeSplitting: boolean,
    plugins: Array<PluginOption>,
    options: { file?: string; route?: (text: string) => string } = {},
  ) =>
    editRouteFile({
      target,
      autoCodeSplitting,
      plugins,
      file: options.file,
      route: options.route ?? route(target),
      loaded: autoCodeSplitting ? ['?tsr-split=component'] : [],
    })

  // Control for the pins below (same harness): with `@vitejs/plugin-react`,
  // React Refresh makes a React route module an HMR boundary.
  // Source: gap H6a.
  test.each([true, false])(
    'an edit of a React route module is a hot update with @vitejs/plugin-react (autoCodeSplitting: %s)',
    async (autoCodeSplitting) => {
      const served = await edit('react', autoCodeSplitting, [react()])
      expect(served.messages).toEqual([
        expect.stringMatching(/^client: update /),
      ])
      expect(served.hotUpdate).toBe(true)
    },
    30_000,
  )

  // Control (same harness): the route HMR plugin runs before React Refresh,
  // so a route whose components are all inline arrows still becomes a
  // boundary.
  test('an edit of a React route with only inline components is a hot update with @vitejs/plugin-react (autoCodeSplitting: false)', async () => {
    const served = await edit('react', false, [react()], {
      route: (text) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => '${text}',
  component: () => <p>${text}</p>,
})`,
    })
    expect(served.hotUpdate).toBe(true)
  }, 30_000)

  // Control (same harness): with `vite-plugin-solid`, Solid Refresh makes a
  // route module that declares its component an HMR boundary.
  test('an edit of a Solid route module that declares its component is a hot update with vite-plugin-solid (autoCodeSplitting: false)', async () => {
    const served = await edit('solid', false, [solid()])
    expect(served.hotUpdate).toBe(true)
  }, 30_000)

  // Bug: same root cause as the pin below, for a React route file without
  // JSX (`.ts`): React Refresh registers no component in it, so it is not a
  // boundary either.
  // Source: round-3 mutation testing (route HMR side finding).
  // Impact: every edit of a React `.ts` route file reloads the page in Vite
  // dev when automatic code splitting is off.
  test.fails(
    'an edit of a React .ts route module is a hot update with @vitejs/plugin-react (autoCodeSplitting: false)',
    async () => {
      const served = await edit('react', false, [react()], {
        file: 'routes/index.ts',
        route: (
          text,
        ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => '${text}' })`,
      })
      expect(served.hotUpdate).toBe(true)
    },
    30_000,
  )

  // Bug: the Vite route HMR code calls `accept` on a local alias
  // (`const hot = import.meta.hot`), and Vite only marks a module
  // self-accepting when its code contains a literal `import.meta.hot.accept(`.
  // A route module is then never an HMR boundary of its own: the update
  // propagates to the route tree and the app entry, and the page reloads.
  // React apps are not affected because React Refresh makes route modules
  // boundaries (control above); Solid Refresh only does for modules that
  // declare components (control above: not a split route module), and Vue
  // JSX only for `defineComponent` components.
  // Impact: every edit of a Solid route file with automatic code splitting,
  // and of any Vue route file, reloads the page in Vite dev.
  // Any boundary (the route module or an importer that accepts it) passes.
  test.fails.each([
    { target: 'solid', autoCodeSplitting: true, plugin: () => solid() },
    { target: 'vue', autoCodeSplitting: true, plugin: () => vueJsx() },
    { target: 'vue', autoCodeSplitting: false, plugin: () => vueJsx() },
  ] as const)(
    'an edit of a $target route module is a hot update with its framework plugin (autoCodeSplitting: $autoCodeSplitting)',
    async ({ target, autoCodeSplitting, plugin }) => {
      const served = await edit(target, autoCodeSplitting, [plugin()])
      expect(served.hotUpdate).toBe(true)
    },
    30_000,
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
