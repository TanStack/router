/**
 * Shared harness of the Start compiler behaviour suites: compile a module
 * into its client, SSR caller and server-function provider outputs, split
 * `<Hydrate>` children into chunks, and evaluate compiled modules (linked as
 * real ES modules, `@tanstack/compiler-test-utils/module-linker`) against a
 * Start's runtime (`./start-runtime`).
 */
import { stripVTControlCharacters } from 'node:util'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import {
  createClientRpc,
  createServerRpc,
  createSsrRpc,
  startClientCore,
} from './start-runtime'
import {
  freeIdentifiers,
  getModuleErrors,
} from '@tanstack/compiler-test-utils/validate-module'
import type {
  ModuleGraphOptions,
  ModuleStub,
} from '@tanstack/compiler-test-utils/module-linker'
import type { ServerFn } from '../src/start-compiler/types'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
  StartCompilerPlugin,
  StartCompilerTransformResult,
} from '../src/types'
import type { ESTree } from 'vite'

export type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'

type Node = { type: string; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/** The static value of a module specifier expression, if any. */
function staticSpecifier(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (
    node.type === 'TemplateLiteral' &&
    (node.expressions as Array<unknown>).length === 0
  ) {
    const [quasi] = node.quasis as Array<{ value: { cooked: string } }>
    return quasi!.value.cooked
  }
  return undefined
}

function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit)
    }
    return
  }
  if (!isNode(node)) {
    return
  }
  visit(node)
  for (const key in node) {
    if (key !== 'type') {
      walk(node[key], visit)
    }
  }
}

/** Name an import or export specifier refers to. */
function specifierName(node: unknown) {
  if (!isNode(node)) {
    return undefined
  }
  return node.type === 'Identifier'
    ? (node.name as string)
    : (node.value as string)
}

interface ModuleRequests {
  /** Source of each import and re-export declaration, in source order. */
  declarations: Array<string>
  /** Specifiers of static imports and re-exports, unique, in source order. */
  static: Array<string>
  /** Static specifiers of dynamic `import()` calls, in source order. */
  dynamic: Array<string>
  /** Names imported or re-exported from each static specifier. */
  names: Map<string, Set<string>>
}

/**
 * Parses a module as TypeScript with JSX, or else as TypeScript (where
 * `<T>value` is a type assertion).
 */
function parseModule(code: string): ESTree.Program {
  const tsx = parseSync('module.tsx', code, { sourceType: 'module' })
  if (tsx.errors.length === 0) {
    return tsx.program
  }
  const ts = parseSync('module.ts', code, { sourceType: 'module' })
  if (ts.errors.length === 0) {
    return ts.program
  }
  throw new Error(`Cannot parse module: ${tsx.errors[0]!.message}\n${code}`)
}

/** The modules a JavaScript or TypeScript (JSX) module requests. */
function moduleRequests(code: string) {
  const program = parseModule(code)
  const requests: ModuleRequests = {
    declarations: [],
    static: [],
    dynamic: [],
    names: new Map(),
  }
  const declare = (specifier: string) => {
    requests.declarations.push(specifier)
    request(specifier)
  }
  const request = (specifier: string, name?: string) => {
    if (!requests.names.has(specifier)) {
      requests.static.push(specifier)
      requests.names.set(specifier, new Set())
    }
    if (name !== undefined) {
      requests.names.get(specifier)!.add(name)
    }
  }
  walk(program, (node) => {
    switch (node.type) {
      case 'ImportDeclaration': {
        const source = staticSpecifier(node.source)!
        declare(source)
        for (const specifier of node.specifiers as Array<Node>) {
          if (specifier.type === 'ImportDefaultSpecifier') {
            request(source, 'default')
          } else if (specifier.type === 'ImportSpecifier') {
            request(source, specifierName(specifier.imported))
          }
        }
        break
      }
      case 'ExportNamedDeclaration': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          declare(source)
          for (const specifier of node.specifiers as Array<Node>) {
            request(source, specifierName(specifier.local))
          }
        }
        break
      }
      case 'ExportAllDeclaration':
        declare(staticSpecifier(node.source)!)
        break
      case 'ImportExpression': {
        const source = staticSpecifier(node.source)
        if (source !== undefined) {
          requests.dynamic.push(source)
        }
        break
      }
    }
  })
  return requests
}

export type Output = 'client' | 'ssr' | 'provider'
export const outputs: Array<Output> = ['client', 'ssr', 'provider']
const moduleId = '/test/src/module.tsx'

/** The framework a module is compiled for: its `@tanstack/<framework>-*` packages. */
export type Framework = CompileStartFrameworkOptions

interface StartCompilerOptions {
  env: 'client' | 'server'
  mode?: 'build' | 'dev'
  /** Default `react`. */
  framework?: Framework
  /** Project modules by absolute id; `./name` resolves to `/test/src/name.ts`. */
  files?: Record<string, string>
  /** `serverFnProviderModuleDirectives` */
  directives?: Array<string>
  compilerPlugins?: Array<StartCompilerPlugin>
  /** External import transforms (`compilerTransforms` of the Start plugin). */
  compilerTransforms?: Array<StartCompilerImportTransform>
  /**
   * Host hooks replacing the default ones (which resolve and load `files`
   * and the `@tanstack/*` packages).
   */
  host?: {
    resolveId?: (id: string, importer?: string) => Promise<string | null>
    loadModule?: (id: string) => Promise<void>
  }
}

/**
 * Creates a `StartCompiler` (React unless `framework` says otherwise)
 * configured the way the bundler plugins do, and records the server
 * functions it reports. `compile` returns the compiled code, `transform` the
 * code and its source map (`null` when the module is left untouched).
 */
