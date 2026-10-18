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
import {
  evaluateModule,
  expectValidModules,
  head,
  hotUpdate,
  loadRoute,
  renderComponent,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

import { editRouteFile } from './vite-hot-update'
import type { PluginOption } from 'vite'

/**
 * Whether a component React Refresh registered renders what the route's
 * `option` renders (the component a split option loads is not reachable
 * through the router's public API).
 */
async function rendersRegistered(
  route: Awaited<ReturnType<typeof loadRoute>>,
  option: string,
) {
  const rendered = await route.render(option)
  for (const type of route.registered.keys()) {
    const html = await renderComponent(type).catch(() => undefined)
    if (html === rendered) {
      return true
    }
  }
  return false
}

describe('React Refresh registration', () => {
  // Inline components that are not plain functions (`memo(...)`, ...):
  // pinned in a real page below ("route HMR in a real page").

  /**
   * Loads, with React HMR and React Refresh, a route whose `component` option
   * is `name`, declared by `declaration`, and returns whether a component
   * React Refresh registers renders what the route's component renders.
   */
  async function splitComponentRegistration(declaration: string, name: string) {
    const route = await loadRoute(
      `${head}${declaration}
export const Route = createFileRoute('/')({ component: ${name} })`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    return rendersRegistered(route, 'component')
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
    expect(await route.groups()).toEqual([['component'], ['errorComponent']])
    for (const [option, text] of [
      ['component', 'Hello'],
      ['errorComponent', 'Error'],
      ['pendingComponent', 'Pending'],
    ]) {
      expect(await route.render(option!)).toBe(`<div>${text}</div>`)
      expect(await rendersRegistered(route, option!), option).toBe(true)
    }
  })

  // Control for the lowercase pin below (same harness).
  test('registers a PascalCase split component', async () => {
    expect(
      await splitComponentRegistration(`const Page = () => <p>hi</p>`, 'Page'),
    ).toBe(true)
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
      expect(await route.isLazy(option)).toBe(true)
      expect(await rendersRegistered(route, option)).toBe(true)
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
      expect(await splitComponentRegistration(declaration, 'page')).toBe(true)
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
      expect(await route.render('component')).toBe('<p>hot</p>')
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
    return [
      await route.render('component'),
      await route.render('notFoundComponent'),
      inits,
    ]
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
      expect([
        await route.render('component'),
        await route.render('pendingComponent'),
      ]).toEqual(['<p>hi</p>', '<p>hi</p>'])
      expect(await rendersRegistered(route, 'component')).toBe(true)
      // Not split: the option is the component React renders
      expect(route.registered.has(route.options.pendingComponent)).toBe(true)
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
      expect(await route.render('component')).toBe('<p>hi</p>')
      expect(await renderComponent(route.exports.page)).toBe('<p>hi</p>')
      expect(route.registered.has(route.exports.page)).toBe(true)
      expect(await rendersRegistered(route, 'component')).toBe(true)
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
    expect(await route.isLazy('loader')).toBe(true)
    expect(await route.options.loader()).toBe('data')
    expect(await route.render('component')).toBe('<p>data</p>')
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
    expect(await renderComponent(Route.options.errorComponent)).toBe(
      '<p>error</p>',
    )
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
    expect(await renderComponent(Route.options.pendingComponent)).toBe(
      '<p>error</p>',
    )
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
      expect(await renderComponent(Route.options.pendingComponent)).toBe(
        '<p>error</p>',
      )
      expect(await renderComponent(Route.options.errorComponent)).toBe(
        '<p>error</p>',
      )
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
