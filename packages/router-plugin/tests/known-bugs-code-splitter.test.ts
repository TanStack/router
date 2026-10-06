/**
 * Known code-splitter bugs, pinned as expected failures.
 *
 * Every `.fails` test asserts the CORRECT behaviour and is marked `.fails`
 * because the compiler does not implement it yet. When a fix lands, the test
 * starts passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 *
 * Several bugs were found by porting other compilers' test suites (all MIT):
 * - Next.js SSG transform fixtures (vercel/next.js
 *   `crates/next-custom-transforms/tests/fixture/ssg`);
 * - React Router route-chunk and export-removal tests (remix-run/react-router
 *   `packages/react-router-dev/vite/route-chunks-test.ts` and
 *   `remove-exports-test.ts`);
 * - the Qwik optimizer tests (QwikDev/qwik
 *   `packages/optimizer/core/src/test.rs`);
 * - the React Compiler fixture corpus (facebook/react
 *   `compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler`);
 * - Turbopack's tree-shaker analyzer fixtures (vercel/next.js
 *   `turbopack/crates/turbopack-ecmascript/tests/tree-shaker/analyzer`).
 * Each ported test names its source.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { tanstackRouter } from '../src/vite'
import { declarationOf, getModuleErrors } from './validate-module'
import type { CodeSplitGroupings } from '../src/core/constants'

const runNode = promisify(execFile)

/** Renders a route component (loading its split chunk first) to HTML. */
const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

/** Counts module-state initializations in `globalThis.initCalls`. */
const stateModule = `function count() {
  ;(globalThis as any).initCalls = ((globalThis as any).initCalls ?? 0) + 1
}
export function init<T>(value: T): T {
  count()
  return value
}
export function register(items: Array<string>) {
  count()
  items.push('item')
}
`

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 *
 * The app has a root route, `routes/index.tsx` from `files`, `state.ts`
 * ({@link stateModule}) and, unless `files` replaces it, an `entry.ts` that
 * re-exports the index route and renders components ({@link renderEntry}).
 */
