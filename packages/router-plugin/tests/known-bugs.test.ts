/**
 * Known code-splitter and route-HMR bugs, pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build, parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { compileCodeSplitReferenceRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import { tanstackRouter } from '../src/vite'
import { getModuleErrors } from './validate-module'
import type { ESTree } from 'vite'
import type { CodeSplitGroupings } from '../src/core/constants'

const runNode = promisify(execFile)

/**
 * Builds a small app with the real Vite plugin (code splitting enabled), then
 * imports the built `entry.ts` in a separate Node process and returns the JSON
 * value printed by `script`, which has the entry's exports in scope as `entry`.
 */
async function buildAndRun(options: {
  files: Record<string, string>
  groupings: CodeSplitGroupings
  script: string
}) {
  // Keep the temporary app inside the package so real runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.known-bugs-runtime-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
    )
    for (const [file, code] of Object.entries(options.files)) {
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
            defaultBehavior: options.groupings,
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

const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export * from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

function compileWithReactRefresh(code: string) {
  return compileCodeSplitReferenceRoute({
    code,
    filename: 'route.tsx',
    id: 'route.tsx',
    addHmr: true,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    compilerPlugins: getFrameworkHmrCompilerPlugins({
      targetFramework: 'react',
    }),
  })
}

/** Names declared by a top-level statement (variables, functions, classes). */
function declaredNames(statement: ESTree.Statement | ESTree.Directive) {
  const declaration =
    statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : statement
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((declarator) =>
      declarator.id.type === 'Identifier' ? [declarator.id.name] : [],
    )
  }
  if (
    (declaration?.type === 'FunctionDeclaration' ||
      declaration?.type === 'ClassDeclaration') &&
    declaration.id
  ) {
    return [declaration.id.name]
  }
  return []
}

describe('known code-splitter bugs', () => {
  // Bug: a `let` written by the loader (reference module) and read by the split
  // component is extracted to the shared module and imported by both; imports
  // are read-only, so the loader's `count++` throws (or the build rejects the
  // reassignment). Impact: the route breaks as soon as code splitting is on.
  // Remove `.fails` once fixed.
  test.fails(
    'a reassigned let shared between the reference module and a split chunk stays writable',
    async () => {
      const result = await buildAndRun({
        groupings: [['component']],
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
let count = 0
export const Route = createFileRoute('/')({
  loader: () => { count++; return count },
  component: () => <p>{count}</p>,
})`,
          'entry.ts': renderEntry,
        },
        script: `const loaded = [await entry.Route.options.loader({}), await entry.Route.options.loader({})]
return [...loaded, await entry.render(entry.Route.options.component)]`,
      })
      expect(result).toEqual([1, 2, '<p>2</p>'])
    },
    30_000,
  )

  // Bug: with several `createFileRoute(...)` calls in one route file, main
  // points every route at one split chunk (the first route renders the last
  // route's component); the Yuku PR emits a chunk with a duplicated
  // `component` export. Impact: wrong component rendered / broken build.
  // Remove `.fails` once fixed.
  test.fails(
    'several createFileRoute calls in one file keep their own split components',
    async () => {
      const result = await buildAndRun({
        groupings: defaultCodeSplitGroupings,
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
function Home() { return <p>home</p> }
function Other() { return <p>other</p> }
export const Route = createFileRoute('/')({ component: Home })
export const OtherRoute = createFileRoute('/')({ component: Other })`,
          'entry.ts': renderEntry,
        },
        script: `return [
  await entry.render(entry.Route.options.component),
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

  // Bug: for a partially exported destructuring
  // (`const { a, b } = init(); export { a }`) the whole declaration is copied
  // into the reference module and the split chunk instead of being shared.
  // Impact: `init()` runs twice, so module state is duplicated.
  // Remove `.fails` once fixed.
  test.fails(
    'a partially exported destructuring runs its initializer once',
    async () => {
      const result = await buildAndRun({
        groupings: defaultCodeSplitGroupings,
        files: {
          'init.ts': `export function init() {
  ;(globalThis as any).initCalls = ((globalThis as any).initCalls ?? 0) + 1
  return { a: 'a', b: 'b' }
}`,
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { init } from '../init'
const { a, b } = init()
export { a }
export const Route = createFileRoute('/')({
  component: () => <p>{a + b}</p>,
})`,
          'entry.ts': renderEntry,
        },
        script: `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.initCalls]`,
      })
      expect(result).toEqual(['<p>ab</p>', 1])
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
        groupings: defaultCodeSplitGroupings,
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
})`,
          'entry.ts': renderEntry,
        },
        script: `await entry.Route.options.component.preload?.()