export function createStartCompiler(options: StartCompilerOptions) {
  const { env, files = {}, framework = 'react', compilerTransforms } = options
  const serverFns: Record<string, ServerFn> = {}
  const compiler: StartCompiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework,
    providerEnvName: 'ssr',
    mode: options.mode ?? 'build',
    lookupKinds: getLookupKindsForEnv(env, { compilerTransforms }),
    lookupConfigurations: getLookupConfigurationsForEnv(env, framework, {
      compilerTransforms,
    }),
    getKnownServerFns: () => ({}),
    devServerFnModuleSpecifierEncoder: ({ extractedFilename, root }) =>
      `/@id${extractedFilename.slice(root.length)}`,
    serverFnProviderModuleDirectives: options.directives,
    onServerFnsById: (fns) => Object.assign(serverFns, fns),
    loadModule: async (id) => {
      const code = files[id]
      if (code !== undefined) {
        compiler.ingestModule({ code, id })
      }
    },
    resolveId: async (id) => {
      if (id.startsWith('@tanstack/')) {
        return id
      }
      const file = id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id
      return file in files ? file : null
    },
    compilerPlugins: options.compilerPlugins,
    compilerTransforms,
    ...options.host,
  })
  const transform = async (
    code: string,
    id = moduleId,
  ): Promise<StartCompilerTransformResult | null> =>
    (await compiler.compile({
      code,
      id,
      // Detected the way the bundler plugins detect them.
      detectedKinds: detectKindsInCode(code, env, { compilerTransforms }),
    })) ?? null
  const compile = async (code: string, id = moduleId) =>
    (await transform(code, id))?.code ?? null
  return { compiler, compile, transform, serverFns }
}

/**
 * Compiles `code` for one output: the client, the SSR caller or the
 * server-function provider module (`?tss-serverfn-split`). Returns the code
 * and its source map (both `null` when the module is left untouched).
 */
export async function compileFor(
  output: Output,
  code: string,
  options: Omit<StartCompilerOptions, 'env'> & { id?: string } = {},
) {
  const { transform, serverFns } = createStartCompiler({
    ...options,
    env: output === 'client' ? 'client' : 'server',
  })
  const id = options.id ?? moduleId
  const result = await transform(
    code,
    output === 'provider' ? `${id}?tss-serverfn-split` : id,
  )
  return { code: result?.code ?? null, map: result?.map ?? null, serverFns }
}

/** Like `compileFor`, returning only the code (null when untouched). */
export async function compileCode(
  ...args: Parameters<typeof compileFor>
): Promise<string | null> {
  return (await compileFor(...args)).code
}

/**
 * Compiles the client, SSR caller and provider outputs, checks that each is
 * a valid module and returns them with the server functions the client
 * compilation reported.
 */
