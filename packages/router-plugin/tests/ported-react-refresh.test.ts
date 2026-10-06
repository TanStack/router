/**
 * Known React Refresh gaps in route HMR, ported from React Refresh's Babel
 * plugin tests (facebook/react
 * `packages/react-refresh/src/__tests__/ReactFreshBabelPlugin-test.js`, MIT)
 * and pinned as expected failures.
 *
 * Route HMR keeps the previous value of `component` and the other component
 * options so that React Refresh can patch them in place. A component React
 * Refresh does not register is never patched, so the kept value keeps
 * rendering the old code: the edit is silently dropped until a full reload.
 * Each test compiles a route with the HMR transforms, runs Vite's Oxc React
 * Refresh transform (the one `@vitejs/plugin-react` uses) on the output, and
 * asserts that the component is registered.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails`. When a fix
 * lands, Vitest reports the `.fails` test as failed and the modifier must be
 * removed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { getModuleErrors } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

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

/** Names React Refresh registers in `code`. */
async function registeredComponents(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: { runtime: 'automatic', development: true, refresh: true },
  })
  return [...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g)].map(
    (match) => match[1]!,
  )
}

describe('known React Refresh gaps in route HMR', () => {
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
      compile: (code: string) =>
        compileCodeSplitReferenceRoute({
          code,
          filename: 'route.tsx',
          id: 'route.tsx',
          addHmr: true,
          codeSplitGroupings: defaultCodeSplitGroupings,
          targetFramework: 'react',
          compilerPlugins: getFrameworkHmrCompilerPlugins({
            targetFramework: 'react',
          }),
        })?.code ?? code,
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
      const chunk = compileCodeSplitVirtualRoute({
        code: `${head}${declaration}
export const Route = createFileRoute('/')({ component: page })`,
        filename: 'route.tsx?tsr-split=component',
        splitTargets: ['component'],
        compilerPlugins: getFrameworkHmrCompilerPlugins({
          targetFramework: 'react',
        })!.filter((plugin) => plugin.onVirtualRouteSplitNode),
      }).code
      expect(await getModuleErrors(chunk)).toEqual([])
      const local = chunk.match(/export \{ (\w+) as component \}/)?.[1]
      expect(local).toBeDefined()
      expect(await registeredComponents(chunk)).toContain(local)
    },
  )
})
