/**
 * Shared harness of the Start compiler behaviour suites: compile a module
 * into its client, SSR caller and server-function provider outputs, split
 * `<Hydrate>` children into chunks, and evaluate compiled modules (linked as
 * real ES modules, `@tanstack/compiler-test-utils/module-linker`) against a
 * Start's runtime (`./start-runtime`) and the real packages (React, the
 * routers). Import inspection (`imports.ts`), diagnostics
 * (`diagnostics.ts`), source maps (`source-maps.ts`) and the `<Hydrate>`
 * chunk rendering (`render.ts`) live in their own modules and are
 * re-exported here.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
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
import { moduleRequests } from './imports'
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

export { importSources } from './imports'
export {
  expectCompileError,
  expectSourceError,
  withoutQuotedSource,
  serverOnlyModule,
  expectOutputsFreeOfHandler,
  expectNoClientHandler,
  serverOnlyError,
  clientOnlyError,
} from './diagnostics'
export type { MisplacementOptions, OutputResult } from './diagnostics'
export {
  getChunkIds,
  loadChunk,
  compileHydrate,
  compileFirstChunk,
  renderGraph,
  renderSource,
  renderServer,
  loadClient,
  renderClient,
  expectRenderedThroughChunks,
  expectClientRendersLikeServer,
  expectRendersLikeSource,
  startPackage,
  withoutHydrationIds,
} from './render'
export type { Render, RenderOptions, ClientOptions } from './render'

export type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'

export type Output = 'client' | 'ssr' | 'provider'
export const outputs: Array<Output> = ['client', 'ssr', 'provider']
export const moduleId = '/test/src/module.tsx'

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
 * The id of the RPC a caller's server fn calls: the id of Start's server-fn
 * metadata (`serverFnMeta.id`; other metadata fields are free).
 * `undefined` when the server fn carries no id (e.g. an uncompiled one,
 * whose handler is left in place). Tests that need the call to reach the
 * server prove it through the reported handler (`callServerFnThroughCallers`,
 * `callFromClient`).
 */
export function callerRpcId(fn: unknown): string | undefined {
  if (typeof fn !== 'function') {
    return undefined
  }
  const meta = (fn as { serverFnMeta?: Record<string, unknown> }).serverFnMeta
  return typeof meta?.id === 'string' ? meta.id : undefined
}

/**
 * Where the real packages of the test graphs resolve from (this package's
 * dependencies: `react`, `react-dom`, the routers).
 */
const testPackagesDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * A graph of linked modules (`createModuleGraph`) whose imports resolve to
 * `stubs` (by specifier) over the Start runtime of `framework`
 * (default `react`), then to the real packages (`packages`, by default
 * this package's): JSX compiles with React's automatic runtime and renders
 * with the real React.
 */
export function createTestModuleGraph(
  options: ModuleGraphOptions & { framework?: Framework; env?: RuntimeEnv },
) {
  const { framework = 'react', env, ...graphOptions } = options
  return createModuleGraph({
    packages: testPackagesDir,
    ...graphOptions,
    stubs: { ...startRuntime(framework, env), ...graphOptions.stubs },
  })
}

/**
 * Evaluates a compiled module like a bundler would: TypeScript is erased, JSX
 * compiles with React's automatic runtime, and every import is linked, as a
 * real ES module, to the Start runtime of `framework` (default `react`) for
 * `env` (default `client`), to `stubs` (by specifier; `.json` string stubs
 * are JSON modules), to the project modules `files` (by absolute id, linked
 * as they are) or to the real packages (`react`, the routers). Every call
 * evaluates a fresh instance, even for identical code.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  options: {
    framework?: Framework
    env?: RuntimeEnv
    files?: Record<string, string>
  } = {},
): Promise<Record<string, any>> {
  return createTestModuleGraph({
    modules: { ...options.files, [moduleId]: code },
    stubs,
    framework: options.framework,
    env: options.env,
  }).import(moduleId)
}

/**
 * Renders a React node (e.g. what an evaluated module's component returns)
 * to static HTML with the real `react-dom/server`.
 */
export async function renderToHtml(node: unknown) {
  const graph = createTestModuleGraph({})
  const { renderToStaticMarkup } = await graph.importPackage('react-dom/server')
  return renderToStaticMarkup(node) as string
}

/**
 * The modules evaluating the compiled module `code` (as `env`, default
 * `client`) loads: every module it, and the project modules and stubs it
 * links, request statically when they link, plus the targets of the dynamic
 * `import()`s it names (a bundle emits a chunk for each). Imports that are
 * neither `stubs`, `files` nor real packages link to empty stubs, so a
 * forbidden module the compiler left behind is observed, not a link error.
 * Type-only syntax (`import type`, erased with the TypeScript) is no load;
 * an `import { type X }` declaration still loads its module
 * (`verbatimModuleSyntax`, see the module linker). Compare with
 * `expectNotLoaded` (`@tanstack/compiler-test-utils/importers`).
 */
export async function moduleLoads(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    files?: Record<string, string>
    framework?: Framework
    env?: RuntimeEnv
    /**
     * `false`: TypeScript is erased like in a project without
     * `verbatimModuleSyntax` (imports nothing reads go too).
     */
    verbatimModuleSyntax?: boolean
    /** Id of the module (default `/test/src/module.tsx`). */
    id?: string
  } = {},
) {
  const id = options.id ?? moduleId
  const graph = createTestModuleGraph({
    modules: { ...options.files, [id]: code },
    stubs: options.stubs,
    framework: options.framework,
    env: options.env,
    verbatimModuleSyntax: options.verbatimModuleSyntax,
    fallbackStub: (_specifier, names) =>
      Object.fromEntries([...names].map((name) => [name, undefined])),
  })
  // Linking requests every static import; what evaluating does is not the
  // question here (a leaked server module may well throw). A module that
  // does not parse or link never evaluates: that fails.
  await graph.import(id).catch((error: unknown) => {
    if (!graph.evaluated.includes(id)) {
      throw error
    }
  })
  return [...new Set([...graph.requested, ...moduleRequests(code).dynamic])]
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
  expect(handler.serverFnMeta?.id, 'provider handler id').toBe(functionId)
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

/**
 * What `settle` gives for a call that throws: the thrown value itself, so
 * oracles (`serverOnlyError`, `clientOnlyError`) read the real error, and a
 * value the call returns is never mistaken for a throw.
 */
export class Thrown {
  constructor(readonly error: unknown) {}
}

/** The value of `run`, or `Thrown` with the error it throws. */
export function settle(run: () => unknown) {
  try {
    return run()
  } catch (error) {
    return new Thrown(error)
  }
}

/**
 * The value `run` resolves to, or `Thrown` with the error it throws or
 * rejects with.
 */
export async function settleAsync(run: () => unknown) {
  try {
    return await run()
  } catch (error) {
    return new Thrown(error)
  }
}
