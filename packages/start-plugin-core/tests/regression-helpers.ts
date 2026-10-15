/**
 * Shared harness of the Start compiler behaviour suites: compile a module
 * into its client, SSR caller and server-function provider outputs, split
 * `<Hydrate>` children into chunks, and evaluate compiled modules (linked as
 * real ES modules, `module-linker.ts`) against a minimal Start runtime.
 */
import { stripVTControlCharacters } from 'node:util'
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
  createModuleGraph,
  isNode,
  moduleRequests,
  parseModule,
  staticSpecifier,
  walk,
} from './module-linker'
import { getModuleErrors } from './validate-module'
import type { ModuleGraphOptions, ModuleStub, Node } from './module-linker'
import type { ServerFn } from '../src/start-compiler/types'
import type {
  StartCompilerPlugin,
  StartCompilerTransformResult,
} from '../src/types'

export type { ModuleStub } from './module-linker'

export type Output = 'client' | 'ssr' | 'provider'
export const outputs: Array<Output> = ['client', 'ssr', 'provider']
const moduleId = '/test/src/module.tsx'

interface StartCompilerOptions {
  env: 'client' | 'server'
  mode?: 'build' | 'dev'
  /** Project modules by absolute id; `./name` resolves to `/test/src/name.ts`. */
  files?: Record<string, string>
  /** `serverFnProviderModuleDirectives` */
  directives?: Array<string>
  compilerPlugins?: Array<StartCompilerPlugin>
}

/**
 * Creates a React `StartCompiler` configured the way the bundler plugins do,
 * and records the server functions it reports.
 */
export function createStartCompiler(options: StartCompilerOptions) {
  const { env, files = {} } = options
  const serverFns: Record<string, ServerFn> = {}
  const compiler: StartCompiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: options.mode ?? 'build',
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
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
  })
  const compile = async (code: string, id = moduleId) => {
    const result = await compiler.compile({
      code,
      id,
      detectedKinds: detectKindsInCode(code, env),
    })
    return result?.code ?? null
  }
  return { compiler, compile, serverFns }
}

/**
 * Compiles `code` for one output: the client, the SSR caller or the
 * server-function provider module (`?tss-serverfn-split`).
 */
