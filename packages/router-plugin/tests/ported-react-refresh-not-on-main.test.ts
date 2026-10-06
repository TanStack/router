/**
 * React Refresh scenarios (ported from facebook/react
 * `packages/react-refresh/src/__tests__/ReactFreshBabelPlugin-test.js`, MIT)
 * that the Babel-based compiler on `main` gets wrong.
 *
 * Each test compiles a route with the HMR transforms, then runs Vite's Oxc
 * React Refresh transform (the one `@vitejs/plugin-react` uses) on the output
 * to check that route components are registered.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
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

/** Compiles every module the code splitter emits for a route, with React HMR. */
function compileWithCodeSplitting(code: string) {
  const compilerPlugins = getFrameworkHmrCompilerPlugins({
    targetFramework: 'react',
  })!
  const sharedBindings = computeSharedBindings({
    code,
    filename: 'route.tsx',
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const modules: Record<string, string> = {
    reference:
      compileCodeSplitReferenceRoute({
        code,
        filename: 'route.tsx',
        id: 'route.tsx',
        addHmr: true,
        codeSplitGroupings: defaultCodeSplitGroupings,
        targetFramework: 'react',
        compilerPlugins,
        sharedBindings: shared,
      })?.code ?? code,
  }
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    modules[split] = compileCodeSplitVirtualRoute({
      code,
      filename: `route.tsx?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
      compilerPlugins: compilerPlugins.filter(
        (plugin) => plugin.onVirtualRouteSplitNode,
      ),
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: 'route.tsx?tsr-shared=1',
    }).code
  }
  return modules
}

async function getErrorsByModule(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  return errors
}

function noErrors(modules: Record<string, string>) {
  return Object.fromEntries(Object.keys(modules).map((name) => [name, []]))
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

/** Local name a split chunk exports as `component`. */
function splitComponentBinding(chunk: string) {
  const local = chunk.match(/export \{ (\w+) as component \}/)?.[1]
  expect(local).toBeDefined()
  return local!
}

describe('ported React Refresh: component registration main gets wrong', () => {
  // Source: ReactFreshBabelPlugin-test "registers top-level variable declarations with arrow functions"
  // Main leaves the wrapped function inline and unregistered, so route HMR
  // keeps the old component and the edit is dropped.
  it.each([
    ['as any', `(() => <p>hi</p>) as any`],
    ['satisfies', `(() => <p>hi</p>) satisfies FC`],
    ['a non-null assertion', `(() => <p>hi</p>)!`],
  ])('registers an inline component wrapped in %s', async (_, component) => {
    const code = await compileWithRouteHmr(
      `${head}import type { FC } from 'react'
export const Route = createFileRoute('/')({ component: ${component} })`,
    )
    expect(await getModuleErrors(code)).toEqual([])
    const binding = code.match(/\bcomponent: (\w+)\s*[,}]/)?.[1]
    expect(binding).toBeDefined()
    expect(await registeredComponents(code)).toContain(binding)
  })

  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  // Main throws "Support for the experimental syntax 'jsx' isn't currently
  // enabled" while building the split chunk.
  it.each([
    [
      'memo',
      `import { memo } from 'react'`,
      `memo(() => <p>hi</p>)`,
      ['SplitComponent$memo', 'SplitComponent'],
    ],
    [
      'forwardRef',
      `import { forwardRef } from 'react'`,
      `forwardRef(function (props, ref) {\n  return <p ref={ref}>hi</p>\n})`,
      ['SplitComponent$forwardRef', 'SplitComponent'],
    ],
  ])(
    'splits and registers an inline %s component',
    async (_, imports, component, families) => {
      const modules = compileWithCodeSplitting(`${head}${imports}
export const Route = createFileRoute('/')({ component: ${component} })`)
      expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
      const chunk = modules.component!
      expect(splitComponentBinding(chunk)).toBe('SplitComponent')
      expect(await registeredComponents(chunk)).toEqual(
        expect.arrayContaining(families),
      )
    },
  )

  // Source: ReactFreshBabelPlugin-test "registers top-level exported function declarations" (`export { Baz }`)
  // Main splits the component away but leaves `export { page }` behind in the
  // reference module, which no longer declares `page`.
  it('keeps a component exported through an export specifier registered', async () => {
    const modules =
      compileWithCodeSplitting(`${head}const page = () => <p>hi</p>
export { page }
export const Route = createFileRoute('/')({ component: page })`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    const reference = modules.reference!
    expect(reference).toMatch(/export \{ \w+ as page \}|export \{ page \}/)
    const binding = reference.match(/\bcomponent: (\w+)\s*[,}]/)?.[1]
    expect(binding).toBeDefined()
    expect(await registeredComponents(reference)).toContain(binding)
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level function declarations" (one component, two uses)
  // Main's component chunk exports a `SplitComponent` it never declares.
  it('registers a component that is also the unsplit pendingComponent', async () => {
    const modules = compileWithCodeSplitting(`${head}function page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: page, pendingComponent: page })`)
    expect(await getErrorsByModule(modules)).toEqual(noErrors(modules))
    const chunk = modules.component!
    expect(await registeredComponents(chunk)).toContain(
      splitComponentBinding(chunk),
    )
  })
})
