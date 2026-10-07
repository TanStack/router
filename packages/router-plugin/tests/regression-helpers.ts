/**
 * Helpers shared by the code-splitter and route HMR regression suites: compile
 * a route file into every module the code splitter emits, drive the bundler
 * plugins the way a bundler does, and inspect or evaluate an emitted module.
 */
import path from 'node:path'
import { parseSync, transformWithOxc } from 'vite'
import { expect } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import { getModuleErrors } from './validate-module'
import type { Config } from '../src/core/config'
import type { TransformResult, UnpluginOptions } from 'unplugin'

export { declarationOf } from './validate-module'

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Compiles a route file with the default groupings into every module the code
 * splitter emits for it: `reference`, one `virtual <split>` chunk per grouping
 * and, when bindings are shared, `shared`.
 */
export function compileRouteModules(
  code: string,
  options: {
    filename?: string
    targetFramework?: 'react' | 'solid'
    /** Compile with route HMR and the framework's HMR compiler plugins. */
    hmr?: boolean
  } = {},
) {
  const {
    filename = 'route.tsx',
    targetFramework = 'react',
    hmr = false,
  } = options
  const groupings = defaultCodeSplitGroupings
  const compilerPlugins = hmr
    ? getFrameworkHmrCompilerPlugins({ targetFramework })
    : undefined
  const computed = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: groupings,
  })
  const sharedBindings = computed.size > 0 ? computed : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: hmr,
    codeSplitGroupings: groupings,
    targetFramework,
    sharedBindings,
    compilerPlugins,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of groupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings,
      compilerPlugins,
    }).code
  }
  if (sharedBindings) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return { modules, sharedBindings: [...computed].sort() }
}

/** Compiles every module of a route file and returns the component chunk. */
export function componentChunk(code: string) {
  return compileRouteModules(code).modules['virtual component']!
}

/** Asserts that every module is valid, reporting the errors by module name. */
export async function expectValidModules(modules: Record<string, string>) {
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code)
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(modules).map((name) => [name, []])),
  )
}

function moduleRecord(code: string) {
  return parseSync('module.tsx', code, { sourceType: 'module' }).module
}

/** Sources a module imports, side-effect imports included, sorted. */
export function importSources(code: string) {
  return [
    ...new Set(
      moduleRecord(code).staticImports.map(
        (statement) => statement.moduleRequest.value,
      ),
    ),
  ].sort()
}

/**
 * The values a module imports from `source`, sorted: `default`, `*` for a
 * namespace import, or the imported name. Type-only specifiers are skipped.
 */
export function importedNames(code: string, source: string) {
  return moduleRecord(code)
    .staticImports.filter(
      (statement) => statement.moduleRequest.value === source,
    )
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) =>
          entry.importName.kind === 'Default'
            ? 'default'
            : entry.importName.kind === 'NamespaceObject'
              ? '*'
              : entry.importName.name!,
        ),
    )
    .sort()
}

/** Value names a module exports (`default` for a default export), sorted. */
export function exportedNames(code: string) {
  return moduleRecord(code)
    .staticExports.flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType && entry.exportName.kind !== 'None')
        .map((entry) => entry.exportName.name ?? 'default'),
    )
    .sort()
}

/** Absolute, normalized path of a route file in the package's `src/routes`. */
export function routeFile(name: string) {
  return normalizePath(path.join(process.cwd(), `src/routes/${name}.tsx`))
}

function runTransform(plugin: UnpluginOptions, code: string, id: string) {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  const result = transform.handler.call({} as never, code, id) as
    | TransformResult
    | null
    | undefined
  if (!result) {
    return null
  }
  return typeof result === 'string' ? result : result.code
}

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'
const sharedPluginName = 'tanstack-router:code-splitter:compile-shared-file'

/**
 * Drives the three code-splitter transforms the way a bundler does, for the
 * given route files (absolute path to route id). `configPlugins` are the
 * plugins of the resolved Vite config; by default the code splitter itself,
 * so its plugin-order check runs.
 */
export async function createCodeSplitterTransforms(
  options: Partial<Config>,
  routes: Record<string, string>,
  configPlugins: Array<{ name: string }> = [{ name: referencePluginName }],
) {
  const context = createRouterPluginContext()
  for (const [file, routeId] of Object.entries(routes)) {
    context.routesByFile.set(file, { routeId })
  }
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true, ...options },
    context,
  )
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const byName = (name: string) => {
    const plugin = pluginArray.find((candidate) => candidate.name === name)
    if (!plugin) {
      throw new Error(`Code-splitter plugin "${name}" not found`)
    }
    return plugin
  }
  const hook = byName(referencePluginName).vite?.configResolved
  const config = {
    root: process.cwd(),
    command: 'build',
    plugins: configPlugins,
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else if (hook) {
    await hook.handler.call({} as never, config)
  }
  return {
    reference: (code: string, id: string) =>
      runTransform(byName(referencePluginName), code, id),
    virtual: (code: string, id: string) =>
      runTransform(byName(virtualPluginName), code, id),
    shared: (code: string, id: string) =>
      runTransform(byName(sharedPluginName), code, id),
  }
}

/**
 * Runs the route HMR plugin (used when automatic code splitting is off) on
 * the route file `file`, registered under `routeId`.
 */
export function transformWithRouteHmrPlugin(
  code: string,
  options: Partial<Config> = { target: 'react' },
  route: { file: string; routeId: string } = {
    file: routeFile('index'),
    routeId: '/',
  },
) {
  const context = createRouterPluginContext()
  context.routesByFile.set(route.file, { routeId: route.routeId })
  const plugins = createRouterHmrPlugin(options, context)
  const plugin = Array.isArray(plugins) ? plugins[0]! : plugins
  const output = runTransform(plugin, code, route.file)
  if (output === null) {
    throw new Error('expected the route HMR plugin to transform the route')
  }
  return output
}

/** Renders JSX to text: intrinsic elements become tags, components are called. */
const jsxToText = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === Fragment) {
    return text
  }
  if (typeof type === 'function') {
    return type({ ...props, children: text })
  }
  if (typeof type !== 'string') {
    throw new Error('cannot render ' + String(type))
  }
  return '<' + type + '>' + text + '</' + type + '>'
}
`

const stubsKey = '__regressionModuleStubs'
let evaluations = 0

/**
 * Evaluates an emitted module like a bundler would: JSX becomes plain calls
 * that render to text, and named imports are linked to `stubs`, keyed by
 * specifier. Every call evaluates a fresh module instance.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, Record<string, unknown>> = {},
): Promise<Record<string, (...args: Array<any>) => any>> {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const key = `${stubsKey}${evaluations++}`
  ;(globalThis as Record<string, unknown>)[key] = stubs
  // Imports are hoisted: link them before any other statement runs.
  const imports: Array<string> = []
  const body = javascript.replace(
    /^import\s+\{([^}]*)\}\s+from\s+(["'])(.+?)\2;?$/gm,
    (_, named: string, __, source: string) => {
      if (!(source in stubs)) {
        throw new Error(`no stub for import ${source}`)
      }
      imports.push(
        `const { ${named.replace(/\bas\b/g, ':')} } = globalThis.${key}[${JSON.stringify(source)}];`,
      )
      return ''
    },
  )
  return import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`${jsxToText}${imports.join('\n')}\n${body}`)}`
  )
}