export async function compileAll(
  code: string,
  options: Omit<StartCompilerOptions, 'env'> & { id?: string } = {},
) {
  const compiled = {} as Record<Output, string>
  const errors = {} as Record<Output, Array<string>>
  let serverFns: Record<string, ServerFn> = {}
  const file = (options.id ?? moduleId).replace(/^.*\//, '')
  for (const output of outputs) {
    const result = await compileFor(output, code, options)
    expect(result.code, output).not.toBeNull()
    compiled[output] = result.code!
    errors[output] = await getModuleErrors(result.code!, file)
    if (output === 'client') {
      serverFns = result.serverFns
    }
  }
  expect(errors).toEqual({ client: [], ssr: [], provider: [] })
  return {
    ...compiled,
    serverFns,
    id: options.id,
    framework: options.framework,
    files: options.files,
  }
}

/**
 * The modules of the SSR bundle compiled from one source module: the SSR
 * caller, under the module's id, and the server-function provider, under the
 * id with `?tss-serverfn-split`. The provider may import the SSR caller (or
 * anything else) like any module of the bundle.
 */
export interface ServerOutputs {
  /** The SSR caller; `undefined` when compiling it failed. */
  ssr: string | undefined
  provider: string
  /** Id of the source module. Default `/test/src/module.tsx`. */
  id?: string
  /** Default `react`. */
  framework?: Framework
  /**
   * The server fns the callers reported (`onServerFnsById`), which the
   * server-fn resolver serves: an SSR call by id (`createSsrRpc`) runs the
   * handler of the provider module and export the report names.
   */
  serverFns?: Record<string, ServerFn>
  /** Project modules by absolute id, linked as they are (uncompiled). */
  files?: Record<string, string>
}

/**
 * Compiles `code` into the modules of the SSR bundle (`ServerOutputs`): the
 * SSR caller (the source itself when the compiler leaves it untouched) and
 * the provider, and returns them with the server functions the SSR caller
 * reported.
 */
export async function compileServer(
  code: string,
  options: Omit<StartCompilerOptions, 'env'> & { id?: string } = {},
) {
  const ssr = await compileFor('ssr', code, options)
  const provider = await compileFor('provider', code, options)
  expect(provider.code, 'provider').not.toBeNull()
  return {
    ssr: ssr.code ?? code,
    provider: provider.code!,
    id: options.id,
    framework: options.framework,
    serverFns: ssr.serverFns,
    files: options.files,
  }
}

// Start's real runtime, for tests that link a project module to it.
export { startClientCore } from './start-runtime'

// The `compilerTransforms` test transform lives in the seam module.
export { renderThingTransform } from './compiler-transforms-seam'

/**
 * Project-local sources of a module's import and re-export declarations
 * (one per declaration), sorted.
 */
export function importSources(code: string) {
  return moduleRequests(code)
    .declarations.filter((source) => !source.startsWith('@tanstack/'))
    .sort()
}

/**
 * Where an evaluated module runs: in the browser (`client`, the default) or
 * in the server bundle (`server`).
 */
export type RuntimeEnv = 'client' | 'server'

/** An RPC factory that environment's callers must not use. */
function foreignRpc(factory: string, env: RuntimeEnv) {
  return (functionId: string) => {
    throw new Error(`${factory}(${functionId}) in the ${env} runtime`)
  }
}

/**
 * An SSR RPC evaluated outside an SSR bundle: it carries the id but cannot
 * be called (`createServerGraph` links one that resolves the handler).
 */
function unlinkedSsrRpc(functionId: string) {
  return Object.assign(() => {
    throw new Error(
      `createSsrRpc(${functionId}) outside an SSR bundle (createServerGraph)`,
    )
  }, createSsrRpc(functionId))
}

/**
 * A client RPC: the one Start creates (its id, url and marker), except that
 * calling it throws instead of fetching a server the harness does not run.
 */
function unlinkedClientRpc(functionId: string) {
  return Object.assign(() => {
    throw new Error(`client RPC ${functionId} called: no server to fetch`)
  }, createClientRpc(functionId))
}

/**
 * The Start packages of a framework, in `env`: Start's real runtime
 * (`./start-runtime`) for `@tanstack/<framework>-start` and its
 * `/server-rpc` entry. The RPCs of callers are the only stand-ins: a client
 * RPC is Start's own without its fetch (`unlinkedClientRpc`); an SSR RPC
 * resolves the provider's handler by id, which only an SSR bundle can do
 * (`createServerGraph`), and elsewhere cannot be called. A client RPC in
 * the server runtime throws: SSR callers must use their own RPC.
 */
function startRuntime(
  framework: Framework,
  env: RuntimeEnv = 'client',
): Record<string, ModuleStub> {
  const start = `@tanstack/${framework}-start`
  return {
    [start]: startClientCore,
    [`${start}/server-rpc`]: { createServerRpc },
    [`${start}/client-rpc`]: {
      createClientRpc:
        env === 'client'
          ? unlinkedClientRpc
          : foreignRpc('createClientRpc', env),
    },
    [`${start}/ssr-rpc`]: {
      createSsrRpc: unlinkedSsrRpc,
    },
  }
}

/**
 * The id of the RPC a caller's server fn calls: Start's caller metadata
 * (`serverFnMeta`, only the id). `undefined` when the server fn is no RPC
 * caller (e.g. its handler was left in place).
 */
export function callerRpcId(fn: unknown): string | undefined {
  if (typeof fn !== 'function') {
    return undefined
  }
  const meta = (fn as { serverFnMeta?: Record<string, unknown> }).serverFnMeta
  if (
    meta === undefined ||
    typeof meta.id !== 'string' ||
    Object.keys(meta).length !== 1
  ) {
    return undefined
  }
  return meta.id
}

/**
 * JSX runtime of evaluated modules: intrinsic elements render as tags with
 * their props (other than `children` and React's `key`) as JSON with sorted
 * keys, functions as `"<function>"` (`<p {"id":"x"}>`, `<p>` without props),
 * so a lost or changed attribute shows in the output; components are called
 * with their props.
 */
const jsxToText = `const __Fragment = Symbol('Fragment')
const __attributes = (props) => {
  const names = Object.keys(props ?? {}).filter((name) => name !== 'children' && name !== 'key').sort()
  if (names.length === 0) return ''
  return ' ' + JSON.stringify(
    Object.fromEntries(names.map((name) => [name, props[name]])),
    (_, value) => (typeof value === 'function' ? '<function>' : value),
  )
}
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') return type(children.length ? { ...props, children: text } : { ...props })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + __attributes(props) + '>' + text + '</' + type + '>'
}
`

/**
 * A graph of linked modules (`createModuleGraph`) whose imports resolve to
 * `stubs` (by specifier) over the Start runtime of `framework`
 * (default `react`), and whose JSX renders through `runtime` (default:
 * `jsxToText`).
 */
function createTestModuleGraph(
  options: ModuleGraphOptions & { framework?: Framework; env?: RuntimeEnv },
) {
  const { framework = 'react', env, ...graphOptions } = options
  return createModuleGraph({
    ...graphOptions,
    stubs: { ...startRuntime(framework, env), ...graphOptions.stubs },
    runtime: graphOptions.runtime ?? jsxToText,
  })
}

/**
 * Evaluates a compiled module like a bundler would: TypeScript is erased, JSX
 * becomes calls of `runtime` (which defines `__jsx` and `__Fragment`), and
 * every import is linked, as a real ES module, to the Start runtime
 * of `framework` (default `react`) for `env` (default `client`), to `stubs`
 * (by specifier; `.json` string stubs are JSON modules) or to the project
 * modules `files` (by absolute id, linked as they are). Every call evaluates
 * a fresh instance, even for identical code.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  options: {
    runtime?: string
    framework?: Framework
    env?: RuntimeEnv
    files?: Record<string, string>
  } = {},
): Promise<Record<string, any>> {
  return createTestModuleGraph({
    modules: { ...options.files, [moduleId]: code },
    stubs,
    runtime: options.runtime ?? jsxToText,
    framework: options.framework,
    env: options.env,
  }).import(moduleId)
}

function isServerOutputs(value: object): value is ServerOutputs {
  return (
    typeof (value as Partial<ServerOutputs>).provider === 'string' &&
    'ssr' in value
  )
}

/**
 * Links the modules of the SSR bundle (`ServerOutputs`) into one graph, like
 * the bundler does: a provider that imports the SSR caller (e.g. its shared
 * state or helpers) gets the instance the SSR caller module is. A module is
 * evaluated only when it is imported. Imports of other modules link to
 * `stubs` (by specifier) over the Start runtime.
 */
export function createServerGraph(
  server: ServerOutputs,
  stubs: Record<string, ModuleStub> = {},
) {
  const id = server.id ?? moduleId
  const providerId = `${id}?tss-serverfn-split`
  const modules: Record<string, string> = {
    ...server.files,
    [providerId]: server.provider,
  }
  if (server.ssr !== undefined) {
    modules[id] = server.ssr
  }
  // Like the server-fn resolver: the handler a reported id names, in the
  // module of this bundle the report names.
  const resolve = async (functionId: string) => {
    const fn = server.serverFns?.[functionId]
    if (!fn) {
      throw new Error(`Server function info not found for ${functionId}`)
    }
    return (await graph.import(fn.extractedFilename))[fn.functionName]
  }
  const graph = createTestModuleGraph({
    modules,
    stubs: {
      [`@tanstack/${server.framework ?? 'react'}-start/ssr-rpc`]: {
        // Start's createSsrRpc, whose call resolves the handler like the
        // server-fn resolver of the app's build does.
        createSsrRpc: (functionId: string) =>
          Object.assign(
            async (...args: Array<unknown>) =>
              (await resolve(functionId))(...args),
            createSsrRpc(functionId),
          ),
      },
      ...stubs,
    },
    framework: server.framework,
    env: 'server',
  })
  return {
    /** Evaluates (once) and returns the provider module. */
    provider: () => graph.import(providerId),
    /** Evaluates (once) and returns the SSR caller module. */
    ssr: () => graph.import(id),
    /** Evaluates (once) and returns the module of the graph with this id. */
    import: (graphModuleId: string) => graph.import(graphModuleId),
    /** Adds a module to the graph (e.g. a server fn resolver). */
    add: (graphModuleId: string, code: string) =>
      graph.add(graphModuleId, code),
    /** Ids of the modules evaluated so far, in order. */
    evaluated: graph.evaluated,
  }
}

/** Evaluates the provider of `server` in its SSR bundle (`createServerGraph`). */
export function evaluateProvider(
  server: ServerOutputs,
  stubs: Record<string, ModuleStub> = {},
) {
  return createServerGraph(server, stubs).provider()
}

/** A server fn handler a provider module exports. */
type ProviderHandler = ((opts: {
  data?: unknown
  context?: unknown
  method?: string
}) => unknown) & {
  serverFnMeta?: { id?: string; name?: string }
}

/**
 * The result of a server fn call, from the response its provider handler
 * gives the server-fn router: `{ result }` (and the `context` server
 * middleware sends back), or `{ error }` for a failed call, which throws.
 */
export function serverFnResult(response: unknown) {
  expect(response, 'server fn response').toBeTypeOf('object')
  expect(response, 'server fn response').not.toBeNull()
  if ('error' in (response as object)) {
    throw (response as { error: unknown }).error
  }
  expect(response, 'server fn response').toHaveProperty('result')
  return (response as { result: unknown }).result
}

/**
 * Runs a provider's extracted handler the way the server-fn router does. The
 * provider is evaluated in its SSR bundle, linked to the SSR caller
 * (`createServerGraph`), or given already evaluated (`evaluateProvider`, to
 * call it several times on one instance). The handler is found through the
 * metadata the provider gives it at runtime (`serverFnMeta.name`, the name
 * of the server fn), not through its export name. Returns the result of the
 * call (`serverFnResult`).
 */
export async function callProvider(
  server: ServerOutputs | Record<string, any>,
  name: string,
  stubs: Record<string, ModuleStub> = {},
  data?: unknown,
) {
  const module = isServerOutputs(server)
    ? await evaluateProvider(server, stubs)
    : server
  const handlers = new Set(
    Object.values(module).filter(
      (value): value is ProviderHandler =>
        typeof value === 'function' &&
        (value as ProviderHandler).serverFnMeta?.name === name,
    ),
  )
  expect(handlers.size, `provider handlers named ${name}`).toBe(1)
  return serverFnResult(await [...handlers][0]!({ data }))
}

/**
 * Calls every server fn the callers reported (`onServerFnsById`) the way the
 * server-fn router does: in the SSR bundle (`createServerGraph`), it imports
 * the reported `extractedFilename` (the provider, compiled under that id) and
 * calls the reported `functionName` export. Returns the results in the order
 * of `serverFns`.
 */
export async function callReportedServerFns(
  server: ServerOutputs,
  serverFns: Record<string, ServerFn>,
  stubs: Record<string, ModuleStub> = {},
) {
  const graph = createServerGraph(server, stubs)
  const results: Array<unknown> = []
  for (const fn of Object.values(serverFns)) {
    const module = await graph.import(fn.extractedFilename)
    const handler = module[fn.functionName]
    expect(handler, fn.functionName).toBeTypeOf('function')
    results.push(serverFnResult(await handler({ data: undefined })))
  }
  return results
}

/**
 * The message of a compile error without its code frame. A code frame quotes
 * the source lines, so matching the whole message would also match the input
 * code, whatever the error.
 */
export function compileErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return stripVTControlCharacters(message)
    .split('\n')
    .flatMap((line) => {
      // A quoted source line: `  12 | code` or `> 12 | code`.
      if (/^\s*>?\s*\d+\s*\|/.test(line)) {
        return []
      }
      // A marker line, which may end with the message: `   | ^^^ message`.
      const marker = /^\s*\|\s*\^*\s*(.*)$/.exec(line)
      return (marker ? marker[1]! : line).trim() || []
    })
    .join('\n')
}

