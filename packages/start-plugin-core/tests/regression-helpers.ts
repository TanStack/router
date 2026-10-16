/**
 * Shared harness of the Start compiler behaviour suites: compile a module
 * into its client, SSR caller and server-function provider outputs, split
 * `<Hydrate>` children into chunks, and evaluate compiled modules (linked as
 * real ES modules, `@tanstack/compiler-test-utils/module-linker`) against a
 * minimal Start runtime.
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
  options: Omit<StartCompilerOptions, 'env'> = {},
) {
  const compiled = {} as Record<Output, string>
  const errors = {} as Record<Output, Array<string>>
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = await compileFor(output, code, options)
    expect(result.code, output).not.toBeNull()
    compiled[output] = result.code!
    errors[output] = await getModuleErrors(result.code!)
    if (output === 'client') {
      serverFns = result.serverFns
    }
  }
  expect(errors).toEqual({ client: [], ssr: [], provider: [] })
  return { ...compiled, serverFns, framework: options.framework }
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
  }
}

/**
 * An external import transform (`compilerTransforms`), shaped like the RSC
 * CSS transform: on the server, it injects `{ injected: loadThing() }` as
 * the second argument of each direct call of `renderThing` from
 * `@example/runtime` given one argument.
 */
export const renderThingTransform: StartCompilerImportTransform = {
  name: 'test-render-option-injection',
  environment: 'server',
  imports: [{ libName: '@example/runtime', rootExport: 'renderThing' }],
  detect: /\brenderThing\b/,
  transform: (candidates, context) => {
    const t = context.types
    for (const candidate of candidates) {
      const args = candidate.path.node.arguments
      if (args.length !== 1) {
        continue
      }
      args.push(
        t.objectExpression([
          t.objectProperty(
            t.identifier('injected'),
            context.parseExpression('loadThing()'),
          ),
        ]),
      )
    }
  },
}

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

/**
 * Minimal Start package of a framework: callers keep the RPC they were given,
 * providers run the original handler. Builders record what they are given
 * in `options` (non-enumerable on a server fn): `createServerFn(options)`,
 * `.middleware([...])` (appended) and `.validator(v)`; a builder is also
 * callable, returning a builder with the same options (a factory such as
 * `createAuthServerFn = createServerFn().middleware([auth])` is called as
 * `createAuthServerFn()`). `createMiddleware(options)` (also
 * `createStart(...).createMiddleware`) records `.client(fn)`,
 * `.validator(v)` and `.middleware([...])`; in the client runtime its
 * `.server()`, like the other factories, throws when it is called
 * uncompiled, so a client test only passes if the compiler removed it. In
 * the server runtime, `.server(fn)` is recorded too.
 */
