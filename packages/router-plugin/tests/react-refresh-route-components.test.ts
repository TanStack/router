/**
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place. That only works when the value
 * is bound to a top-level name React Refresh registers. These tests compile
 * route files with the HMR transforms, then run Vite's Oxc React Refresh
 * transform (the one `@vitejs/plugin-react` uses) on the output to see which
 * components are registered and how their hook signatures are computed.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  expectExportedRouteOptions,
  expectSharedOverloads,
  exportedComponentsLostWhenSplit,
} from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  evaluateRouteModule,
  expectRefreshableRouteOption,
  expectRegisteredRouteOption,
  expectValidModules,
  exportedNames,
  getRouteOption,
  head,
  hotUpdate,
  isRefreshable,
  loadRoute,
  reactRefresh,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { ExportedRouteOptionsCase } from './dev-server'

/** Compiles every module the code splitter emits, with React HMR. */
function compileWithCodeSplitting(code: string) {
  return compileRouteModules(code, { hmr: true }).modules
}

describe('React Refresh registers route components', () => {
  // Source: React Refresh ReactFreshBabelPlugin-test "registers top-level
  // variable declarations with function expressions" and "... with arrow functions"
  it.each([
    ['an arrow function', `() => <p>hi</p>`],
    ['an anonymous function expression', `function () { return <p>hi</p> }`],
    ['a parenthesized arrow function', `(() => <p>hi</p>)`],
  ])('written inline as %s', async (_, component) => {
    const code = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({ component: ${component} })`,
    )
    await expectRegisteredRouteOption(code, 'component')
  })

  it('for every inline component option of a root route, under distinct names', async () => {
    const options = {
      component: '() => <p>component</p>',
      pendingComponent: '() => <p>pending</p>',
      errorComponent: '({ error }) => <p>{String(error)}</p>',
      notFoundComponent: '() => <p>not found</p>',
      shellComponent: '({ children }) => <html><body>{children}</body></html>',
    }
    const { reference } = compileWithCodeSplitting(
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
${Object.entries(options)
  .map(([key, value]) => `  ${key}: ${value},`)
  .join('\n')}
})`,
    )
    const bindings = new Set<string>()
    for (const option of Object.keys(options)) {
      bindings.add(await expectRegisteredRouteOption(reference!, option))
    }
    expect(bindings.size).toBe(Object.keys(options).length)
  })

  // Source: add-hmr snapshot fixture createRootRoute-lowercase-components.
  it('for every lowercase function component of a root route, under distinct names', async () => {
    const options = [
      'shellComponent',
      'pendingComponent',
      'errorComponent',
      'component',
    ]
    const { reference } = compileWithCodeSplitting(
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
${options.map((option) => `  ${option}: ${option},`).join('\n')}
})
${options
  .map(
    (option) =>
      `function ${option}({ children }) {\n  return <div>{children}${option}</div>\n}`,
  )
  .join('\n')}`,
    )
    const bindings = new Set<string>()
    for (const option of options) {
      bindings.add(await expectRegisteredRouteOption(reference!, option))
      const component = (await getRouteOption(reference!, option)) as (
        props: object,
      ) => string
      expect(component({})).toBe(`<div>${option}</div>`)
    }
    expect(bindings.size).toBe(options.length)
  })

  // Source: add-hmr snapshot fixture createRootRouteWithContext-type-args.
  it('of a root route created with context type arguments', async () => {
    const { reference } = compileWithCodeSplitting(
      `import { createRootRouteWithContext } from '@tanstack/react-router'
interface MyRouterContext {
  auth: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => <div>root</div>,
})`,
    )
    await expectRegisteredRouteOption(reference!, 'component')
  })

  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  // and "uses original function declaration if it get reassigned"
  it.each([
    ['a const arrow function', `const page = () => <p>hi</p>`, 'tsx'],
    [
      'a function expression that names itself',
      `const page = function page() { return <p>{typeof page}</p> }`,
      'tsx',
    ],
    // TypeScript rejects assigning to a function declaration (TS2630).
    [
      'a reassigned function declaration',
      `import { connect } from './connect'\nfunction page() { return <p>hi</p> }\npage = connect(page)`,
      'jsx',
    ],
    [
      'an overloaded function declaration',
      `import type * as React from 'react'\nfunction page(props: { title?: string }): React.JSX.Element\nfunction page(props: any) { return <p>{props.title}</p> }`,
      'tsx',
    ],
  ])(
    'declared lowercase as %s, by renaming it',
    async (_, declaration, extension) => {
      const code = transformWithRouteHmrPlugin(
        `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`,
        { target: 'react' },
        {
          file: routeFile('index').replace(/\.tsx$/, `.${extension}`),
          routeId: '/',
        },
      )
      await expectRegisteredRouteOption(code, 'component')
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" and "registers top-level exported named arrow functions"
  it.each([
    ['export function page', `export function page() { return <p>hi</p> }`],
    ['export { page }', `const page = () => <p>hi</p>\nexport { page }`],
    [
      'export default page',
      `function page() { return <p>hi</p> }\nexport default page`,
    ],
  ])(
    'renamed lowercase and exported (%s), keeping what importers get',
    async (_, declaration) => {
      const source = `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`
      const code = transformWithRouteHmrPlugin(source)
      await expectRegisteredRouteOption(code, 'component')
      // Modules importing the component get the one the route renders.
      const { exports, Route } = await evaluateRouteModule(code)
      const imported = exportedNames(source).filter((name) => name !== 'Route')
      expect(imported.length).toBeGreaterThan(0)
      for (const name of imported) {
        expect(exports[name], name).toBe(Route.options.component)
      }
    },
  )

  // Source: ReactFreshBabelPlugin-test "does not consider require-like methods to be HOCs"
  it('but leaves an imported lowercase component to the module that declares it', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}import { page } from './page'
export const Route = createFileRoute('/')({ component: page })`,
    )
    const page = () => null
    expect(
      await getRouteOption(code, 'component', { './page': { page } }),
    ).toBe(page)
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level function declarations"
  it('renames only the component binding, not an inner binding with its name', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}function page() {
  const page = 'inner-marker'
  return <p>{page}</p>
}
export const Route = createFileRoute('/')({ component: page })`,
    )
    await expectRegisteredRouteOption(code, 'component')
    const { Route } = await evaluateModule(code, {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
    })
    expect((Route as any).options.component()).toBe('<p>inner-marker</p>')
  })

  // Source: ReactFreshIntegration-test "preserves state ..." (families are
  // matched by registration name)
  it('names hoisted components after their option, so adding options keeps the family', async () => {
    const before = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({ component: () => <p>v1</p> })`,
    )
    const after = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  pendingComponent: () => <p>pending</p>,
  errorComponent: () => <p>error</p>,
  component: () => <p>v2</p>,
})`,
    )
    expect(await expectRegisteredRouteOption(after, 'component')).toBe(
      await expectRegisteredRouteOption(before, 'component'),
    )
  })

  // Source: ReactFreshBabelPlugin-test "includes custom hooks into the signatures"
  it('with the hook signature of the component the user wrote, also in the split chunk', async () => {
    const declarations = `import { useState } from 'react'
