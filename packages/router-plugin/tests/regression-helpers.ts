/**
 * Helpers shared by the code-splitter and route HMR regression suites: compile
 * a route file through the code-splitter plugin the way a bundler does,
 * follow the imports of its output to every module it emits, evaluate those
 * modules like a runtime, and inspect an emitted module. The plugin host
 * (`plugin-host.ts`), `loadRoute` (`lazy-tracking.ts`) and `hotUpdate`
 * (`hmr-model.ts`) live in their own modules and are re-exported here.
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import * as React from 'react'
import { parseSync, transformWithOxc } from 'vite'
import { expect } from 'vitest'
import { build, routeApp } from './build-harness'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { ESTree } from 'vite'
import {
  refreshScope,
  transformWithReactRefresh,
  withRouterStubs,
} from './lazy-tracking'
import type { Stubs } from './lazy-tracking'
import { routeModuleId } from './plugin-host'

export {
  webpackCompiler,
  routeModuleId,
  importRequests,
  compileRouteModules,
  eagerModuleIds,
  eagerImportSources,
  countAcrossModules,
  expectValidModules,
  importSources,
  routeModuleSources,
  importedNames,
  exportedNames,
  routeFile,
  createCodeSplitterTransforms,
  generatedRouteId,
  transformWithRouteHmrPlugin,
  createRouteHmrTransform,
} from './plugin-host'
export type { TargetFramework, WebpackCompilerStub } from './plugin-host'
export {
  componentChunk,
  routeSpecifier,
  loadRoute,
  createRouteLoader,
} from './lazy-tracking'
export { hotUpdate } from './hmr-model'
export type { HotUpdateOptions } from './hmr-model'

export { declaredNames } from '@tanstack/compiler-test-utils/validate-module'

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Evaluates an emitted module like a runtime would: JSX becomes plain calls
 * that render to text, and imports of every form (named, default, namespace,
 * side-effect only, re-exports) link to `stubs`, keyed by specifier, as real
 * ES modules. `importMeta` is assigned to `import.meta` before the module
 * runs. Every call evaluates a fresh module instance.
 */
export async function evaluateModule(
  code: string,
  stubs: Stubs = {},
  options: { importMeta?: Record<string, unknown>; filename?: string } = {},
): Promise<Record<string, (...args: Array<any>) => any>> {
  const id = routeModuleId(options.filename ?? 'module.tsx')
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs,
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  })
  return moduleGraph.import(id)
}

/**
 * Evaluates one compiled route module on its own with the React Refresh
 * transform: the router package is stubbed, `react` is React, `stubs`
 * provide other imports and any remaining import is a module whose imports
 * are identity functions (`connect(Page)` returns `Page`). `importMeta` is
 * assigned to `import.meta` before the module runs. Returns its exports, its
 * `Route` and what React Refresh registered.
 */
export async function evaluateRouteModule(
  code: string,
  stubs: Stubs = {},
  options: { importMeta?: Record<string, unknown> } = {},
) {
  const id = routeModuleId()
  const registered = new Map<unknown, string>()
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs: withRouterStubs({ react: React, ...stubs }, new Map()),
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

/**
 * Applies Vite's Oxc React Refresh transform (the one `@vitejs/plugin-react`
 * uses) and returns the registered component names and the hook signature
 * arguments of each signed binding.
 */
export async function reactRefresh(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: {
      runtime: 'automatic',
      development: true,
      refresh: { emitFullSignatures: true },
    },
  })
  const registered = [
    ...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g),
  ].map((match) => match[1]!)
  const signatures = new Map(
    [...result.code.matchAll(/\b_s\d*\((\w+), ([\s\S]*?)\);\n/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    ),
  )
  return { registered, signatures }
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

/**
 * Asserts that the module is valid and that React Refresh registers the
 * value of the `option` of the `Route` it creates, so that edits of that
 * component hot-update. Returns the name it is registered under.
 */
export async function expectRegisteredRouteOption(
  code: string,
  option: string,
) {
  expect(await getModuleErrors(code)).toEqual([])
  const { Route, registered } = await evaluateRouteModule(code)
  const name = registered.get(Route.options[option])
  expect(
    name,
    `\`${option}\` is not a component React Refresh registers (registered: ${[...registered.values()].join(', ')})`,
  ).toBeDefined()
  return name!
}

/**
 * Builds a small app with the real Vite plugin (code splitting on, default
 * groupings unless `groupings` is given): `routes/index.tsx` holds `route`,
 * and `entry.ts` re-exports the route module next to `render(component)`,
 * which preloads a component and renders it to a string. `files` adds files
 * or replaces `entry.ts`. The app directory name starts with `prefix`. Then
 * imports the built entry in a separate Node process and returns the JSON
 * value returned by `script`, which has the entry's exports in scope as
 * `entry`.
 *
 * A production Vite SSR build of `build-harness.ts`, without minification.
 * The app's `package.json` declares no side-effect hint unless `sideEffects`
 * gives one, like an app's.
 */
export async function buildAndRun(
  route: string,
  script: string,
  options: {
    files?: Record<string, string>
    groupings?: CodeSplitGroupings
    prefix?: string
    sideEffects?: boolean
  } = {},
) {
  const app = await build({
    bundler: 'vite',
    env: 'ssr',
    minify: false,
    sideEffects: options.sideEffects,
    prefix: options.prefix ?? '.regression-build-',
    files: routeApp(route, { files: options.files }),
    pluginOptions: options.groupings && {
      codeSplittingOptions: { defaultBehavior: options.groupings },
    },
  })
  try {
    return (await app.run(script)).result
  } finally {
    await app.dispose()
  }
}