function startRuntime(
  framework: Framework,
  env: RuntimeEnv = 'client',
): Record<string, string> {
  const start = `@tanstack/${framework}-start`
  return {
    [start]: `
const uncompiled = () => { throw new Error('uncompiled Start factory') }
const record = (target, options) =>
  Object.defineProperty(target, 'options', { value: options, enumerable: false })
const serverFnBuilder = (options) => {
  const builder = record(() => serverFnBuilder(options), options)
  builder.middleware = (middleware) =>
    serverFnBuilder({ ...options, middleware: [...(options.middleware ?? []), ...middleware] })
  builder.validator = (validator) => serverFnBuilder({ ...options, validator })
  builder.handler = (rpc, impl) =>
    impl
      ? record(
          Object.assign((opts) => impl(opts ?? {}), {
            __executeServer: (opts) => impl(opts),
          }),
          options,
        )
      : record({ rpc }, options)
  return builder
}
const middlewareBuilder = (options) => ({
  options,
  middleware: (middleware) =>
    middlewareBuilder({ ...options, middleware: [...(options.middleware ?? []), ...middleware] }),
  validator: (validator) => middlewareBuilder({ ...options, validator }),
  client: (client) => middlewareBuilder({ ...options, client }),
  server: ${env === 'server' ? '(server) => middlewareBuilder({ ...options, server })' : 'uncompiled'},
})
export const createServerFn = (options) => serverFnBuilder({ ...options })
export const createServerOnlyFn = uncompiled
export const createClientOnlyFn = uncompiled
export const createIsomorphicFn = uncompiled
export const createMiddleware = (options) => middlewareBuilder({ ...options })
export const createStart = (options) => ({
  options,
  createMiddleware: (middlewareOptions) =>
    middlewareBuilder({ ...middlewareOptions }),
})`,
    [`${start}/server-rpc`]: `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
    [`${start}/client-rpc`]: `export const createClientRpc = (id) => ({ client: id })`,
    [`${start}/ssr-rpc`]: `export const createSsrRpc = (id) => ({ ssr: id })`,
  }
}

/**
 * JSX runtime of evaluated modules: intrinsic elements render as tags,
 * components are called with their props.
 */
const jsxToText = `const __Fragment = Symbol('Fragment')
const __jsx = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true).join('')
  if (type === __Fragment) return text
  if (typeof type === 'function') return type(children.length ? { ...props, children: text } : { ...props })
  if (typeof type !== 'string') throw new Error('cannot render ' + String(type))
  return '<' + type + '>' + text + '</' + type + '>'
}
`

/**
 * A graph of linked modules (`createModuleGraph`) whose imports resolve to
 * `stubs` (by specifier) over the minimal Start runtime of `framework`
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
 * every import is linked, as a real ES module, to the minimal Start runtime
 * of `framework` (default `react`) for `env` (default `client`) or to
 * `stubs` (by specifier; `.json` string stubs are JSON modules). Every call
 * evaluates a fresh instance, even for identical code.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  options: { runtime?: string; framework?: Framework; env?: RuntimeEnv } = {},
): Promise<Record<string, any>> {
  return createTestModuleGraph({
    modules: { [moduleId]: code },
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
 * `stubs` (by specifier) over the minimal Start runtime.
 */
export function createServerGraph(
  server: ServerOutputs,
  stubs: Record<string, ModuleStub> = {},
) {
  const id = server.id ?? moduleId
  const providerId = `${id}?tss-serverfn-split`
  const modules: Record<string, string> = { [providerId]: server.provider }
  if (server.ssr !== undefined) {
    modules[id] = server.ssr
  }
  const graph = createTestModuleGraph({
    modules,
    stubs,
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
type ProviderHandler = ((opts: { data?: unknown }) => unknown) & {
  meta?: { id?: string; name?: string }
}

/**
 * Runs a provider's extracted handler the way the server-fn router does. The
 * provider is evaluated in its SSR bundle, linked to the SSR caller
 * (`createServerGraph`), or given already evaluated (`evaluateProvider`, to
 * call it several times on one instance). The handler is found through the
 * metadata the provider gives it at runtime (`meta.name`, the name of the
 * server fn), not through its export name.
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
        (value as ProviderHandler).meta?.name === name,
    ),
  )
  expect(handlers.size, `provider handlers named ${name}`).toBe(1)
  return [...handlers][0]!({ data })
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
    results.push(await handler({ data: undefined }))
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
 * valid module free of the misplaced handler: the client neither imports the
 * server-only module (`serverOnlyModule`) nor contains the handler body
 * (`db.inner()`), the SSR
 * caller calls the handler through the provider like for a top-level server
 * fn (no handler body; it may import the server-only module for other server
 * code), and the provider exports and runs every server fn the callers that
 * compiled report, the misplaced one included. One output rejecting the code
 * does not excuse another.
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
  }
  for (const output of ['client', 'ssr'] as const) {
    if (compiled[output] !== undefined) {
      expect(compiled[output], output).not.toContain('db.inner()')
    }
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
 * evaluated callers (e.g. `(module) => module.api.read`): the client and the
 * SSR caller each give an RPC with the same id, the callers reported that id,
 * and the handler the report names (the provider module and export, in the
 * SSR bundle) carries that id in its metadata. Returns what the handler
 * returns.
 */
export async function callServerFnThroughCallers(
  compiled: Awaited<ReturnType<typeof compileAll>>,
  read: (module: Record<string, any>) => unknown,
  stubs: Record<string, ModuleStub> = {},
) {
  const client = read(
    await evaluateModule(compiled.client, stubs, {
      framework: compiled.framework,
    }),
  ) as { rpc: { client: string } }
  expect(client, 'client').toEqual({ rpc: { client: expect.any(String) } })
  const id = client.rpc.client
  const graph = createServerGraph(compiled, stubs)
  expect(read(await graph.ssr()), 'ssr').toEqual({ rpc: { ssr: id } })
  const reported = compiled.serverFns[id]
  expect(reported, 'reported server fn').toBeDefined()
  const handler = (await graph.import(reported!.extractedFilename))[
    reported!.functionName
  ] as ProviderHandler
  expect(handler?.meta?.id, 'provider handler id').toBe(id)
  return handler({ data: undefined })
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

/**
 * The static boundary ids (`h` props, the id `<Hydrate>` hydrates with) of
 * the `<Hydrate>` elements a compiled module declares, in source order.
 * Prefer `renderBoundaries`, which records the ids actually rendered.
 */
export function getBoundaryIds(code: string) {
  const ids: Array<string> = []
  for (const element of hydrateElements(code)) {
    for (const attribute of (element.openingElement as Node)
      .attributes as Array<Node>) {
      if (
        attribute.type !== 'JSXAttribute' ||
        (attribute.name as Node).name !== 'h'
      ) {
        continue
      }
      const value = attribute.value as Node | null
      const literal =
        value?.type === 'JSXExpressionContainer'
          ? (value.expression as Node)
          : value
      if (literal?.type === 'Literal' && typeof literal.value === 'string') {
        ids.push(literal.value)
      }
    }
  }
  return ids
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
 * Compiles a module with `<Hydrate>` and loads the split chunks it imports,
 * ordered like their boundaries in the source module (found through each
 * chunk's source map). A module the compiler leaves untouched is its own
 * parent, without chunks.
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
    return chunk
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
    .map((chunk) => ({
      chunk,
      start: chunkBoundaryStart(chunk, code, boundaries),
    }))
    .sort((a, b) => a.start - b.start)
  return { parent, chunks: ordered.map(({ chunk }) => chunk.code), plugin }
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
 * The component an evaluated `<Hydrate>` chunk exports: its only exported
 * function.
 */
export function getChunkComponent(module: Record<string, any>) {
  const functions = new Set(
    Object.values(module).filter((value) => typeof value === 'function'),
  )
  if (functions.size !== 1) {
    throw new Error(
      `expected the chunk to export one component, got ${functions.size}`,
    )
  }
  return [...functions][0] as (props: Record<string, unknown>) => any
}

/**
 * The props the component of a split chunk reads when it renders, sorted:
 * the captured values it receives from its parent. Imports the chunk makes
 * resolve to `undefined` values; an error the render throws after reading
 * the props is ignored.
 */
export async function getChunkParams(chunk: string) {
  const module = await createTestModuleGraph({
    modules: { [`${moduleId}?chunk`]: chunk },
    stubs: hydrateParentStubs,
    lenient: true,
  }).import(`${moduleId}?chunk`)
  const component = getChunkComponent(module)
  const read = new Set<string>()
  const props = new Proxy(
    {},
    {
      get: (_, key) => {
        if (typeof key === 'string') {
          read.add(key)
        }
        return undefined
      },
    },
  )
  try {
    component(props)
  } catch {
    // Rendering without the real prop values may fail after reading them.
  }
  return [...read].sort()
}

/** Renders the component a `<Hydrate>` chunk exports with the given props. */
export async function renderChunk(
  chunk: string,
  props: Record<string, unknown> = {},
  stubs: Record<string, ModuleStub> = {},
) {
  return getChunkComponent(await evaluateModule(chunk, stubs))(props)
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
 * Import sources of a `<Hydrate>` module that name the parent module, with any
 * query or hash: a chunk may import the module bindings it shares with the
 * parent instead of declaring its own copy.
 */
export function parentImportSources(code: string) {
  return importSources(code).filter((source) =>
    [moduleId, './module.tsx', './module'].includes(
      source.replace(/[?#].*$/, ''),
    ),
  )
}

/**
 * Evaluates a client `<Hydrate>` parent and links its modules like a bundler:
 * the parent, the virtual modules the Hydrate plugin serves and the chunks
 * rendered with the returned `renderChunk` are one module graph, so an import
 * of the parent module is the evaluated parent (live bindings included) and
 * every module is evaluated once.
 */
export async function evaluateHydrateParent(
  plugin: HydratePlugin,
  parent: string,
  stubs: Record<string, ModuleStub> = hydrateParentStubs,
  runtime?: string,
) {
  const graph = createTestModuleGraph({
    modules: { [moduleId]: parent },
    stubs,
    runtime,
    load: (id) => loadChunk(plugin, 'client', id),
  })
  const module = await graph.import(moduleId)
  let extraChunks = 0
  return {
    module,
    /** Renders a chunk of the parent, linked to the parent's module graph. */
    renderChunk: async (chunk: string, props: Record<string, unknown> = {}) => {
      let id = graph.idOf(chunk)
      if (id === undefined) {
        id = `${moduleId}?chunk=${extraChunks++}`
        graph.add(id, chunk)
      }
      return getChunkComponent(await graph.import(id))(props)
    },
  }
}

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
 * loaded, by id and evaluated, in call order; loading the chunks here is not
 * a preload). The parent and every chunk must be valid modules; they may
 * read the globals the source reads.
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
  const preloaded: Array<{ id: string; module: Record<string, any> }> = []
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
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
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
      const chunk = loadChunk(plugin, 'client', chunkId)
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
