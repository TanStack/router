/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload.
 */
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import react from '@vitejs/plugin-react'
import { describe, expect, test } from 'vitest'
import { build, routeApp } from './build-harness'
import { routerDevServer, routerPackageStub } from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  expectRefreshableRouteOption,
  expectValidModules,
  exportedNames,
  head,
  hotUpdate,
  isRefreshable,
  loadRoute,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { PluginOption } from 'vite'

/** Compiles every module the code splitter emits, with React HMR. */
function compileWithCodeSplitting(code: string) {
  return compileRouteModules(code, { hmr: true }).modules
}

describe('React Refresh registration', () => {
  // Control for the inline component pins below (same assertion).
  test('a memo of a top-level component is refreshable', async () => {
    await expectRefreshableRouteOption(
      transformWithRouteHmrPlugin(`${head}import { memo } from 'react'
function Page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: memo(Page) })`),
      'component',
    )
  })

  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand, a function wrapped in a TypeScript
  // `as` / `satisfies` / `!`) are neither hoisted nor registered, nor is the
  // function they wrap.
  // Impact: on unsplit routes (root routes, or file routes without automatic
  // code splitting), edits to these components are dropped until a reload.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline
  // functions" and "registers top-level variable declarations with arrow
  // functions"; #8504 react-refresh-route-components ("written inline and
  // wrapped in ..."), where the wrapped rows pass.
  test.fails.each([
    ...[
      ['as any', `(() => <p>hi</p>) as any`],
      ['satisfies', `(() => <p>hi</p>) satisfies FC`],
      ['a non-null assertion', `(() => <p>hi</p>)!`],
    ].map(([wrapper, component]) => ({
      name: `a function wrapped in ${wrapper}`,
      code: `${head}import type { FC } from 'react'
export const Route = createFileRoute('/')({ component: ${component} })`,
      compile: transformWithRouteHmrPlugin,
    })),
    {
      name: 'memo(() => ...)',
      code: `${head}import { memo } from 'react'
export const Route = createFileRoute('/')({ component: memo(() => <p>hi</p>) })`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'forwardRef(function () { ... })',
      code: `${head}import { forwardRef } from 'react'
export const Route = createFileRoute('/')({
  component: forwardRef(function (props, ref) {
    return <p ref={ref}>hi</p>
  }),
})`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'method shorthand',
      code: `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'React.memo(forwardRef(...)) on a root route',
      code: `import React, { forwardRef } from 'react'
import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: React.memo(forwardRef(function Root(props, ref) {
    return <p ref={ref}>root</p>
  })),
})`,
      compile: (code: string) => compileWithCodeSplitting(code).reference!,
    },
  ])(
    'registers an inline component written as $name',
    async ({ code, compile }) => {
      await expectRefreshableRouteOption(compile(code), 'component')
    },
  )

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

  // Goal (split path of the method-shorthand row above): a method-shorthand
  // component is refreshable whether the code splitter splits it or keeps it
  // in the route module.
  // Bug: same root cause as the method-shorthand row above.
  // Source: ruling on #8721 "keeps a method-shorthand component option"
  // (react-refresh-route-components.test.ts, loosened).
  test.fails(
    'registers a method-shorthand component of a split route',
    async () => {
      const route = await loadRoute(
        `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
        { hmr: true, refresh: true },
      )
      await expectValidModules(route.modules)
      const component = await route.load('component')
      expect(component()).toBe('<p>hi</p>')
      expect(isRefreshable(component, route.registered)).toBe(true)
    },
  )

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
  test.fails(
    'a user binding named hot does not collide with the injected HMR code',
    async () => {
      const modules = compileWithCodeSplitting(`${head}export const hot = 'hot'
export const Route = createFileRoute('/')({
  component: () => <p>{hot}</p>,
})`)
      await expectValidModules(modules)
      expect(exportedNames(modules.reference!)).toContain('hot')
    },
  )

  /**
   * Loads, with HMR, a route whose `page` component (declared by
   * `declaration`) the loader also reads, so the code splitter shares it with
   * the loader. Loads the split component and renders it twice. `page` counts
   * its renders in a module-level `let` initialized by `init` from `./state`.
   * Returns both renders and how many times `init` ran.
   */
  async function renderSharedComponentTwice(declaration: string) {
    let inits = 0
    const route = await loadRoute(
      `${head}import { init } from './state'
let renders = init(0)
${declaration}
export const Route = createFileRoute('/')({
  loader: () => page.name,
  component: page,
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
    return [component(), component(), inits]
  }

  // Control for the lowercase shared component pin below (same harness).
  test('a lowercase arrow component shared with the loader renders with the module state it shares', async () => {
    expect(
      await renderSharedComponentTwice(`const page = () => {
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
    'a lowercase function component shared with the loader renders with the module state it shares',
    async () => {
      expect(
        await renderSharedComponentTwice(`function page() {
  renders++
  return <p>{renders}</p>
}`),
      ).toEqual(['<p>1</p>', '<p>2</p>', 1])
    },
  )

  // Bug: same root cause as the pin above, for a lowercase component that
  // the split `component` and the unsplit `pendingComponent` share.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  // Source: #8504 react-refresh-route-components ("that is also the unsplit
  // pendingComponent"), where it passes.
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
   * off), evaluates it and returns its route.
   */
  async function evaluateUnsplitRoute(code: string) {
    const { Route } = await evaluateModule(transformWithRouteHmrPlugin(code), {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
    })
    return Route as unknown as { options: Record<string, () => unknown> }
  }

  // Control for the hoisted inline component pin below (same harness).
  test('an inline component reading a lowercase component renders it', async () => {
    const Route =
      await evaluateUnsplitRoute(`${head}const missing = () => <p>missing</p>
export const Route = createFileRoute('/')({
  pendingComponent: () => missing(),
})`)
    expect(Route.options.pendingComponent!()).toBe('<p>missing</p>')
  })

  // Bug: React HMR hoists inline component options into declarations it
  // inserts after visiting every option, and renames a lowercase component
  // passed to a later option. The rename only reaches nodes attached to the
  // program, so a hoisted component still reads the old name.
  // Impact: in development, the hoisted component throws when it renders
  // (ReferenceError: missing is not defined).
  // Fix: rename before hoisting (or insert hoisted declarations immediately),
  // or rename through the analyzer's binding references.
  test.fails(
    'an inline component hoisted before a renamed lowercase component renders it',
    async () => {
      const Route =
        await evaluateUnsplitRoute(`${head}const missing = () => <p>missing</p>
export const Route = createFileRoute('/')({
  pendingComponent: () => missing(),
  notFoundComponent: missing,
})`)
      expect(Route.options.pendingComponent!()).toBe('<p>missing</p>')
      expect(Route.options.notFoundComponent!()).toBe('<p>missing</p>')
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

  // Bug: `handleRouteUpdate` keeps the previous component by assigning it to
  // the new route options, which throws when the option is a getter.
  // Impact: every hot update of a route with a getter component option fails
  // ("Cannot set property component of #<Object> which has only a getter").
  test.fails.each(['vite', 'webpack'] as const)(
    '%s: a route with a getter component option is hot-updated',
    async (style) => {
      expect(
        await updatesOption(
          `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  get component() {
    return Page
  },
})`,
          style,
        ),
      ).toBe(true)
    },
  )

  // Bug: `handleRouteUpdate` keeps the previous component options for React
  // Refresh to patch in place, also when no React Refresh runtime is installed
  // (webpack or Rspack without a refresh plugin, like the webpack quickstart
  // example with the default `addHmr`), so the new component never renders.
  // With automatic code splitting, the kept component is the old chunk's.
  // Impact: webpack reports the route (and its split chunk) as hot-updated,
  // but the page shows the old component until a reload; without the route
  // HMR code the same edit reloads the page.
  // The harness gives no React Refresh runtime and configures the plugins
  // with a webpack compiler without a refresh plugin, so a fix may detect
  // React Refresh at runtime or from the bundler configuration.
  test.fails.each([false, true])(
    'webpack: without React Refresh, a hot update renders the new component (autoCodeSplitting: %s)',
    async (codeSplitting) => {
      const route = (
        text: string,
      ) => `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>${text}</p>,
})`
      const update = await hotUpdate(route('old'), {
        style: 'webpack',
        codeSplitting,
        updated: route('new'),
      })
      expect(
        update.invalidated ||
          (await update.load('component'))() === '<p>new</p>',
      ).toBe(true)
    },
  )
})

describe('Vite HMR boundaries', () => {
  /**
   * Starts a dev server (router package stubbed) on an app whose client
   * entry imports the route tree, loads the entry and what it imports in the
   * client environment, as a page does, edits `routes/index.tsx` and returns
   * the HMR messages the client received.
   */
  async function editRoute(
    target: 'react' | 'solid' | 'vue',
    autoCodeSplitting: boolean,
    plugins: Array<PluginOption> = [],
  ) {
    const route = (
      text: string,
    ) => `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
function Page() {
  return '${text}'
}`
    const server = await routerDevServer({
      pluginOptions: { target, autoCodeSplitting },
      plugins: [routerPackageStub(target), ...plugins],
      files: {
        'routes/index.tsx': route('page'),
        'entry.ts': `export { routeTree } from './routeTree.gen'`,
      },
    })
    // The router package stub is a virtual module (`/@id/...`).
    await server.load('/entry.ts', { skip: /^\/@id\// })
    const messages = await server.edit({ 'routes/index.tsx': route('edited') })
    return describeHmr(
      messages.filter((message) => message.environment === 'client'),
    )
  }

  // Control for the pin below (same harness): with `@vitejs/plugin-react`,
  // React Refresh makes a React route module an HMR boundary.
  // Source: gap H6a.
  test.each([true, false])(
    'an edit of a React route module is a hot update with @vitejs/plugin-react (autoCodeSplitting: %s)',
    async (autoCodeSplitting) => {
      const messages = await editRoute('react', autoCodeSplitting, [react()])
      expect(
        messages.some((message) => message.startsWith('client: update')),
      ).toBe(true)
      expect(
        messages.filter((message) => message.startsWith('client: full-reload')),
      ).toEqual([])
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
  // declare components, and Vue JSX only for exported components.
  // Impact: every edit of a Solid route file with automatic code splitting,
  // and of any Vue route file, reloads the page in Vite dev.
  // Any boundary (the route module or an importer that accepts it) passes.
  test.fails.each([
    { target: 'solid', autoCodeSplitting: true },
    { target: 'solid', autoCodeSplitting: false },
    { target: 'vue', autoCodeSplitting: true },
    { target: 'vue', autoCodeSplitting: false },
  ] as const)(
    'an edit of a $target route module is a hot update (autoCodeSplitting: $autoCodeSplitting)',
    async ({ target, autoCodeSplitting }) => {
      const messages = await editRoute(target, autoCodeSplitting)
      expect(
        messages.some((message) => message.startsWith('client: update')),
      ).toBe(true)
      expect(
        messages.filter((message) => message.startsWith('client: full-reload')),
      ).toEqual([])
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

  // Control for the pin below: with `NODE_ENV=production` exported. The
  // Vite row replaces router-plugin-context.test.ts "does not install the
  // standalone route HMR plugin in production".
  test.each(['vite', 'rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, false)).toBe('nowhere')
    },
    60_000,
  )

  // Source: gap P1 / DV51. The esbuild row holds trivially today, since the
  // esbuild plugin neither generates nor splits routes (pinned in
  // build-harness.test.ts).
  test.each(['vite', 'rspack', 'webpack', 'esbuild'] as const)(
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
