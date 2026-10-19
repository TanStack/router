/**
 * Known route HMR bugs of the modules the compiler emits for development.
 * Each test asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed.
 *
 * Pins of what the page shows after an edit (React Refresh keeping state,
 * lowercase, inline and exported components) run a real dev server and a
 * real browser page (`route-hmr-page.ts`):
 * integration/known-bugs-route-hmr.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  evaluateModule,
  expectValidModules,
  head,
  loadRoute,
  renderComponent,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

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
  // the split `component` and the unsplit `pendingComponent` share.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  // Source: #8504 react-refresh-route-components ("that is also the unsplit
  // pendingComponent"). That edits of both show in place: the page pin in
  // integration/known-bugs-route-hmr.test.ts.
  test.fails(
    'a lowercase function component that is also the unsplit pendingComponent renders as both',
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
  // way a module importing the export and the route render the same
  // component. That edits show in place: the page pin in
  // integration/known-bugs-route-hmr.test.ts.
  test.fails(
    'a component exported by an export list renders for a module importing it and as the route component',
    async () => {
      const route = await loadRoute(
        `${head}const page = () => <p>hi</p>
export { page }
export const Route = createFileRoute('/')({ component: page })`,
        { hmr: true, refresh: true },
      )
      await expectValidModules(route.modules)
      expect(await route.render('component')).toBe('<p>hi</p>')
      const { page } = await route.importFromRoute(
        `export { page } from '${routeSpecifier}'`,
      )
      expect(await renderComponent(page)).toBe('<p>hi</p>')
    },
  )

  /**
   * Compiles a route with the route HMR plugin (automatic code splitting
   * off), evaluates it and returns its route.
   */
  async function evaluateUnsplitRoute(code: string) {
    const { Route } = await evaluateModule(
      await transformWithRouteHmrPlugin(code),
      {
        '@tanstack/react-router': {
          createFileRoute: () => (options: unknown) => ({ options }),
        },
      },
    )
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

  // Control for the hoisted inline component pin (a real page:
  // integration/known-bugs-route-hmr.test.ts "an inline pending component
  // hoisted before a renamed lowercase component"): an option that is not
  // an inline component, reading a lowercase component a later option
  // passes, gets that component.
  test('an option reading a lowercase component a later option passes gets that component', async () => {
    const Route =
      await evaluateUnsplitRoute(`${head}const errorFallback = () => <p>error</p>
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
})
