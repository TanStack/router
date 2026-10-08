/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload.
 */
import { describe, expect, test } from 'vitest'
import {
  compileRouteModules,
  evaluateModule,
  expectRefreshableRouteOption,
  expectValidModules,
  exportedBinding,
  exportedNames,
  head,
  reactRefresh,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

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
  // `forwardRef(...)`, method shorthand) are neither hoisted nor registered,
  // nor is the function they wrap.
  // Impact: on unsplit routes (root routes, or file routes without automatic
  // code splitting), edits to these components are dropped until a reload.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  test.fails.each([
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
   * Compiles the component chunk of a route whose `component` option is
   * `name`, declared by `declaration`, and returns the binding the chunk
   * exports as `component` and the names React Refresh registers.
   */
  async function splitComponentRegistration(declaration: string, name: string) {
    const chunk = compileWithCodeSplitting(`${head}${declaration}
export const Route = createFileRoute('/')({ component: ${name} })`)[
      'virtual component'
    ]!
    await expectValidModules({ chunk })
    const binding = exportedBinding(chunk, 'component')
    expect(binding).toBeDefined()
    return {
      binding,
      registered: (await reactRefresh(chunk)).registered,
    }
  }

  // Control for the lowercase pin below (same harness).
  test('registers a PascalCase split component', async () => {
    const { binding, registered } = await splitComponentRegistration(
      `const Page = () => <p>hi</p>`,
      'Page',
    )
    expect(registered).toContain(binding)
  })

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
    const { reference } = compileWithCodeSplitting(code)
    const { Route } = await evaluateModule(reference!, {
      '@tanstack/react-router': {
        createRootRoute: (options: unknown) => ({ options }),
        createFileRoute: () => (options: unknown) => ({ options }),
        lazyRouteComponent: () => () => null,
        Outlet: () => null,
      },
    })
    return Route as unknown as { options: { component?: unknown } }
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
   * Compiles, with HMR, a route whose `page` component (declared by
   * `declaration`) the loader also reads, so the code splitter moves it to the
   * shared module. Evaluates the shared module, the route module and the
   * component chunk, then renders the split component twice. `page` counts
   * its renders in a module-level `let` initialized by `init` from `./state`.
   * Returns both renders and how many times `init` ran.
   */
  async function renderSharedComponentTwice(declaration: string) {
    const { modules } = compileRouteModules(
      `${head}import { init } from './state'
let renders = init(0)
${declaration}
export const Route = createFileRoute('/')({
  loader: () => page.name,
  component: page,
})`,
      { hmr: true },
    )
    let inits = 0
    const linked: Record<string, Record<string, unknown>> = {
      './state': {
        init: (value: number) => {
          inits++
          return value
        },
      },
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
        lazyRouteComponent: () => () => null,
      },
    }
    linked['route.tsx?tsr-shared=1'] = await evaluateModule(
      modules.shared!,
      linked,
    )
    linked['route.tsx'] = await evaluateModule(modules.reference!, linked)
    const { component } = await evaluateModule(
      modules['virtual component']!,
      linked,
    )
    return [component!(), component!(), inits]
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
})