/** Server-only module the server fns of the misplacement tests read. */
export const serverOnlyModule = './db.server'

/**
 * A clear compile error rejecting a createServerFn that is not assigned to a
 * top-level variable, matched against the message without its code frame
 * (`compileErrorMessage`).
 */
export const misplacedServerFnRejection =
  /createServerFn\b[^]*\b(top[- ]level|module[- ]?(scope|level)|nested|assigned to a (top[- ]level )?variable)/i

/** What compiling a module for one output gave: its code, or an error. */
export type OutputResult =
  | { code: string | null; serverFns: Record<string, ServerFn> }
  | { error: unknown }

/**
 * Each output, on its own, either rejects the code with a clear
 * createServerFn error (not the internal statement-list crash), or is a
 * valid module: the client is free of the misplaced handler (it neither
 * imports the server-only module, `serverOnlyModule`, nor contains the
 * handler body, `db.inner()`), the SSR caller may keep the handler in place
 * or call it through the provider, and the provider exports and runs every
 * server fn the callers that compiled report, the misplaced one included.
 * One output rejecting the code does not excuse another.
 */
export async function expectOutputsFreeOfHandler(
  code: string,
  results: Record<Output, OutputResult>,
) {
  const compiled: Partial<Record<Output, string>> = {}
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = results[output]
    if ('error' in result) {
      const message = compileErrorMessage(result.error)
      expect(message, output).toMatch(misplacedServerFnRejection)
      expect(message, output).not.toMatch(
        /Expected createServerFn declaration in a statement list/,
      )
      continue
    }
    compiled[output] = result.code ?? code
    if (output !== 'provider') {
      serverFns = { ...serverFns, ...result.serverFns }
    }
  }
  if (compiled.client !== undefined) {
    expect(importSources(compiled.client), 'client').not.toContain(
      serverOnlyModule,
    )
    expect(compiled.client, 'client').not.toContain('db.inner()')
  }
  const errors: Partial<Record<Output, Array<string>>> = {}
  for (const [output, module] of Object.entries(compiled)) {
    errors[output as Output] = await getModuleErrors(module)
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(compiled).map((output) => [output, []])),
  )
  if (
    compiled.provider !== undefined &&
    (compiled.client !== undefined || compiled.ssr !== undefined)
  ) {
    const called = await callReportedServerFns(
      { ssr: compiled.ssr, provider: compiled.provider },
      serverFns,
      {
        [serverOnlyModule]: { db: { inner: () => 'inner', top: () => 'top' } },
      },
    )
    expect(called).toContain('inner')
  }
}

