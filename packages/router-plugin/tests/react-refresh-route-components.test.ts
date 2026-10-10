/**
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place. That only works when the value
 * is bound to a top-level name React Refresh registers. These tests compile
 * route files with the HMR transforms, then run Vite's Oxc React Refresh
 * transform (the one `@vitejs/plugin-react` uses) on the output to see which
 * components are registered and how their hook signatures are computed.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { tanstackRouter } from '../src/vite'
import {
  compileRouteModules,
  declarationOf,
  declaratorName,
  evaluateModule,
  expectRefreshableRouteOption,
  expectRegisteredRouteOption,
  expectValidModules,
  exportedBinding,
  exportedNames,
  getRouteOption,
  head,
  importedNames,
  parseModule,
  reactRefresh,
  topLevelDeclarators,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { ESTree, ViteDevServer } from 'vite'

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

  // Source: ReactFreshBabelPlugin-test "registers top-level variable
  // declarations with arrow functions"
  it.each([
    ['as any', `(() => <p>hi</p>) as any`],
    ['satisfies', `(() => <p>hi</p>) satisfies FC`],
    ['a non-null assertion', `(() => <p>hi</p>)!`],
  ])('written inline and wrapped in %s', async (_, component) => {
    const code = transformWithRouteHmrPlugin(
      `${head}import type { FC } from 'react'
export const Route = createFileRoute('/')({ component: ${component} })`,
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

  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  // and "uses original function declaration if it get reassigned"
  it.each([
    ['a const arrow function', `const page = () => <p>hi</p>`],
    [
      'a function expression that names itself',
      `const page = function page() { return <p>{typeof page}</p> }`,
    ],
    [
      'a reassigned function declaration',
      `import { connect } from './connect'\nfunction page() { return <p>hi</p> }\npage = connect(page)`,
    ],
  ])('declared lowercase as %s, by renaming it', async (_, declaration) => {
    const code = transformWithRouteHmrPlugin(
      `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`,
    )
    const binding = await expectRegisteredRouteOption(code, 'component')
    expect(binding).toMatch(/^[A-Z]/)
  })

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
    'renamed lowercase and exported (%s), keeping the exports',
    async (_, declaration) => {
      const source = `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`
      const code = transformWithRouteHmrPlugin(source)
      await expectRegisteredRouteOption(code, 'component')
      expect(exportedNames(code)).toEqual(
        expect.arrayContaining(exportedNames(source)),
      )
    },
  )

  // React Refresh resolves memo(...) through the function it wraps.
  it('wrapped in memo(...) around a top-level component', async () => {
    await expectRefreshableRouteOption(
      transformWithRouteHmrPlugin(`${head}import { memo } from 'react'
function Page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: memo(Page) })`),
      'component',
    )
  })

  // Source: ReactFreshBabelPlugin-test "does not consider require-like methods to be HOCs"
  it('but leaves an imported lowercase component to the module that declares it', () => {
    const code = transformWithRouteHmrPlugin(
      `${head}import { page } from './page'
export const Route = createFileRoute('/')({ component: page })`,
    )
    const { value } = getRouteOption(parseModule(code), 'component')
    expect((value as ESTree.IdentifierReference).name).toBe('page')
    expect(importedNames(code, './page')).toEqual(['page'])
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

    const modules = compileWithCodeSplitting(source)
    expect(modules.shared).toMatch(declarationOf('format'))
    const chunkSignatures = (await reactRefresh(modules['virtual component']!))
      .signatures
    expect([...chunkSignatures.values()]).toContain(expected)
  })
})

describe('React Refresh registers split route components', () => {
  /** The binding a chunk exports as `component`, and what React Refresh registers. */
  async function splitComponent(chunk: string) {
    const binding = exportedBinding(chunk, 'component')
    expect(binding).toBeDefined()
    return {
      binding: binding!,
      registered: (await reactRefresh(chunk)).registered,
    }
  }

  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  it.each([
    ['memo', `import { memo } from 'react'`, `memo(() => <p>hi</p>)`],
    [
      'forwardRef',
      `import { forwardRef } from 'react'`,
      `forwardRef(function (props, ref) {\n  return <p ref={ref}>hi</p>\n})`,
    ],
  ])(
    'written inline in a %s call, with the function it wraps',
    async (hoc, imports, component) => {
      const modules = compileWithCodeSplitting(`${head}${imports}
export const Route = createFileRoute('/')({ component: ${component} })`)
      await expectValidModules(modules)
      const { binding, registered } = await splitComponent(
        modules['virtual component']!,
      )
      expect(registered).toEqual(
        expect.arrayContaining([binding, `${binding}$${hoc}`]),
      )
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level function
  // declarations" (one component, two uses)
  it('that is also the unsplit pendingComponent', async () => {
    const modules = compileWithCodeSplitting(`${head}function page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: page, pendingComponent: page })`)
    await expectValidModules(modules)
    const { binding, registered } = await splitComponent(
      modules['virtual component']!,
    )
    expect(registered).toContain(binding)
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" (`export { Baz }`)
  it('but keeps a component exported by specifier in the route module, registered and exported', async () => {
    const modules =
      compileWithCodeSplitting(`${head}const page = () => <p>hi</p>
export { page }
export const Route = createFileRoute('/')({ component: page })`)
    await expectValidModules(modules)
    expect(exportedNames(modules.reference!)).toContain('page')
    await expectRegisteredRouteOption(modules.reference!, 'component')
  })

  // Inputs adapted from React Compiler simple-alias.js: a lowercase component
  // that the loader also uses moves to the shared module, and React HMR
  // renames lowercase split components.
  it('keeps the modules valid when a lowercase component is shared with the loader', async () => {
    const modules = compileWithCodeSplitting(`${head}function page() {
  return <div>hello</div>
}
function load() {
  return page.name
}
export const Route = createFileRoute('/')({ component: page, loader: load })`)
    expect(modules.shared).toMatch(declarationOf('page'))
    await expectValidModules(modules)
  })
})

describe('React Refresh hoisting picks names nothing else uses', () => {
  it.each([
    [
      'a top-level const',
      `const TSRComponent = 'taken'`,
      `<p>{TSRComponent}</p>`,
    ],
    ['an import', `import { TSRComponent } from './taken'`, `<TSRComponent />`],
    [
      'a function declared after the route',
      ``,
      `<p>{TSRComponent()}</p>`,
      `\nfunction TSRComponent() { return 'taken' }`,
    ],
  ])('not a name held by %s', async (_, before, jsx, after = '') => {
    const code = transformWithRouteHmrPlugin(
      `${head}${before}
export const Route = createFileRoute('/')({ component: () => ${jsx} })${after}`,
    )
    // A reused name would redeclare the user's binding (an invalid module).
    const binding = await expectRegisteredRouteOption(code, 'component')
    expect(binding).not.toBe('TSRComponent')
  })

  it('nor a global the component reads', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  component: () => <p>{typeof TSRPendingComponent}</p>,
  pendingComponent: () => <p>pending</p>,
})`,
    )
    const pending = await expectRegisteredRouteOption(code, 'pendingComponent')
    expect(pending).not.toBe('TSRPendingComponent')
    // `TSRPendingComponent` must stay an unresolved global inside `component`.
    expect(code).not.toMatch(declarationOf('TSRPendingComponent'))
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
    const program = parseModule(reference!)
    // `label` only exists inside `makeChild`; any other top-level statement
    // that mentions it reads an undefined global at render time.
    const statementsUsingLabel = program.body
      .map((statement) => reference!.slice(statement.start, statement.end))
      .filter(
        (statement) =>
          /\blabel\b/.test(statement) &&
          !statement.includes('function makeChild('),
      )
    expect(statementsUsingLabel).toEqual([])
    // React Refresh can only register components bound to top-level names.
    await expectRegisteredRouteOption(reference!, 'component')
  })

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
    // The split `component` loads from its chunk; the reference module keeps
    // `pendingComponent`.
    await expectRefreshableRouteOption(
      compileWithCodeSplitting(code).reference!,
      'pendingComponent',
    )
  })

  it('declares hoisted components before the route that uses them', () => {
    // The lowercase `page`, declared in the same statement as `Route`, is
    // renamed for React Refresh as well.
    const { reference } = compileWithCodeSplitting(`
import { createRootRoute } from '@tanstack/react-router'
export const page = () => <div />, Route = createRootRoute({
  component: page,
  pendingComponent: () => <div />,
})
`)
    const program = parseModule(reference!)
    const { route, value } = getRouteOption(program, 'pendingComponent')
    expect(value.type).toBe('Identifier')
    const name = (value as ESTree.IdentifierReference).name
    const declaration = topLevelDeclarators(program).find(
      (declarator) => declaratorName(declarator) === name,
    )
    // A `const` used before its declaration throws a TDZ ReferenceError when
    // the route is created.
    expect(declaration).toBeDefined()
    expect(declaration!.start).toBeLessThan(route.start)
  })
})

/**
 * React HMR renames and hoists route components, and may split them out of the
 * route module. Modules that import the route module's exports still need them,
 * as the same values the route options use. These tests load the route module
 * from a Vite dev server running the real plugin.
 */
describe.each([true, false])(
  'route module exports with React HMR and autoCodeSplitting=%s',
  (autoCodeSplitting) => {
    /**
     * Transforms and loads `routes/page.tsx` in a dev server, and passes its
     * exports to `use` while the server can still load split chunks.
     */
    async function withRouteModule(
      route: string,
      use: (routeModule: Record<string, any>) => Promise<void> | void,
    ) {
      const root = await mkdtemp(path.join(__dirname, '.hmr-exports-'))
      let server: ViteDevServer | undefined
      try {
        await mkdir(path.join(root, 'routes'))
        await writeFile(
          path.join(root, 'routes/__root.tsx'),
          `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
        )
        await writeFile(path.join(root, 'routes/page.tsx'), route)
        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          plugins: [
            tanstackRouter({
              target: 'react',
              autoCodeSplitting,
              codeSplittingOptions: {
                defaultBehavior: [['component'], ['loader']],
              },
              routesDirectory: './routes',
              generatedRouteTree: './routeTree.gen.ts',
            }),
          ],
          server: { middlewareMode: true },
          appType: 'custom',
        })
        const transformed = await server.transformRequest('/routes/page.tsx')
        // The route module went through the React HMR transforms
        expect(transformed?.code).toContain('TSRFastRefreshAnchor')
        await use(await server.ssrLoadModule('/routes/page.tsx'))
      } finally {
        await server?.close()
        await rm(root, { recursive: true, force: true })
      }
    }

    it.each([
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
        name: 'class',
        declaration: `import { Component } from 'react'
export class component extends Component { render() { return null } }`,
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
        name: 'aliased',
        declaration:
          'function component() { return null }; export { component as View }',
        options: 'component',
        exported: { View: ['component'] },
      },
      {
        name: 'default',
        declaration: 'export default function component() { return null }',
        options: 'component',
        exported: { default: ['component'] },
      },
    ])(
      'keep a $name component exported as the route option value',
      async ({ declaration, options, exported }) => {
        await withRouteModule(
          `${head}${declaration}
export const Route = createFileRoute('/page')({ ${options} })`,
          (routeModule) => {
            for (const [name, keys] of Object.entries(exported)) {
              expect(routeModule).toHaveProperty(name)
              for (const key of keys) {
                expect(routeModule[name], `${name} is the ${key} option`).toBe(
                  routeModule.Route.options[key],
                )
              }
            }
          },
        )
      },
      30_000,
    )

    it('keep exported overloads and their aliases that unsplit and split options call', async () => {
      await withRouteModule(
        `${head}export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }
export { helper as helperAlias }
export const Route = createFileRoute('/page')({
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`,
        async (routeModule) => {
          expect(routeModule.helperAlias).toBe(routeModule.helper)
          expect(routeModule.Route.options.beforeLoad()).toBe('before')
          expect(await routeModule.Route.options.loader()).toBe(42)
        },
      )
    }, 30_000)
  },
)