const format = (n: number) => String(n)
function useCounter() {
  const [count] = useState(0)
  return format(count)
}`
    const component = `() => {
  const count = useCounter()
  return <p>{count}</p>
}`
    const { signatures } = await reactRefresh(
      `${declarations}\nconst Page = ${component}\nexport const Route = {}`,
    )
    const expected = signatures.get('Page')
    expect(expected).toBeDefined()
    // The loader shares `format` with the component's hook.
    const source = `${head}${declarations}
export const Route = createFileRoute('/')({
  loader: () => format(1),
  component: ${component},
})`

    const hmr = transformWithRouteHmrPlugin(source)
    const hoisted = await expectRegisteredRouteOption(hmr, 'component')
    expect((await reactRefresh(hmr)).signatures.get(hoisted)).toBe(expected)

    const route = await loadRoute(source, { hmr: true })
    const chunkSignatures = (await reactRefresh(route.chunkOf('component')))
      .signatures
    expect([...chunkSignatures.values()]).toContain(expected)
  })
})

describe('React Refresh registers split route components', () => {
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline
  // functions"; #8504 react-refresh-route-components ("written inline in a
  // memo / forwardRef call"). The bodies have no JSX: with JSX, the code
  // splitter cannot split the call (pinned in known-bugs-code-splitter.test.ts
  // "a component written as memo of an inline arrow is split and renders").
  it.each([
    ['memo', `import { memo } from 'react'`, `memo(() => 'hi')`],
    [
      'forwardRef',
      `import { forwardRef } from 'react'`,
      `forwardRef(function (props, ref) {\n  return 'hi'\n})`,
    ],
  ])('written inline in a %s call', async (_, imports, component) => {
    const route = await loadRoute(
      `${head}${imports}