/**
 * Compiles every output of `code`, each on its own (an output may reject the
 * code), and checks `expectOutputsFreeOfHandler`.
 */
export async function expectNoClientHandler(code: string) {
  const results = {} as Record<Output, OutputResult>
  for (const output of outputs) {
    results[output] = await compileFor(output, code).catch(
      (error: unknown) => ({ error }),
    )
  }
  await expectOutputsFreeOfHandler(code, results)
}

/**
 * Calls a server fn the way the app does, from where `read` finds it in the
 * evaluated callers (e.g. `(module) => module.api.read`): the client gives an
 * RPC by an id the callers reported, and the handler the report names (the
 * provider module and export, in the SSR bundle) carries that id in its
 * metadata; in an SSR bundle of its own, calling the server fn from the SSR
 * caller returns what the handler returns, whether the SSR caller calls it
 * by id or runs it in place (`.handler(extractedFn, serverFn)`, like the
 * provider). Project modules (`compiled.files`) are linked
 * as they are. Returns what the handler returns.
 */
export async function callServerFnThroughCallers(
  compiled: Awaited<ReturnType<typeof compileAll>>,
  read: (module: Record<string, any>) => unknown,
  stubs: Record<string, ModuleStub> = {},
) {
  const id = compiled.id ?? moduleId
  const client = read(
    await createTestModuleGraph({
      modules: { ...compiled.files, [id]: compiled.client },
      stubs,
      framework: compiled.framework,
    }).import(id),
  )
  const functionId = callerRpcId(client)!
  expect(functionId, 'client RPC id').toEqual(expect.any(String))
  const reported = compiled.serverFns[functionId]
  expect(reported, 'reported server fn').toBeDefined()
  const handler = (
    await createServerGraph(compiled, stubs).import(reported!.extractedFilename)
  )[reported!.functionName] as ProviderHandler
  expect(handler?.serverFnMeta?.id, 'provider handler id').toBe(functionId)
  const result = serverFnResult(await handler({ data: undefined }))
  const ssr = read(await createServerGraph(compiled, stubs).ssr())
  expect(ssr, 'ssr').toBeTypeOf('function')
  expect(await (ssr as ProviderHandler)({ data: undefined }), 'ssr').toEqual(
    result,
  )
  return result
}

/**
 * Calls a server fn from the client, through Start's real client runtime:
 * the server fn `read` finds in the evaluated client caller runs its
 * client middleware, then its RPC reaches the handler the callers reported
 * for that id, in the SSR bundle (`createServerGraph`), with the data,
 * context and method the client sends, like Start's server-fn handler does
 * (without the HTTP round trip and its serialization). Returns what the
 * call returns.
 */
export async function callFromClient(
  compiled: Awaited<ReturnType<typeof compileAll>>,
  read: (module: Record<string, any>) => unknown,
  data?: unknown,
  stubs: Record<string, ModuleStub> = {},
) {
  const id = compiled.id ?? moduleId
  const server = createServerGraph(compiled, stubs)
  const clientRpc = (functionId: string) =>
    Object.assign(
      async (payload: {
        data?: unknown
        context?: unknown
        method?: string
      }) => {
        const reported = compiled.serverFns[functionId]
        if (!reported) {
          throw new Error(`no server fn reported for ${functionId}`)
        }
        const handler = (await server.import(reported.extractedFilename))[
          reported.functionName
        ] as ProviderHandler
        return handler({
          data: payload.data,
          context: payload.context,
          method: payload.method,
        })
      },
      createClientRpc(functionId),
    )
  const client = read(
    await createTestModuleGraph({
      modules: { ...compiled.files, [id]: compiled.client },
      stubs: {
        [`@tanstack/${compiled.framework ?? 'react'}-start/client-rpc`]: {
          createClientRpc: clientRpc,
        },
        ...stubs,
      },
      framework: compiled.framework,
    }).import(id),
  )
  expect(callerRpcId(client), 'client RPC id').toEqual(expect.any(String))
  return (client as (opts: { data?: unknown }) => Promise<unknown>)({ data })
}

/** The directives of a module's directive prologue, in order. */
export function directivePrologue(code: string) {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const directives: Array<string> = []
  for (const statement of program.body) {
    if (
      statement.type !== 'ExpressionStatement' ||
      !('directive' in statement) ||
      typeof statement.directive !== 'string'
    ) {
      break
    }
    directives.push(statement.directive)
  }
  return directives
}

/** The value of `run`, or the message of the error it throws. */
export function settle(run: () => unknown) {
  try {
    return run()
  } catch (error) {
    return `throws: ${(error as Error).message}`
  }
}

