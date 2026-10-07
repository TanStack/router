/**
 * Known route HMR and React Refresh bugs on main. Each `.fails` test asserts
 * the correct behaviour for a bug on main and is marked `.fails`; remove
 * `.fails` when the bug is fixed.
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload.
 */
import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
import {
  compileRouteModules,
  evaluateModule,
  expectRegisteredRouteOption,
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
  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand) are neither hoisted nor registered.
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
      await expectRegisteredRouteOption(compile(code), 'component')
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
      const { reference } = compileWithCodeSplitting(code)
      const { Route } = await evaluateModule(reference!, {
        '@tanstack/react-router': {
          createRootRoute: (options: unknown) => ({ options }),
          createFileRoute: () => (options: unknown) => ({ options }),
          lazyRouteComponent: () => () => null,
          Outlet: () => null,
        },
      })
      expect(typeof (Route as any).options.component).toBe('function')
    },
  )

  // Bug: the React Refresh plugin injects a top-level `const hot =
  // import.meta.hot` that collides with a user's top-level `hot` binding
  // (compile error `Duplicate declaration "hot"`).
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
})

describe('router-core CommonJS build', () => {
  const require = createRequire(import.meta.url)

  // Control for the CommonJS pin below: the ESM build defines the method.
  test('RouterCore defines _replaceRouteChunk in the ESM build', async () => {
    const { RouterCore } = await import('@tanstack/router-core')
    expect(typeof (RouterCore.prototype as any)._replaceRouteChunk).toBe(
      'function',
    )
  })

  // Bug: in router-core's CommonJS build, `router.cjs` reads
  // `replaceRouteChunk` from `load-client.cjs` while a circular require
  // leaves it uninitialized, so `RouterCore.prototype._replaceRouteChunk` is
  // undefined.
  // Impact: for CommonJS consumers, the generated route HMR handler throws
  // `router._replaceRouteChunk is not a function` on every route update.
  test.fails(
    'RouterCore defines _replaceRouteChunk in the CommonJS build',
    () => {
      const { RouterCore } = require('@tanstack/router-core')
      expect(typeof RouterCore.prototype._replaceRouteChunk).toBe('function')
    },
  )
})