await entry.Route.options.errorComponent.preload?.()
return globalThis.effects`,
      })
      expect(result).toBe(1)
    },
    30_000,
  )
})

describe('known React Refresh / route HMR bugs', () => {
  // Bug: when route options are passed through a variable, the HMR transforms
  // replace `component` in the options object with a generated binding
  // (`TSRComponent` / `TSRSplitComponent`) that is declared AFTER the object
  // literal reading it. Impact: the route module throws a TDZ ReferenceError in
  // development. Remove `.fails` once fixed.
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
      code: `import { createFileRoute } from '@tanstack/react-router'
const options = {
  component: () => <p>home</p>,
}
export const Route = createFileRoute('/')(options)`,
    },
  ])(
    'route options in a variable read a component declared before them ($name)',
    ({ code }) => {
      const result = compileWithReactRefresh(code)
      expect(result).toBeTruthy()
      const { program } = parseSync('route.tsx', result!.code, {
        sourceType: 'module',
      })
      const statements = program.body
      const optionsIndex = statements.findIndex((statement) =>
        declaredNames(statement).includes('options'),
      )
      expect(optionsIndex).toBeGreaterThanOrEqual(0)
      const declaration = statements[optionsIndex] as ESTree.VariableDeclaration
      const init = declaration.declarations[0]!.init
      expect(init?.type).toBe('ObjectExpression')
      const component = (init as ESTree.ObjectExpression).properties.find(
        (property): property is ESTree.ObjectProperty =>
          property.type === 'Property' &&
          property.key.type === 'Identifier' &&
          property.key.name === 'component',
      )
      expect(component).toBeDefined()
      if (component!.value.type === 'Identifier') {
        const name = component!.value.name
        const declarationIndex = statements.findIndex((statement) =>
          declaredNames(statement).includes(name),
        )
        // The referenced binding must be initialized before `options` reads it.
        expect(declarationIndex).toBeGreaterThanOrEqual(0)
        expect(declarationIndex).toBeLessThan(optionsIndex)
      }
    },
  )

  // Bug: the React Refresh plugin injects a top-level `const hot =
  // import.meta.hot`, which collides with a user's top-level `hot` binding.
  // Main throws `Duplicate declaration "hot"` at compile time; the Yuku PR
  // emits a module that redeclares `hot`. Impact: the route cannot be served
  // in development. Remove `.fails` once fixed.
  test.fails(
    'a user binding named hot does not collide with the injected HMR code',
    async () => {
      const result =
        compileWithReactRefresh(`import { createFileRoute } from '@tanstack/react-router'
export const hot = 'hot'
export const Route = createFileRoute('/')({
  component: () => <p>{hot}</p>,
})`)
      expect(result).toBeTruthy()
      expect(await getModuleErrors(result!.code)).toEqual([])
      expect(result!.code).toMatch(/export const hot = ['"]hot['"]/)
    },
  )
})

describe('known router-core CommonJS bugs', () => {
  // Bug: in the router-core CommonJS build, `index.cjs` requires
  // `load-client.cjs`, which requires `router.cjs`, which reads
  // `require_load_client.replaceRouteChunk` while `load-client.cjs` is still
  // initializing. `RouterCore.prototype._replaceRouteChunk` stays undefined
  // and Node warns "Accessing non-existent property 'replaceRouteChunk' of
  // module exports inside circular dependency". Impact: for CommonJS
  // consumers (`require('@tanstack/react-router')`), the generated route HMR
  // handler throws `router._replaceRouteChunk is not a function` on every
  // route update. Remove `.fails` once fixed.
  test.fails(
    'route HMR works with the CommonJS build of @tanstack/react-router',
    async () => {
      const script = `globalThis.window = globalThis
const { createMemoryHistory, createRootRoute, createRoute, createRouter } = require('@tanstack/react-router')
const rootRoute = createRootRoute({})
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', loader: () => 'old' })
window.__TSR_ROUTER__ = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  history: createMemoryHistory(),
})
const handleRouteUpdate = new Function(${JSON.stringify(`return ${getHandleRouteUpdateCode([])}`)})()
const newRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', loader: () => 'new' })
handleRouteUpdate(indexRoute.id, newRoute)
process.stdout.write(indexRoute.options.loader())`
      const { stdout, stderr } = await runNode(
        process.execPath,
        ['--eval', script],
        { cwd: __dirname, env: { ...process.env, NODE_ENV: 'development' } },
      ).catch((error: { stdout: string; stderr: string }) => error)
      const error = stderr.match(/\w*Error: .*/)?.[0] ?? null
      expect({ stdout, error }).toEqual({ stdout: 'new', error: null })
    },
    30_000,
  )
})