/**
 * The value `run` resolves to, or the message of the error it throws or
 * rejects with.
 */
export async function settleAsync(run: () => unknown) {
  try {
    return await run()
  } catch (error) {
    return `throws: ${(error as Error).message}`
  }
}

export const serverOnlyError =
  'throws: createServerOnlyFn() functions can only be called on the server!'
export const clientOnlyError =
  'throws: createClientOnlyFn() functions can only be called on the client!'

type HydratePlugin = ReturnType<typeof createHydrateCompilerPlugin>

/** Ids of the virtual modules the Hydrate plugin serves (its host contract). */
const hydrateVirtualModuleIds =
  createHydrateCompilerPlugin().virtualModuleIdPattern!

/**
 * The `<Hydrate>` chunk ids a compiled module imports, in source order: the
 * modules it imports dynamically that the Hydrate plugin serves.
 */
export function getChunkIds(code: string) {
  return moduleRequests(code).dynamic.filter((id) => {
    hydrateVirtualModuleIds.lastIndex = 0
    return hydrateVirtualModuleIds.test(id)
  })
}

/** The name of a JSX element, as written (`Hydrate`, `Start.Hydrate`). */
function jsxElementName(name: unknown): string | undefined {
  if (!isNode(name)) {
    return undefined
  }
  if (name.type === 'JSXIdentifier') {
    return name.name as string
  }
  if (name.type === 'JSXMemberExpression') {
    const object = jsxElementName(name.object)
    return object === undefined
      ? undefined
      : `${object}.${(name.property as Node).name as string}`
  }
  return undefined
}

/**
 * The JSX element names that refer to the `Hydrate` component of a
 * `@tanstack/*-start` package in a module: its named imports and the
 * `Hydrate` member of its namespace imports.
 */
function hydrateElementNames(program: unknown) {
  const names = new Set<string>()
  walk(program, (node) => {
    if (
      node.type !== 'ImportDeclaration' ||
      !/^@tanstack\/[\w-]+-start$/.test(staticSpecifier(node.source) ?? '')
    ) {
      return
    }
    for (const specifier of node.specifiers as Array<Node>) {
      const local = (specifier.local as Node).name as string
      if (specifier.type === 'ImportNamespaceSpecifier') {
        names.add(`${local}.Hydrate`)
      } else if (
        specifier.type === 'ImportSpecifier' &&
        ((specifier.imported as Node).name ??
          (specifier.imported as Node).value) === 'Hydrate'
      ) {
        names.add(local)
      }
    }
  })
  return names
}

/** The `<Hydrate>` elements of a module, in source order. */
function hydrateElements(code: string) {
  const program = parseModule(code)
  const names = hydrateElementNames(program)
  const elements: Array<Node> = []
  walk(program, (node) => {
    if (
      node.type === 'JSXElement' &&
      names.has(jsxElementName((node.openingElement as Node).name) ?? '')
    ) {
      elements.push(node)
    }
  })
  return elements
}

/** Loads a `<Hydrate>` chunk the way the bundler loads the virtual module. */
export function loadChunk(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
) {
  return loadChunkResult(plugin, env, id)?.code ?? null
}

function loadChunkResult(
  plugin: HydratePlugin,
  env: 'client' | 'server',
  id: string,
): StartCompilerTransformResult | null {
  return (
    plugin.loadVirtualModule?.({
      id,
      root: '/test',
      env,
      envName: env === 'client' ? 'client' : 'ssr',
    }) ?? null
  )
}

const base64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The original (0-based) line and column of each source map segment. */
function originalPositions(mappings: string) {
  const positions: Array<[line: number, column: number]> = []
  let line = 0
  let column = 0
  for (const segment of mappings.split(/[;,]/)) {
    const values: Array<number> = []
    let value = 0
    let shift = 0
    for (const char of segment) {
      const digit = base64.indexOf(char)
      value += (digit & 31) << shift
      if (digit & 32) {
        shift += 5
      } else {
        values.push(value & 1 ? -(value >>> 1) : value >>> 1)
        value = 0
        shift = 0
      }
    }
    if (values.length >= 4) {
      line += values[2]!
      column += values[3]!
      positions.push([line, column])
    }
  }
  return positions
}

/**
 * Where in `source` the children a chunk renders come from: the start of the
 * outermost `<Hydrate>` element of `source` that contains the code the
 * chunk maps back to (through its source map), or `Infinity`.
 */
function chunkBoundaryStart(
  chunk: StartCompilerTransformResult,
  source: string,
  boundaries: Array<{ start: number; end: number }>,
) {
  const mappings = chunk.map?.mappings
  if (typeof mappings !== 'string') {
    return Infinity
  }
  const lineStarts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      lineStarts.push(index + 1)
    }
  }
  let start = Infinity
  for (const [line, column] of originalPositions(mappings)) {
    const offset = (lineStarts[line] ?? Infinity) + column
    const boundary = boundaries.find(
      (range) => range.start <= offset && offset < range.end,
    )
    if (boundary) {
      start = Math.min(start, boundary.start)
    }
  }
  return start
}

/**
 * Compiles a module with `<Hydrate>` and loads the split chunks it imports
 * (`chunks`, as the plugin serves them, before the bundler compiles them; ids
 * in `chunkIds`), ordered like their boundaries in the source module (found
 * through each chunk's source map). A module the compiler leaves untouched is
 * its own parent, without chunks.
 */