async function buildAndRun(options: {
  files: Record<string, string>
  groupings?: CodeSplitGroupings
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.known-bugs-runtime-'))
  try {
    await mkdir(path.join(root, 'routes'))
    const files: Record<string, string> = {
      'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      'entry.ts': renderEntry,
      'state.ts': stateModule,
      ...options.files,
    }
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: {
            addHmr: false,
            defaultBehavior: options.groupings ?? defaultCodeSplitGroupings,
          },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })
    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${options.script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const renderComponent = `await entry.render(entry.Route.options.component)`

describe('known code-splitter bugs: module state shared with split chunks', () => {
  // Control for the bugs below: a binding read by the loader (reference
  // module) and the split component moves to the shared module, so its
  // initializer runs once.
  test('a binding read by the loader and a split component is initialized once', async () => {
    const result = await buildAndRun({
      files: {
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { init } from '../state'
const value = init('value')
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
})`,
      },
      script: `return [await entry.Route.options.loader({}), ${renderComponent}, globalThis.initCalls]`,
    })
    expect(result).toEqual(['value', '<p>value</p>', 1])
  }, 30_000)

  // Bug: a binding read by the reference module and a split chunk moves to the
  // shared module even though it is reassigned outside it, and the module that
  // reassigns it now imports it. Imports are read-only, so the build fails with
  // "Cannot assign to import" (or, when the modules are linked without a
  // bundler, the reassignment throws "Assignment to constant variable").
  // Impact: the route cannot be built as soon as code splitting is on.
  // Remove `.fails` once fixed.
  // Sources: "a function reassigned at module level" is adapted from the React
  // Compiler fixture `module-scoped-bindings.js`.
  test.fails.each([
    {
      name: 'a let incremented by the loader',
      route: `let count = 0
export const Route = createFileRoute('/')({
  loader: () => { count++; return count },
  component: () => <p>{count}</p>,
})`,
      script: `const loaded = [await entry.Route.options.loader({}), await entry.Route.options.loader({})]
return [...loaded, ${renderComponent}]`,
      expected: [1, 2, '<p>2</p>'],
    },
    {
      name: 'a function reassigned at module level',
      route: `function format() {
  return 'original'
}
format = () => 'reassigned'
export const Route = createFileRoute('/')({
  loader: () => format(),
  component: () => <p>{format()}</p>,
})`,
      script: `return [await entry.Route.options.loader({}), ${renderComponent}]`,
      expected: ['reassigned', '<p>reassigned</p>'],
    },
  ])(
    'a shared binding reassigned outside the shared module ($name) stays writable',
    async ({ route, script, expected }) => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${route}`,
        },
        script,
      })
      expect(result).toEqual(expected)
    },
    30_000,
  )

  // Bug: a top-level binding that reads a `var` declared inside a block (`if`,
  // `try`, a `for` head) is moved to the shared module when the loader and a
  // split component both use it, but the nested `var` is not, so the shared
  // module reads an undeclared name. Impact: calling it throws a ReferenceError
  // as soon as the route loads. Remove `.fails` once fixed.
  test.fails.each([
    { name: 'an if block', declaration: 'if (globalThis) { var flag = 1 }' },
    { name: 'a try block', declaration: 'try { var flag = 1 } catch {}' },
    {
      name: 'a for head',
      declaration: 'for (var flag = 0; flag < 1; flag++) {}',
    },
  ])(
    'a shared helper keeps reading a var declared in $name',
    async ({ declaration }) => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${declaration}
const read = () => flag
export const Route = createFileRoute('/')({
  loader: () => read(),
  component: () => <p>{read()}</p>,
})`,
        },
        script: `return [await entry.Route.options.loader({}), ${renderComponent}]`,
      })
      expect(result).toEqual([1, '<p>1</p>'])
    },
    30_000,
  )

  // Bug: the shared module is computed from the route options only. A
  // declaration that the reference module keeps for another reason (an
  // export, an exported function reading it, a sibling binding that nothing
  // references, a top-level statement reading it) and that a split component
  // also reads is copied into the component chunk instead of being shared.
  // Impact: its initializer runs twice, so module state (contexts, stores,
  // subscriptions, registrations) is duplicated and the component reads a
  // different instance than the reference module (e.g. a context created in
  // the route file ignores its exported Provider). Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a destructuring with one exported binding',
      // The original pin for this bug.
      route: `import { init } from '../state'
const { a, b } = init({ a: 'a', b: 'b' })
export { a }`,
      render: '{a + b}',
      html: '<p>ab</p>',
    },
    {
      name: 'a binding read by an exported function',
      // Qwik: should_keep_module_level_var_used_in_both_main_and_qrl
      route: `import { init } from '../state'
const theme = init('dark')
export function ThemeProvider() {
  return theme
}`,
      render: '{theme}',
      html: '<p>dark</p>',
    },
    {
      name: 'an array destructuring with an unreferenced binding',
      // Next.js: ssg/getStaticProps/destructuring-assignment-array
      route: `import { init } from '../state'
const [unused, value] = init(['unused', 'value'])`,
      render: '{value}',
      html: '<p>value</p>',
    },
    {
      name: 'an object rest destructuring with an unreferenced binding',
      // Next.js: ssg/getStaticProps/destructuring-assignment-object
      route: `import { init } from '../state'
const { unused, ...rest } = init({ unused: 'unused', value: 'value' })`,
      render: '{Object.keys(rest).join()}',
      html: '<p>value</p>',
    },
    {
      name: 'a binding filled by a top-level registration call',
      // React Router: route-chunks-test.ts "top level await" and "object
      // property mutation"
      route: `import { register } from '../state'
const items: Array<string> = []
register(items)`,
      render: '{items.join()}',
      html: '<p>item</p>',
    },
    {
      name: 'an instance whose method is reassigned at top level',
      // React Router: route-chunks-test.ts "class method mutation"
      route: `import { init } from '../state'
class Greeter {
  constructor() {
    init(this)
  }
  greet() {
    return 'hello'
  }
}
const greeter: any = new Greeter()
greeter.greet = () => 'mutated'`,
      render: '{greeter.greet()}',
      html: '<p>mutated</p>',
    },
  ])(
    'module state that the reference module keeps for $name is initialized once',
    async ({ route, render, html }) => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${route}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`,
        },
        script: `return [${renderComponent}, globalThis.initCalls]`,
      })
      expect(result).toEqual([html, 1])
    },
    30_000,
  )

  // Bug: top-level side effects that nothing references (an `if` block, or a
  // declaration such as `const unsubscribe = store.subscribe(...)` whose
  // binding is unused) are copied into every split chunk, so they run once
  // more for each chunk that loads, even for a chunk that only holds the
  // errorComponent. Impact: duplicated subscriptions/logging/initialization.
  // Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'an if statement',
      effect: `if (typeof globalThis === 'object') {
  ;(globalThis as any).effects = ((globalThis as any).effects ?? 0) + 1
}`,
    },
    {
      name: 'an unused subscription',
      effect: `const subscribe = (listener: () => void) => {
  ;(globalThis as any).effects = ((globalThis as any).effects ?? 0) + 1
  return listener
}
const unsubscribe = subscribe(() => {})`,
    },
  ])(
    'an unreferenced top-level side effect ($name) runs once when split chunks load',
    async ({ effect }) => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
})`,
        },
        script: `await entry.Route.options.component.preload?.()
