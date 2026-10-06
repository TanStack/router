/**
 * Known route HMR and React Refresh bugs, pinned as expected failures.
 *
 * Every `.fails` test asserts the CORRECT behaviour and is marked `.fails`
 * because the compiler does not implement it yet. When a fix lands, the test
 * starts passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 *
 * The React Refresh registration tests are ported from React Refresh's Babel
 * plugin tests (facebook/react
 * `packages/react-refresh/src/__tests__/ReactFreshBabelPlugin-test.js`, MIT).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { getModuleErrors } from './validate-module'
import type { ESTree } from 'vite'

const runNode = promisify(execFile)

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** Compiles a reference route with code splitting and the React HMR plugins. */
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

/** Runs the route HMR plugin used when automatic code splitting is off. */
async function compileWithRouteHmr(code: string) {
  const id = `${process.cwd().replaceAll('\\', '/')}/src/routes/index.tsx`
  const context = createRouterPluginContext()
  context.routesByFile.set(id, { routeId: '/' })
  const plugins = createRouterHmrPlugin({ target: 'react' }, context)
  const plugin = Array.isArray(plugins) ? plugins[0]! : plugins
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('expected an object transform hook')
  }
  const result = await transform.handler.call({} as never, code, id)
  if (!result || typeof result === 'string') {
    throw new Error('expected the route HMR plugin to transform the route')
  }
  return result.code
}

/** Compiles the component chunk of a route with the React HMR plugins. */
function compileComponentChunk(code: string) {
  return compileCodeSplitVirtualRoute({
    code,
    filename: 'route.tsx?tsr-split=component',
    splitTargets: ['component'],
    compilerPlugins: getFrameworkHmrCompilerPlugins({
      targetFramework: 'react',
    })!.filter((plugin) => plugin.onVirtualRouteSplitNode),
  }).code
}

/**
 * Names React Refresh registers in `code`, using Vite's Oxc React Refresh
 * transform (the one `@vitejs/plugin-react` uses).
 */
async function registeredComponents(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: { runtime: 'automatic', development: true, refresh: true },
  })
  return [...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g)].map(
    (match) => match[1]!,
  )
}

/** The local name a component chunk exports as `component`. */
function chunkComponentName(chunk: string) {
  return chunk.match(/export \{ (\w+) as component \}/)?.[1]
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

describe('known route HMR bugs: React Refresh registration', () => {
  // Route HMR keeps the previous value of `component` and the other component
  // options so that React Refresh can patch them in place. A component React
  // Refresh does not register is never patched, so the kept value keeps
  // rendering the old code: the edit is silently dropped until a full reload.

  // Controls for the bugs below: a plain inline component is hoisted and
  // registered, and a PascalCase split component is registered in its chunk.
  test('registers an inline arrow component', async () => {
    const output = await compileWithRouteHmr(`${head}
export const Route = createFileRoute('/')({ component: () => <p>hi</p> })`)
    expect(await getModuleErrors(output)).toEqual([])
    const binding = output.match(/\bcomponent: (\w+)\s*[,}]/)?.[1]
    expect(binding).toBeDefined()
    expect(await registeredComponents(output)).toContain(binding)
  })

  test('registers a PascalCase split component', async () => {
    const chunk = compileComponentChunk(`${head}const Page = () => <p>hi</p>
export const Route = createFileRoute('/')({ component: Page })`)
    expect(await getModuleErrors(chunk)).toEqual([])
    const local = chunkComponentName(chunk)
    expect(local).toBeDefined()
    expect(await registeredComponents(chunk)).toContain(local)
  })

  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand) are neither hoisted nor registered,
  // while route HMR keeps the previous component. Impact: edits to these
  // components are silently dropped until a full page reload. Unsplit routes
  // (root routes, or file routes without automatic code splitting) are
  // affected. Remove `.fails` once fixed.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  test.fails.each([
    {
      name: 'memo(() => ...)',
      code: `${head}import { memo } from 'react'
export const Route = createFileRoute('/')({ component: memo(() => <p>hi</p>) })`,
      compile: compileWithRouteHmr,
    },
    {
      name: 'forwardRef(function () { ... })',
      code: `${head}import { forwardRef } from 'react'
export const Route = createFileRoute('/')({
  component: forwardRef(function (props, ref) {
    return <p ref={ref}>hi</p>
  }),
})`,
      compile: compileWithRouteHmr,
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
      compile: (code: string) => compileWithReactRefresh(code)?.code ?? code,
    },
    {
      name: 'method shorthand',
      code: `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
      compile: compileWithRouteHmr,
    },
  ])(
    'registers an inline component written as $name',
    async ({ code, compile }) => {
      const output = await compile(code)
      expect(await getModuleErrors(output)).toEqual([])
      const binding = output.match(/\bcomponent: (\w+)\s*[,}]/)?.[1]
      expect(binding).toBeDefined()
      expect(await registeredComponents(output)).toContain(binding)
    },
  )

  // Bug: a lowercase component declared as a variable (`const page = () =>
  // ...`) is moved into its split chunk under its own name. React Refresh only
  // registers PascalCase names, so the chunk exports an unregistered function
  // named `page`, and `@vitejs/plugin-react` does not treat the chunk as a Fast
  // Refresh boundary (`function page` declarations are renamed to
  // `SplitComponent` for exactly this reason). Impact: editing the component
  // does not hot-update it; the cached lazy route component keeps rendering
  // the old code until a full reload. Remove `.fails` once fixed.
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
      const chunk = compileComponentChunk(`${head}${declaration}
export const Route = createFileRoute('/')({ component: page })`)
      expect(await getModuleErrors(chunk)).toEqual([])
      const local = chunkComponentName(chunk)
      expect(local).toBeDefined()
      expect(await registeredComponents(chunk)).toContain(local)
    },
  )
})

describe('known route HMR bugs: generated code', () => {
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
      code: `${head}const options = {
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
      const result = compileWithReactRefresh(`${head}export const hot = 'hot'
export const Route = createFileRoute('/')({
  component: () => <p>{hot}</p>,
})`)
      expect(result).toBeTruthy()
      expect(await getModuleErrors(result!.code)).toEqual([])
      expect(result!.code).toMatch(/export const hot = ['"]hot['"]/)
    },
  )
})

describe('known route HMR bugs: router-core CommonJS build', () => {
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