export async function compileHydrate(
  env: 'client' | 'server',
  code: string,
  options: { id?: string; framework?: Framework } = {},
) {
  const plugin = createHydrateCompilerPlugin()
  const { compile } = createStartCompiler({
    env,
    compilerPlugins: [plugin],
    framework: options.framework,
  })
  const parent = (await compile(code, options.id)) ?? code
  const loaded = getChunkIds(parent).map((id) => {
    const chunk = loadChunkResult(plugin, env, id)
    if (chunk === null) {
      throw new Error(`expected virtual module ${id} to load`)
    }
    return { id, chunk }
  })
  // Only the outermost boundaries: a chunk maps to the boundary whose children
  // it renders, not to a boundary nested in them.
  const boundaries = hydrateElements(code)
    .map((element) => ({
      start: element.start as number,
      end: element.end as number,
    }))
    .filter(
      (range, _, ranges) =>
        !ranges.some(
          (other) =>
            other !== range &&
            other.start <= range.start &&
            range.end <= other.end,
        ),
    )
  const ordered = loaded
    .map(({ id, chunk }) => ({
      id,
      chunk,
      start: chunkBoundaryStart(chunk, code, boundaries),
    }))
    .sort((a, b) => a.start - b.start)
  return {
    parent,
    chunks: ordered.map(({ chunk }) => chunk.code),
    chunkIds: ordered.map(({ id }) => id),
    plugin,
  }
}

/**
 * Loads the first chunk a parent module imports and compiles it for the
 * client under its virtual module id, like the bundler does.
 */
export async function compileFirstChunk(plugin: HydratePlugin, parent: string) {
  const id = getChunkIds(parent)[0]!
  const { compile, serverFns } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const code = await compile(loadChunk(plugin, 'client', id)!, id)
  return { code, serverFns }
}

/**
 * The export of the chunk `chunkId` that the client `parent` renders: the
 * name it gives `lazyRouteComponent(load, name)` (default `default`) with the
 * `load` that imports the chunk. The parent is evaluated (its imports linked
 * to `stubs` over the parent-module stubs, others to no-op functions) and
 * creates its lazy components then (a lazy component created in render would
 * remount on every render).
 */
export async function chunkExportName(
  parent: string,
  chunkId: string,
  options: { framework?: Framework; stubs?: Record<string, ModuleStub> } = {},
) {
  const framework = options.framework ?? 'react'
  const routerPackage = `@tanstack/${framework}-router`
  const lazy: Array<{
    load: () => Promise<{ chunkId?: string }>
    name: string
  }> = []
  const chunkIds = new Set(getChunkIds(parent))
  const parentId = chunkId.split('?')[0]!
  const graph = createTestModuleGraph({
    modules: { [parentId]: parent },
    stubs: {
      ...hydrateStubs(framework),
      ...options.stubs,
      [routerPackage]: {
        ...(options.stubs?.[routerPackage] as Record<string, unknown>),
        lazyRouteComponent: (
          load: () => Promise<{ chunkId?: string }>,
          name = 'default',
        ) => {
          lazy.push({ load, name })
          return () => null
        },
      },
    },
    fallbackStub: (_, names) =>
      Object.fromEntries([...names].map((name) => [name, () => undefined])),
    framework,
    // Each chunk is a module naming its id.
    load: (id) =>
      chunkIds.has(id) ? `export const chunkId = ${JSON.stringify(id)}` : null,
  })
  await graph.import(parentId)
  const names = new Set<string>()
  for (const { load, name } of lazy) {
    if ((await load()).chunkId === chunkId) {
      names.add(name)
    }
  }
  if (names.size !== 1) {
    throw new Error(
      `expected the parent to render one export of ${chunkId}, got ${[...names].join(', ') || 'none'}`,
    )
  }
  return [...names][0]!
}

/**
 * Renders, with the given props, the `<Hydrate>` chunk `chunk` (the code of
 * the chunk `chunkId`, evaluated with `stubs`): the export of it that the
 * client `parent` renders (`chunkExportName`).
 */
export async function renderChunk(
  parent: string,
  chunkId: string,
  chunk: string,
  props: Record<string, unknown> = {},
  stubs: Record<string, ModuleStub> = {},
) {
  const name = await chunkExportName(parent, chunkId)
  const component = (await evaluateModule(chunk, stubs))[name]
  if (typeof component !== 'function') {
    throw new Error(`expected the chunk to export a component as ${name}`)
  }
  return component(props)
}

/**
 * Parent-module stubs of a framework (default `react`): `<Hydrate>` marks
 * where its children render, lazy chunks render their props.
 */
export function hydrateStubs(
  framework: Framework = 'react',
): Record<string, Record<string, unknown>> {
  return {
    [`@tanstack/${framework}-start`]: {
      Hydrate: (props: { children: unknown }) => `[${props.children ?? ''}]`,
    },
    [`@tanstack/${framework}-start/hydration`]: {
      idle: () => 'idle',
      visible: () => 'visible',
      interaction: () => 'interaction',
      load: () => 'load',
      media: () => 'media',
      never: () => 'never',
    },
    [`@tanstack/${framework}-router`]: {
      lazyRouteComponent: () => (props: Record<string, unknown>) =>
        `lazy(${Object.keys(props)
          .filter((name) => name !== 'children')
          .sort()
          .map((name) => `${name}=${String(props[name])}`)
          .join(',')})`,
    },
  }
}

/** The React parent-module stubs (`hydrateStubs('react')`). */
export const hydrateParentStubs = hydrateStubs('react')

/**
 * Compiles `code` for the client (React unless `framework` says otherwise)
 * and evaluates it once its `<Hydrate>` chunks have loaded, like the browser
 * does: the parent and the chunks are one linked module graph (each chunk
 * compiled like the bundler compiles the virtual module),
 * `lazyRouteComponent(load, exportName)` loads its chunk through `load()` and
 * renders the export it names, and its `preload()` loads the chunk too.
 * `beforeChunksLoad` runs app code between the parent's evaluation and the
 * chunks'. Returns the evaluated parent, the ids of the chunks it imports
 * (`chunkIds`, in source order), `lazyChunks` (every lazy chunk component and
 * whether it rendered) and `preloaded` (the chunk each `preload()` call
 * loaded, by id, evaluated, and the component of it the lazy component
 * renders, in call order; loading the chunks here is not a preload). The parent and every chunk must be valid modules; they may
 * read the globals the source reads. With `chunksFromSource`, the chunks
 * load the way Rsbuild loads them: given the source file's code, from a
 * Hydrate plugin that did not compile the parent (e.g. another build
 * worker).
 */