export const Route = createFileRoute('/')({ component: ${component} })`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect(isRefreshable(await route.load('component'), route.registered)).toBe(
      true,
    )
  })
})

// The route HMR code declares bindings of its own (`hotData`,
// `handleRouteUpdate`, ...); a route file's bindings with the same names keep
// their values, and the route still hot-updates. (A user binding named `hot`
// collides: pinned in known-bugs-route-hmr.test.ts.)
describe('route HMR code next to user bindings with common names', () => {
  /** A route file with its own `hotData` and `handleRouteUpdate`. */
  const route = (version: string) => `${head}const hotData = 'data ${version}'
function handleRouteUpdate() {
  return 'update ${version}'
}
function Page() {
  return <p>{hotData} {handleRouteUpdate()}</p>
}
export const Route = createFileRoute('/')({
  loader: () => hotData,
  component: Page,
})`

  describe.each([
    { compiler: 'automatic code splitting', codeSplitting: true },
    { compiler: 'the route HMR plugin', codeSplitting: false },
  ])('with $compiler', ({ codeSplitting }) => {
    it.each(['vite', 'webpack'] as const)(
      '%s: keeps the values of hotData and handleRouteUpdate',
      async (style) => {
        const update = await hotUpdate(route('old'), {
          style,
          codeSplitting,
          updated: route('new'),
        })
        expect(update.invalidated).toBe(false)
        expect(await (await update.load('loader'))()).toBe('data new')
        expect(await update.render('component')).toBe(
          '<p>data new update new</p>',
        )
      },
    )
  })
})

describe('React Refresh hoisting of inline route components', () => {
  it('hoists the root route component but not the components of routes a function creates', async () => {
    const { reference } = compileWithCodeSplitting(`
import { createRootRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}
export const Route = createRootRoute({ component: () => <div /> })
`)
    // `label` only exists inside `makeChild`: its routes' components must
    // stay in the function to read it.
    const { exports } = await evaluateRouteModule(reference!)
    const child = (exports.makeChild as (label: string) => any)('x')
    expect(child.options.component()).toBe('<div>x</div>')
    // React Refresh can only register components bound to top-level names.
    await expectRegisteredRouteOption(reference!, 'component')
  })

  // Source: #8504 react-refresh-route-components "hoists the components of
  // the module's Route when another route is created first".
  it("hoists the components of the module's Route when another route is created first", async () => {
    const code = `import { createFileRoute, createRoute } from '@tanstack/react-router'
export const extra = createRoute({
  getParentRoute: () => Route,
  path: 'extra',
  component: () => <p>extra</p>,
})
export const Route = createFileRoute('/')({
  component: () => <p>home</p>,
  pendingComponent: () => <p>pending</p>,
})`
    await expectRefreshableRouteOption(
      transformWithRouteHmrPlugin(code),
      'component',
    )
    // The split `component` loads from its chunk; the route module keeps
    // `pendingComponent`.
    await expectRefreshableRouteOption(
      compileWithCodeSplitting(code).reference!,
      'pendingComponent',
    )
  })
})

/**
 * `@vitejs/plugin-react` ends every module it compiles with React Refresh
 * with a hot accept callback that runs its refresh runtime's
 * `validateRefreshBoundaryAndEnqueueUpdate(id, previousExports, nextExports)`
 * and invalidates the module (a full page reload) when it returns a message.
 * A route module's `Route` export is a new object on every update, so the
 * route module must have the runtime ignore it
 * (`window.__getReactRefreshIgnoredExports`) and export at least one
 * component.
 */
describe('a React route module compiled for Vite stays a Fast Refresh boundary', () => {
  const refreshRuntimeUrl = pathToFileURL(
    path.join(
      path.dirname(
        createRequire(import.meta.url).resolve('@vitejs/plugin-react'),
      ),
      'refresh-runtime.js',
    ),
  ).href

  /**
   * Loads the compiled route module twice with one Vite hot context, as a
   * hot update does, and returns what plugin-react's refresh runtime decides
   * for the update (`undefined`: refreshed in place), the exports the
   * runtime does not ignore and whether React Refresh registered each.
   */
  async function refreshUpdate(code: string, id: string) {
    const window: {
      __getReactRefreshIgnoredExports?: (ctx: { id: string }) => Array<string>
    } = {}
    vi.stubGlobal('window', window)
    try {
      const runtime = await import(/* @vite-ignore */ refreshRuntimeUrl)
      const hot = {
        data: {},
        accept() {},
        dispose() {},
        invalidate() {},
        on() {},
      }
      const previous = await evaluateRouteModule(
        code,
        {},
        { importMeta: { hot } },
      )
      const next = await evaluateRouteModule(code, {}, { importMeta: { hot } })
      const invalidation: unknown =
        runtime.validateRefreshBoundaryAndEnqueueUpdate(
          id,
          previous.exports,
          next.exports,
        )
      const ignored = window.__getReactRefreshIgnoredExports?.({ id }) ?? []
      const components = Object.fromEntries(
        Object.keys(next.exports)
          .filter((name) => !ignored.includes(name))
          .map((name) => [name, next.registered.has(next.exports[name])]),
      )
      return { invalidation, components }
    } finally {
      vi.unstubAllGlobals()
    }
  }

  const routes = [
    {
      name: 'a route',
      route: `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })`,
    },
    {
      name: 'a route with an undefined component',
      route: `${head}export const Route = createFileRoute('/')({ component: undefined })`,
    },
    {
      name: 'a root route',
      route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <div>root</div> })`,
    },
  ]

  describe.each([
    {
      compiler: 'automatic code splitting',
      compile: (route: string) => {
        const { modules, ids } = compileRouteModules(route, { hmr: true })
        return { code: modules.reference!, id: ids.reference! }
      },
    },
    {
      compiler: 'the route HMR plugin',
      compile: (route: string) => ({
        code: transformWithRouteHmrPlugin(route),
        id: routeFile('index'),
      }),
    },
  ])('with $compiler', ({ compile }) => {
    it.each(routes)('$name', async ({ route }) => {
      const { code, id } = compile(route)
      const { invalidation, components } = await refreshUpdate(code, id)
      expect(invalidation).toBeUndefined()
      // Every export the runtime does not ignore is a registered component.
      expect(Object.keys(components).length).toBeGreaterThan(0)
      for (const [name, registered] of Object.entries(components)) {
        expect(registered, name).toBe(true)
      }
    })
  })
})