await entry.Route.options.errorComponent.preload?.()
return globalThis.effects`,
      })
      expect(result).toBe(1)
    },
    30_000,
  )

  // Bug: when a declaration moves into the shared module (the loader and the
  // split component both read it), top-level statements that write the
  // bindings it reads stay in the reference module. The shared module is
  // imported, so it evaluates first: the declaration's initializer runs before
  // statements that preceded it in the source. Impact: initialization order
  // changes, e.g. a store created from a registry no longer sees the plugins
  // registered above it. Remove `.fails` once fixed.
  // Turbopack: analyzer/write-order, analyzer/shared-2 and
  // analyzer/shared-regression.
  test.fails(
    'a shared declaration still runs after the top-level writes that precede it',
    async () => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
const plugins: Array<string> = []
plugins.push('auth')
const store = { plugins: [...plugins] }
plugins.push('late')
export const Route = createFileRoute('/')({
  loader: () => store.plugins,
  component: () => <p>{store.plugins.join()}</p>,
})`,
        },
        script: `const loaded = await entry.Route.options.loader({})
return [loaded, ${renderComponent}]`,
      })
      expect(result).toEqual([['auth'], '<p>auth</p>'])
    },
    30_000,
  )
})

describe('known code-splitter bugs: split route options', () => {
  // Bug: with several `createFileRoute(...)` calls in one route file, main
  // points every route at one split chunk (the first route renders the last
  // route's component); the Yuku PR emits a chunk with a duplicated
  // `component` export. Impact: wrong component rendered / broken build.
  // Remove `.fails` once fixed.
  test.fails(
    'several createFileRoute calls in one file keep their own split components',
    async () => {
      const result = await buildAndRun({
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
function Home() { return <p>home</p> }
function Other() { return <p>other</p> }
export const Route = createFileRoute('/')({ component: Home })
export const OtherRoute = createFileRoute('/')({ component: Other })`,
        },
        script: `return [
  ${renderComponent},
  await entry.render(entry.OtherRoute.options.component),
]`,
      })
      expect(result).toEqual(['<p>home</p>', '<p>other</p>'])
    },
    30_000,
  )

  // Bug: the object form `loader: { handler }` cannot be split. Main throws
  // "Unexpected splitNode type ☝️: ObjectExpression"; the Yuku PR moves the
  // object into a chunk and wraps it with `lazyFn`, which then calls the
  // object as a function. Impact: the route's data never loads.
  // Remove `.fails` once fixed.
  test.fails(
    'a split loader in object form still loads route data',
    async () => {
      const result = await buildAndRun({
        groupings: [['loader'], ['component']],
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: { handler: () => 'loaded' },
  component: () => <p>index</p>,
})`,
          'entry.ts': `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`,
        },
        script: `return await entry.load()`,
      })
      expect(result).toEqual([null, 'loaded'])
    },
    30_000,
  )

  // Bug: statements that assign properties to a split component
  // (`Page.displayName = ...`) stay in the reference module. Main keeps the
  // statements but removes the component's declaration, so the reference
  // module throws `ReferenceError: Page is not defined`; the Yuku PR keeps a
  // second copy of the component in the reference module. Impact: the route
  // crashes (main) or the component is not split out of the main bundle (PR).
  // Remove `.fails` once fixed.
  // React Router: remove-exports-test.ts "function statement with property
  // assignment" and "arrow function with property assignment".
  test.fails(
    'property assignments move into the chunk with the split component',
    async () => {
      const code = `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return <div>{Page.label}</div>
}
Page.label = 'page'
Page.displayName = 'PageDisplay'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`
      const reference = compileCodeSplitReferenceRoute({
        code,
        filename: 'route.tsx',
        id: 'route.tsx',
        addHmr: false,
        codeSplitGroupings: defaultCodeSplitGroupings,
        targetFramework: 'react',
      })!.code
      const component = compileCodeSplitVirtualRoute({
        code,
        filename: 'route.tsx?tsr-split=component',
        splitTargets: ['component'],
      }).code
      expect(reference).not.toMatch(/\bPage\b/)
      expect(component).toMatch(declarationOf('Page'))
      expect(component).toMatch(/Page\.displayName = ['"]PageDisplay['"]/)
      expect(await getModuleErrors(reference)).toEqual([])
      expect(await getModuleErrors(component)).toEqual([])
    },
  )
})
