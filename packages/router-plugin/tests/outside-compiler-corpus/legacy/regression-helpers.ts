// Legacy Node-evaluation harness (module linker, Node rendering, hand-registered
// routes), kept only for the implementation tests of outside-compiler-corpus/.
// Acceptance tests use ../../route-app.ts (public plugin host, browser page).
/**
 * Helpers shared by the code-splitter and route HMR regression suites: compile
 * a route file through the code-splitter plugin the way a bundler does,
 * follow the imports of its output to every module it emits, evaluate those
 * modules like a runtime, and inspect an emitted module. The plugin host
 * (`plugin-host.ts`) and `loadRoute` (`lazy-tracking.ts`) live in their own
 * modules and are re-exported here. Route HMR has no in-process model: what
 * the page shows after an edit is tested with `openRouteHmrPage`
 * (`route-hmr-page.ts`).
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { frameworkTransform } from '@tanstack/compiler-test-utils/render'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import {
  packagesDirectory,
  refreshScope,
  transformWithReactRefresh,
} from './lazy-tracking'
import type { TargetFramework } from './plugin-host'
import type { ESTree } from 'vite'
import type { Stubs } from './lazy-tracking'

export {
  importRequests,
  compileRouteModules,
  expectValidModules,
  importSources,
  importedNames,
  routeFile,
  transformWithRouteHmrPlugin,
  createRouteHmrTransform,
} from './plugin-host'
export type { TargetFramework } from './plugin-host'
export {
  componentModules,
  routeSpecifier,
  loadRoute,
  loadRouteGraph,
  createRouteLoader,
  renderComponent,
} from './lazy-tracking'

export { declaredNames } from '@tanstack/compiler-test-utils/validate-module'

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Evaluates an emitted module like a runtime would: imports of every form
 * (named, default, namespace, side-effect only, re-exports) link to `stubs`,
 * keyed by specifier, as real ES modules, and other bare imports to the real
 * installed packages; JSX compiles with the real transform of `framework`
 * (default React) into real elements (render them with `renderComponent`).
 * `importMeta` is assigned to `import.meta` before the module runs. Every
 * call evaluates a fresh module instance.
 */
export async function evaluateModule(
  code: string,
  stubs: Stubs = {},
  options: {
    importMeta?: Record<string, unknown>
    filename?: string
    framework?: TargetFramework
  } = {},
): Promise<Record<string, (...args: Array<any>) => any>> {
  const id = `/${options.filename ?? 'module.tsx'}`
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs,
    packages: packagesDirectory,
    transform: frameworkTransform(
      options.framework ?? 'react',
      packagesDirectory,
    ),
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  })
  return moduleGraph.import(id)
}

/**
 * Evaluates one compiled route module on its own with the React Refresh
 * transform: the router package and React are the real ones, `stubs`
 * provide other imports and any remaining import no package provides is a
 * module whose imports are identity functions (`connect(Page)` returns
 * `Page`). `importMeta` is assigned to `import.meta` before the module runs.
 * Returns its exports, its `Route` and what React Refresh registered.
 */
export async function evaluateRouteModule(
  code: string,
  stubs: Stubs = {},
  options: { importMeta?: Record<string, unknown> } = {},
) {
  const id = '/route.tsx'
  const registered = new Map<unknown, string>()
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs,
    packages: packagesDirectory,
    fallbackStub: (_, names) =>
      Object.fromEntries(
        [...names].map((name) => [name, (value: unknown) => value]),
      ),
    scope: () => refreshScope(registered),
    transform: transformWithReactRefresh,
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  })
  const exports = await moduleGraph.import(id)
  const Route = exports.Route as { options: Record<string, any> } | undefined
  if (!Route) {
    throw new Error('the route module does not export `Route`')
  }
  return { exports, Route, registered }
}

/** Parses a module, asserting that it has no syntax errors. */
export function parseModule(code: string): ESTree.Program {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

/**
 * The value of `option` on the `Route` a compiled route module creates, once
 * evaluated (see `evaluateRouteModule` for how its imports are linked).
 */
export async function getRouteOption(
  code: string,
  option: string,
  stubs: Stubs = {},
) {
  const { Route } = await evaluateRouteModule(code, stubs)
  return Route.options[option] as unknown
}

export { buildAndRun } from '../../build-harness'