export async function compileFor(
  output: Output,
  code: string,
  options: Omit<StartCompilerOptions, 'env'> & { id?: string } = {},
) {
  const { compile, serverFns } = createStartCompiler({
    ...options,
    env: output === 'client' ? 'client' : 'server',
  })
  const id = options.id ?? moduleId
  const result = await compile(
    code,
    output === 'provider' ? `${id}?tss-serverfn-split` : id,
  )
  return { code: result, serverFns }
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
  return { ...compiled, serverFns }
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
 * Minimal Start package: callers keep the RPC they were given, providers run
 * the original handler. The other factories throw when they are called
 * uncompiled, so a test only passes if the compiler ran.
 */
const startRuntime: Record<string, string> = {
  '@tanstack/react-start': `
const uncompiled = () => { throw new Error('uncompiled Start factory') }
const builder = () => {
  const self = {
    handler: (rpc, impl) =>
      impl
        ? Object.assign((opts) => impl(opts ?? {}), {
            __executeServer: (opts) => impl(opts),
          })
        : { rpc },
  }
  return self
}
export const createServerFn = builder
export const createServerOnlyFn = uncompiled
export const createClientOnlyFn = uncompiled
export const createIsomorphicFn = uncompiled
export const createMiddleware = () => ({ server: uncompiled })`,
  '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
  '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ client: id })`,
  '@tanstack/react-start/ssr-rpc': `export const createSsrRpc = (id) => ({ ssr: id })`,
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
 * `stubs` (by specifier) over the minimal Start runtime, and whose JSX
 * renders through `runtime` (default: `jsxToText`).
 */
function createTestModuleGraph(options: ModuleGraphOptions) {
  return createModuleGraph({
    ...options,
    stubs: { ...startRuntime, ...options.stubs },
    runtime: options.runtime ?? jsxToText,
  })
}

/**
 * Evaluates a compiled module like a bundler would: TypeScript is erased, JSX
 * becomes calls of `runtime` (which defines `__jsx` and `__Fragment`), and
 * every import is linked, as a real ES module, to the minimal Start runtime
 * or to `stubs` (by specifier; `.json` string stubs are JSON modules). Every
 * call evaluates a fresh instance, even for identical code.
 */
export async function evaluateModule(
  code: string,
  stubs: Record<string, ModuleStub> = {},
  runtime = jsxToText,
): Promise<Record<string, any>> {
  return createTestModuleGraph({
    modules: { [moduleId]: code },
    stubs,
    runtime,
  }).import(moduleId)
}

/** A server fn handler a provider module exports. */
type ProviderHandler = ((opts: { data?: unknown }) => unknown) & {
  meta?: { id?: string; name?: string }
}

/**
 * Runs a provider's extracted handler the way the server-fn router does. The
 * handler is found through the metadata the provider gives it at runtime
 * (`meta.name`, the name of the server fn), not through its export name.
 */
export async function callProvider(
  provider: string | Record<string, any>,
  name: string,
  stubs: Record<string, ModuleStub> = {},
  data?: unknown,
) {
  const module =
    typeof provider === 'string'
      ? await evaluateModule(provider, stubs)
      : provider
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
 * server-fn router does: it imports the reported `extractedFilename` (the
 * provider, compiled under that id) and calls the reported `functionName`
 * export. Returns the results in the order of `serverFns`.
 */
export async function callReportedServerFns(
  provider: string,
  serverFns: Record<string, ServerFn>,
  stubs: Record<string, ModuleStub> = {},
) {
  const graph = createTestModuleGraph({
    modules: { [`${moduleId}?tss-serverfn-split`]: provider },
    stubs,
  })
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
  options: { id?: string } = {},
) {
  const plugin = createHydrateCompilerPlugin()
  const { compile } = createStartCompiler({ env, compilerPlugins: [plugin] })
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

/** Parent-module stubs: `<Hydrate>` marks where its children render, lazy chunks render their props. */
export const hydrateParentStubs = {
  '@tanstack/react-start': {
    Hydrate: (props: { children: unknown }) => `[${props.children ?? ''}]`,
  },
  '@tanstack/react-start/hydration': {
    idle: () => 'idle',
    visible: () => 'visible',
  },
  '@tanstack/react-router': {
    lazyRouteComponent: () => (props: Record<string, unknown>) =>
      `lazy(${Object.keys(props)
        .filter((name) => name !== 'children')
        .sort()
        .map((name) => `${name}=${String(props[name])}`)
        .join(',')})`,
  },
}

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
 * Compiles `code` for the client and evaluates it once its `<Hydrate>` chunks
 * have loaded, like the browser does: the parent and the chunks are one
 * linked module graph (each chunk compiled like the bundler compiles the
 * virtual module), `lazyRouteComponent(load, exportName)` loads its chunk
 * through `load()` and renders the export it names. `beforeChunksLoad` runs
 * app code between the parent's evaluation and the chunks'. `lazyChunks`
 * lists every lazy chunk component and whether it rendered.
 */
export async function loadClientModule(
  code: string,
  options: {
    stubs?: Record<string, ModuleStub>
    beforeChunksLoad?: (module: Record<string, any>) => void
    runtime?: string
    /** Id the module is compiled under. */
    id?: string
  } = {},
) {
  const id = options.id ?? moduleId
  const { parent, chunks, plugin } = await compileHydrate('client', code, {
    id,
  })
  const lazyChunks: Array<{ name: string; rendered: boolean }> = []
  const loaders: Array<{
    name: string
    load: () => Promise<Record<string, any>>
    component?: (props: unknown) => unknown
  }> = []
  const userStubs = options.stubs ?? {}
  const stubs: Record<string, ModuleStub> = {
    ...hydrateParentStubs,
    ...userStubs,
    '@tanstack/react-router': {
      ...(userStubs['@tanstack/react-router'] as Record<string, unknown>),
      lazyRouteComponent: (
        load: () => Promise<Record<string, any>>,
        name = 'default',
      ) => {
        const lazyChunk = { name, rendered: false }
        const loader: (typeof loaders)[number] = { name, load }
        lazyChunks.push(lazyChunk)
        loaders.push(loader)
        return (props: unknown) => {
          lazyChunk.rendered = true
          if (!loader.component) {
            throw new Error(`lazy chunk ${name} rendered before it loaded`)
          }
          return loader.component(props)
        }
      },
    },
  }
  expect(await getModuleErrors(parent)).toEqual([])
  const { compile } = createStartCompiler({
    env: 'client',
    compilerPlugins: [plugin],
  })
  const graph = createTestModuleGraph({
    modules: { [id]: parent },
    stubs,
    runtime: options.runtime,
    // The bundler compiles each virtual module it loads like any other module.
    load: async (chunkId) => {
      const chunk = loadChunk(plugin, 'client', chunkId)
      return chunk === null ? null : ((await compile(chunk, chunkId)) ?? chunk)
    },
  })
  const module = await graph.import(id)
  options.beforeChunksLoad?.(module)
  for (const chunk of chunks) {
    expect(await getModuleErrors(chunk)).toEqual([])
  }
  // Loading a chunk may create the lazy components of nested boundaries,
  // which the iteration reaches as they are appended.
  for (const loader of loaders) {
    loader.component = (await loader.load())[loader.name]
  }
  return { module, lazyChunks }
}

/**
 * Renders `code` compiled for `env` and records the boundary id (`h`) each
 * `<Hydrate>` renders with: on the server the id in its markup, on the client
 * the id it hydrates with (chunks loaded, `loadClientModule`).
 */
export async function renderBoundaries(
  env: 'client' | 'server',
  code: string,
  render: (module: Record<string, any>) => unknown,
  options: { id?: string } = {},
) {
  const ids: Array<unknown> = []
  const Hydrate = (props: { children?: unknown; h?: unknown }) => {
    ids.push(props.h)
    return `[${props.children ?? ''}]`
  }
  const stubs = {
    ...hydrateParentStubs,
    '@tanstack/react-start': { Hydrate },
  }
  const module =
    env === 'server'
      ? await evaluateModule(
          (await compileHydrate('server', code, options)).parent,
          stubs,
        )
      : (await loadClientModule(code, { ...options, stubs })).module
  const html = render(module)
  return { html, ids }
}