export async function loadClientModule(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    beforeChunksLoad?: (module: Record<string, any>) => void
    runtime?: string
    /** Id the module is compiled under. */
    id?: string
    /** Default `react`. */
    framework?: Framework
    chunksFromSource?: boolean
  } = {},
) {
  const id = options.id ?? moduleId
  const framework = options.framework ?? 'react'
  const { parent, chunks, plugin } = await compileHydrate('client', code, {
    id,
    framework,
  })
  const lazyChunks: Array<{ name: string; rendered: boolean }> = []
  const loaders: Array<{
    name: string
    load: () => Promise<Record<string, any>>
    component?: (props: unknown) => unknown
  }> = []
  const preloaded: Array<{
    id: string
    module: Record<string, any>
    component: (props: Record<string, unknown>) => any
  }> = []
  const loadedChunkIds: Array<string> = []
  /** Id of the chunk an evaluated chunk namespace is. */
  const chunkIdOf = async (namespace: unknown) => {
    for (const chunkId of loadedChunkIds) {
      if ((await graph.import(chunkId)) === namespace) {
        return chunkId
      }
    }
    throw new Error('preload() loaded a module that is not a chunk')
  }
  const routerPackage = `@tanstack/${framework}-router`
  const userStubs = options.stubs ?? {}
  const stubs: Record<string, ModuleStub> = {
    ...hydrateStubs(framework),
    ...userStubs,
    [routerPackage]: {
      ...(userStubs[routerPackage] as Record<string, unknown>),
      lazyRouteComponent: (
        load: () => Promise<Record<string, any>>,
        name = 'default',
      ) => {
        const lazyChunk = { name, rendered: false }
        const loader: (typeof loaders)[number] = { name, load }
        lazyChunks.push(lazyChunk)
        loaders.push(loader)
        return Object.assign(
          (props: unknown) => {
            lazyChunk.rendered = true
            if (!loader.component) {
              throw new Error(`lazy chunk ${name} rendered before it loaded`)
            }
            return loader.component(props)
          },
          {
            preload: async () => {
              const namespace = await load()
              preloaded.push({
                id: await chunkIdOf(namespace),
                module: namespace,
                component: namespace[name],
              })
              return namespace
            },
          },
        )
      },
    },
  }
  // The globals the source reads may be read by its modules too.
  const globals = await freeIdentifiers(code)
  expect(await getModuleErrors(parent, undefined, { globals })).toEqual([])
  const chunkPlugin = options.chunksFromSource
    ? createHydrateCompilerPlugin()
    : plugin
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [chunkPlugin],
    framework,
  })
  const graph = createTestModuleGraph({
    modules: { [id]: parent },
    stubs,
    runtime: options.runtime,
    framework,
    // The bundler compiles each virtual module it loads like any other module.
    load: async (chunkId) => {
      // The linker also probes ids with extensions appended, which are no
      // modules of this graph.
      if (chunkId.split('?')[0] !== id.split('?')[0]) {
        return null
      }
      const chunk = options.chunksFromSource
        ? (chunkPlugin.loadVirtualModule?.({
            id: chunkId,
            code,
            root: '/test',
            env: 'client',
            envName: 'client',
          })?.code ?? null)
        : loadChunk(plugin, 'client', chunkId)
      if (chunk === null) {
        return null
      }
      loadedChunkIds.push(chunkId)
      return (await compile(chunk, chunkId)) ?? chunk
    },
  })
  const module = await graph.import(id)
  options.beforeChunksLoad?.(module)
  for (const chunk of chunks) {
    expect(await getModuleErrors(chunk, undefined, { globals })).toEqual([])
  }
  // Loading a chunk may create the lazy components of nested boundaries,
  // which the iteration reaches as they are appended.
  for (const loader of loaders) {
    loader.component = (await loader.load())[loader.name]
  }
  return { module, chunkIds: getChunkIds(parent), lazyChunks, preloaded }
}

/**
 * The children were split and rendered through their chunks: the client
 * created at least one lazy chunk component (`loadClientModule`), and every
 * one rendered.
 */
export function expectRenderedThroughChunks(
  lazyChunks: Array<{ rendered: boolean }>,
) {
  expect(lazyChunks.length).toBeGreaterThan(0)
  expect(lazyChunks.filter((chunk) => !chunk.rendered)).toEqual([])
}

/**
 * Renders `code` compiled for `env` and records the boundary id (`h`) each
 * `<Hydrate>` renders with: on the server the id in its markup, on the client
 * the id it hydrates with (chunks loaded, `loadClientModule`). `stubs` are
 * linked over the parent-module stubs (`hydrateStubs`); the recording
 * `Hydrate` is added to the `@tanstack/<framework>-start` stub.
 */
export async function renderBoundaries(
  env: 'client' | 'server',
  code: string,
  render: (module: Record<string, any>) => unknown,
  options: {
    id?: string
    framework?: Framework
    stubs?: Record<string, ModuleStub>
    runtime?: string
  } = {},
) {
  const { stubs: userStubs = {}, runtime, ...compileOptions } = options
  const framework = options.framework ?? 'react'
  const ids: Array<unknown> = []
  const Hydrate = (props: { children?: unknown; h?: unknown }) => {
    ids.push(props.h)
    return `[${props.children ?? ''}]`
  }
  const startPackage = `@tanstack/${framework}-start`
  const stubs = {
    ...hydrateStubs(framework),
    ...userStubs,
    [startPackage]: {
      ...(userStubs[startPackage] as Record<string, unknown> | undefined),
      Hydrate,
    },
  }
  const module =
    env === 'server'
      ? await evaluateModule(
          (await compileHydrate('server', code, compileOptions)).parent,
          stubs,
          { framework, runtime },
        )
      : (await loadClientModule(code, { ...compileOptions, stubs, runtime }))
          .module
  const html = render(module)
  return { html, ids }
}