describe('route HMR leaves options React Refresh does not handle as they are', () => {
  // Loosened: the method keeps working. Being refreshable is the goal pinned
  // by the "method shorthand" rows of known-bugs-route-hmr.test.ts.
  it('keeps a method-shorthand component option working', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
    )
    expect(await getModuleErrors(code)).toEqual([])
    const component = (await getRouteOption(code, 'component')) as () => string
    expect(component()).toBe('<p>hi</p>')
  })
})

/**
 * React HMR renames and hoists route components, and may split them out of
 * the route module. Modules that import the route module's exports still need
 * them, as the same values the route options use. These tests load the route
 * module from a Vite dev server running the real plugin.
 *
 * Source: #8504 react-refresh-route-components "route module exports with
 * React HMR and autoCodeSplitting". The class, aliased and overload-alias
 * cases fail with automatic code splitting; they are pinned in
 * known-bugs-dev-server.test.ts.
 */
describe.each([true, false])(
  'route module exports with React HMR and autoCodeSplitting=%s',
  (autoCodeSplitting) => {
    const cases: Array<ExportedRouteOptionsCase> = [
      {
        name: 'function',
        declaration: 'export function component() { return null }',
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'overloaded function',
        declaration:
          'export function component(): null; export function component() { return null }',
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'function used by two options',
        declaration: 'export function component() { return null }',
        options: 'component, errorComponent: component',
        exported: { component: ['component', 'errorComponent'] },
      },
      {
        name: 'variable',
        declaration: 'export const component = () => null',
        options: 'component',
        exported: { component: ['component'] },
      },
      {
        name: 'variables declared together',
        declaration:
          'export const component = () => null, pendingComponent = () => null',
        options: 'component, pendingComponent',
        exported: {
          component: ['component'],
          pendingComponent: ['pendingComponent'],
        },
      },
      {
        name: 'default',
        declaration: 'export default function component() { return null }',
        options: 'component',
        exported: { default: ['component'] },
      },
      ...(autoCodeSplitting ? [] : exportedComponentsLostWhenSplit),
    ]

    it.each(cases)(
      'keep a $name component exported as the route option value',
      async ({ declaration, options, exported }) => {
        await expectExportedRouteOptions(
          `${head}${declaration}
export const Route = createFileRoute('/page')({ ${options} })`,
          exported,
          autoCodeSplitting,
        )
      },
      30_000,
    )

    if (!autoCodeSplitting) {
      it('keep exported overloads and their aliases that unsplit and split options call', async () => {
        await expectSharedOverloads(autoCodeSplitting)
      }, 30_000)
    }
  },
)
