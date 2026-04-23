import { extname, resolve as resolvePath } from 'node:path'

import { normalizePath } from 'vite'

import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from '../import-protection/defaults'
import { ExtensionlessAbsoluteIdResolver } from '../import-protection/extensionlessAbsoluteIdResolver'
import { compileMatchers, matchesAny } from '../import-protection/matchers'
import {
  getImportProtectionEnvType,
  getImportProtectionRelativePath,
  getImportProtectionRulesForEnvironment,
  shouldCheckImportProtectionImporter,
} from '../import-protection/adapterUtils'
import {
  findOriginalUnsafeUsagePosFromResult,
  getImportSources,
  getMockExportNamesBySource,
  getNamedExports,
} from '../import-protection/analysis'
import { rewriteDeniedImports } from '../import-protection/rewrite'
import {
  ImportLocCache,
  addTraceImportLocations,
  buildCodeSnippet,
  buildLineIndex,
  createImportSpecifierLocationIndex,
  findImportStatementLocationFromTransformed,
  findOriginalUsageLocation,
  findPostCompileUsageLocation,
  getOrCreateOriginalTransformResult,
  indexToLineColumn,
  normalizeSourceMap,
  pickOriginalCodeFromSourcesContent,
} from '../import-protection/sourceLocation'
import {
  ImportGraph,
  buildTrace,
  formatViolation,
} from '../import-protection/trace'
import {
  generateDevSelfDenialModule,
  generateSelfContainedMockModule,
  loadMockEdgeModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
} from '../import-protection/virtualModules'
import {
  buildResolutionCandidates,
  buildSourceCandidates,
  canonicalizeResolvedId,
  checkFileDenial,
  clearNormalizeFilePathCache,
  dedupePatterns,
  dedupeViolationKey,
  isFileExcluded,
  normalizeFilePath,
} from '../import-protection/utils'

import type {
  ImportProtectionBehavior,
  ImportProtectionOptions,
} from '../schema'
import type { CompiledMatcher } from '../import-protection/matchers'
import type {
  SourceMapLike,
  TransformResult,
  TransformResultProvider,
} from '../import-protection/sourceLocation'
import type { Loc, TraceStep, ViolationInfo } from '../import-protection/trace'
import type { CompileStartFrameworkOptions, GetConfigFn } from '../types'
import type {
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'

type RspackNamespace = typeof rspackNamespaceType
type RspackVirtualModulesPlugin = InstanceType<
  RspackNamespace['experiments']['VirtualModulesPlugin']
>
type ProcessAssetsContext = Parameters<
  Parameters<RsbuildPluginAPI['processAssets']>[1]
>[0]
type TransformContext = Parameters<
  Parameters<RsbuildPluginAPI['transform']>[1]
>[0]
type RspackCompilation = Rspack.Compilation
type RspackModule = Rspack.Module
type RspackModuleGraphConnection = {
  module?: RspackModule | null
  dependency?: unknown
  getActiveState?: (runtime: string | Array<string> | undefined) => unknown
}
type OriginalCodeLoader = (file: string) => Promise<string | undefined>
const importSpecifierLocationIndex = createImportSpecifierLocationIndex()

interface EnvRules {
  specifiers: Array<CompiledMatcher>
  files: Array<CompiledMatcher>
  excludeFiles: Array<CompiledMatcher>
}

interface PluginConfig {
  enabled: boolean
  root: string
  command: 'build' | 'serve'
  srcDirectory: string
  framework: CompileStartFrameworkOptions
  effectiveBehavior: ImportProtectionBehavior
  mockAccess: 'error' | 'warn' | 'off'
  logMode: 'once' | 'always'
  maxTraceDepth: number
  compiledRules: {
    client: EnvRules
    server: EnvRules
  }
  includeMatchers: Array<CompiledMatcher>
  excludeMatchers: Array<CompiledMatcher>
  ignoreImporterMatchers: Array<CompiledMatcher>
  markerSpecifiers: {
    serverOnly: Set<string>
    clientOnly: Set<string>
  }
  envTypeMap: Map<string, 'client' | 'server'>
  onViolation?: (
    info: ViolationInfo,
  ) => boolean | void | Promise<boolean | void>
}

interface EnvRuntimeState {
  resolveCache: Map<string, string | null>
  seenViolations: Set<string>
  buildTransformResults: Map<string, TransformResult>
  deferredFileViolations: Array<DeferredFileViolation>
  deferredFileViolationKeys: Set<string>
}

interface DeferredFileViolation {
  importer: string
  specifier: string
  resolved: string
  relativeResolved: string
  pattern: string | RegExp
  useOriginalLocation: boolean
}

interface SharedState {
  root: string
  virtualModules: Map<string, string>
  vmPlugins: Record<string, RspackVirtualModulesPlugin>
  readyVmPlugins: Record<string, boolean>
  inputFileSystems: Record<string, Rspack.Compiler['inputFileSystem']>
  pendingWrites: Map<string, Map<string, string>>
}

interface CompilationEdge {
  importer: string
  specifier?: string
  resolved: string
}

interface MockEdgePayload {
  exports: Array<string>
  runtimeId: string
  violation: {
    env: string
    envType: 'client' | 'server'
    importer: string
    specifier: string
    resolved?: string
    patternText: string
  }
}

const IMPORT_PROTECTION_VIRTUAL_DIR = 'node_modules/.virtual/import-protection'
const MOCK_EDGE_FILE_PREFIX = 'mock-edge-'
const MOCK_RUNTIME_FILE_PREFIX = 'mock-runtime-'
const MOCK_SILENT_FILE = 'mock-silent.mjs'

function toBase64Url(input: unknown): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
}

function fromBase64Url<T>(input: string): T {
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as T
}

function getRulesForEnvironment(
  config: PluginConfig,
  envName: string,
): EnvRules {
  return getImportProtectionRulesForEnvironment(config, envName) as EnvRules
}

function serializePattern(pattern: string | RegExp): string {
  return typeof pattern === 'string' ? pattern : pattern.toString()
}

function dedupeKey(info: ViolationInfo): string {
  return dedupeViolationKey(info)
}

function getOrCreateEnvState(
  envStates: Map<string, EnvRuntimeState>,
  envName: string,
): EnvRuntimeState {
  let env = envStates.get(envName)

  if (!env) {
    env = {
      resolveCache: new Map(),
      seenViolations: new Set(),
      buildTransformResults: new Map(),
      deferredFileViolations: [],
      deferredFileViolationKeys: new Set(),
    }
    envStates.set(envName, env)
  }

  return env
}

function getVirtualModulePath(
  root: string,
  envName: string,
  filename: string,
): string {
  return normalizePath(
    resolvePath(root, IMPORT_PROTECTION_VIRTUAL_DIR, envName, filename),
  )
}

function queuePendingWrite(
  shared: SharedState,
  envName: string,
  filePath: string,
  code: string,
): void {
  let writes = shared.pendingWrites.get(envName)
  if (!writes) {
    writes = new Map()
    shared.pendingWrites.set(envName, writes)
  }

  writes.set(filePath, code)
}

function tryWriteVirtualModule(
  shared: SharedState,
  envName: string,
  filePath: string,
  code: string,
): string {
  const current = shared.virtualModules.get(filePath)
  if (current === code) {
    return filePath
  }

  shared.virtualModules.set(filePath, code)

  const vmPlugin = shared.vmPlugins[envName]
  if (!vmPlugin || !shared.readyVmPlugins[envName]) {
    queuePendingWrite(shared, envName, filePath, code)
    return filePath
  }

  vmPlugin.writeModule(filePath, code)
  return filePath
}

function flushPendingWrites(shared: SharedState, envName: string): void {
  const writes = shared.pendingWrites.get(envName)
  if (!writes?.size || !shared.readyVmPlugins[envName]) {
    return
  }

  for (const [filePath, code] of writes) {
    shared.vmPlugins[envName]?.writeModule(filePath, code)
    writes.delete(filePath)
  }

  if (writes.size === 0) {
    shared.pendingWrites.delete(envName)
  }
}

function ensureSilentMockModule(shared: SharedState, envName: string): string {
  return tryWriteVirtualModule(
    shared,
    envName,
    getVirtualModulePath(shared.root, envName, MOCK_SILENT_FILE),
    loadSilentMockModule().code,
  )
}

function ensureRuntimeMockModule(opts: {
  shared: SharedState
  envName: string
  mode: 'error' | 'warn' | 'off'
  env: string
  importer: string
  specifier: string
}): string {
  const encoded = toBase64Url({
    mode: opts.mode,
    env: opts.env,
    importer: opts.importer,
    specifier: opts.specifier,
    trace: [],
  })

  return tryWriteVirtualModule(
    opts.shared,
    opts.envName,
    getVirtualModulePath(
      opts.shared.root,
      opts.envName,
      `${MOCK_RUNTIME_FILE_PREFIX}${encoded}.mjs`,
    ),
    loadMockRuntimeModule(encoded).code,
  )
}

function ensureMockEdgeModule(opts: {
  shared: SharedState
  envName: string
  payload: MockEdgePayload
}): string {
  const encoded = toBase64Url(opts.payload)

  return tryWriteVirtualModule(
    opts.shared,
    opts.envName,
    getVirtualModulePath(
      opts.shared.root,
      opts.envName,
      `${MOCK_EDGE_FILE_PREFIX}${encoded}.mjs`,
    ),
    loadMockEdgeModule(encoded).code,
  )
}

function getMockEdgePayloadFromFile(
  filePath: string,
): MockEdgePayload | undefined {
  const match = /(?:^|[\\/])mock-edge-([^/\\]+)\.mjs$/.exec(filePath)
  if (!match) {
    return undefined
  }

  try {
    return fromBase64Url<MockEdgePayload>(match[1]!)
  } catch {
    return undefined
  }
}

async function loadOriginalCode(
  cache: Map<string, Promise<string | undefined>>,
  file: string,
  loader: OriginalCodeLoader,
): Promise<string | undefined> {
  let result = cache.get(file)
  if (!result) {
    result = loader(file)
    cache.set(file, result)
  }

  return result
}

async function loadOriginalCodeFromInputFileSystem(
  inputFileSystem: NonNullable<RspackCompilation['inputFileSystem']>,
  file: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    inputFileSystem.readFile(file, (error, data) => {
      if (error || data == null) {
        resolve(undefined)
        return
      }

      resolve(typeof data === 'string' ? data : data.toString('utf8'))
    })
  })
}

async function resolveAgainstImporter(opts: {
  envState: EnvRuntimeState
  config: PluginConfig
  ctx: TransformContext
  importerId: string
  source: string
  extensionlessResolver: ExtensionlessAbsoluteIdResolver
}): Promise<string | null> {
  const normalizedImporter = normalizeFilePath(opts.importerId)
  const cacheKey = `${normalizedImporter}:${opts.source}`

  if (opts.envState.resolveCache.has(cacheKey)) {
    return opts.envState.resolveCache.get(cacheKey) ?? null
  }

  const importerDir =
    opts.ctx.context ?? opts.importerId.replace(/[/\\][^/\\]*$/, '')

  const resolved = await new Promise<string | null>((resolve, reject) => {
    opts.ctx.resolve(importerDir, opts.source, (error, result) => {
      if (error) {
        reject(error)
        return
      }

      resolve(typeof result === 'string' ? result : null)
    })
  }).catch(() => null)

  if (!resolved) {
    opts.envState.resolveCache.set(cacheKey, null)
    return null
  }

  const canonical = canonicalizeResolvedId(
    resolved,
    opts.config.root,
    (value) => opts.extensionlessResolver.resolve(value),
  )

  opts.envState.resolveCache.set(cacheKey, canonical)
  return canonical
}

function getModuleResource(module: RspackModule): string | undefined {
  const candidate = module as RspackModule & {
    nameForCondition?: () => string | undefined
    resourceResolveData?: { resource?: string }
    resource?: string
    userRequest?: string
    request?: string
  }

  return (
    candidate.nameForCondition() ??
    candidate.resourceResolveData?.resource ??
    candidate.resource ??
    candidate.userRequest ??
    candidate.request
  )
}

function getModuleFile(module: RspackModule): string {
  return normalizeFilePath(getModuleResource(module) ?? module.identifier())
}

const IMPORT_PROTECTION_PARSEABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

function isImportProtectionSourceFile(file: string | undefined): boolean {
  if (!file) {
    return false
  }

  const extension = extname(normalizeFilePath(file))
  return (
    extension.length > 0 &&
    IMPORT_PROTECTION_PARSEABLE_EXTENSIONS.has(extension)
  )
}

function isImportProtectionSourceModule(module: RspackModule): boolean {
  return isImportProtectionSourceFile(getModuleResource(module))
}

function addTransformResult(
  cache: Map<string, TransformResult>,
  key: string,
  result: TransformResult,
): void {
  cache.set(normalizePath(key), result)
  cache.set(normalizeFilePath(key), result)
}

function hasTransformResult(
  cache: Map<string, TransformResult>,
  key: string,
): boolean {
  return cache.has(normalizePath(key)) || cache.has(normalizeFilePath(key))
}

function deferFileViolation(
  envState: EnvRuntimeState,
  violation: DeferredFileViolation,
): void {
  const key = `${violation.importer}:${violation.specifier}:${violation.resolved}:${String(violation.pattern)}`
  if (envState.deferredFileViolationKeys.has(key)) {
    return
  }

  envState.deferredFileViolationKeys.add(key)
  envState.deferredFileViolations.push(violation)
}

function hasOriginalUnsafeUsage(
  result: TransformResult | undefined,
  source: string,
  envType: 'client' | 'server',
): boolean {
  if (!result) {
    return false
  }

  const originalResult = getOrCreateOriginalTransformResult(result)
  if (!originalResult) {
    return false
  }

  return !!findOriginalUnsafeUsagePosFromResult(originalResult, source, envType)
}

async function buildTransformResultProvider(opts: {
  modules: Array<RspackModule>
  root: string
  loadOriginalCode: OriginalCodeLoader
  preloaded?: Map<string, TransformResult>
}): Promise<TransformResultProvider> {
  const cache = new Map<string, TransformResult>()

  if (opts.preloaded) {
    for (const [key, result] of opts.preloaded) {
      cache.set(key, result)
    }
  }

  for (const module of opts.modules) {
    const source = module.originalSource()
    if (!source) continue

    const sourceAndMap = source.sourceAndMap()
    const code = String(sourceAndMap.source)
    const map = normalizeSourceMap(sourceAndMap.map as SourceMapLike | null)
    const file = getModuleFile(module)
    const resource = getModuleResource(module)

    const originalCode = map?.sourcesContent
      ? (pickOriginalCodeFromSourcesContent(map, resource ?? file, opts.root) ??
        (resource ? await opts.loadOriginalCode(resource) : undefined))
      : resource
        ? await opts.loadOriginalCode(resource)
        : undefined

    const result: TransformResult = {
      code,
      map,
      originalCode,
      lineIndex: buildLineIndex(code),
    }

    if (!hasTransformResult(cache, file)) {
      addTransformResult(cache, file, result)
    }

    if (resource && !hasTransformResult(cache, resource)) {
      addTransformResult(cache, resource, result)
    }
  }

  return {
    getTransformResult(id: string) {
      return cache.get(normalizePath(id)) ?? cache.get(normalizeFilePath(id))
    },
  }
}

function getConnectionRequest(dependency: unknown): string | undefined {
  const candidate = dependency as { request?: unknown }
  return typeof candidate.request === 'string' ? candidate.request : undefined
}

function addEntryModulesToGraph(opts: {
  compilation: RspackCompilation
  graph: ImportGraph
}): void {
  for (const entry of opts.compilation.entries.values()) {
    for (const dependency of entry.dependencies) {
      const connection = opts.compilation.moduleGraph.getConnection(dependency)
      const module = connection?.module
      if (!module) continue
      opts.graph.addEntry(getModuleFile(module))
    }
  }
}

function buildCompilationGraph(opts: {
  compilation: RspackCompilation
  modules: Array<RspackModule>
}): { graph: ImportGraph; edges: Array<CompilationEdge> } {
  const graph = new ImportGraph()
  const edges: Array<CompilationEdge> = []

  addEntryModulesToGraph({
    compilation: opts.compilation,
    graph,
  })

  for (const module of opts.modules) {
    const importer = getModuleFile(module)
    const connections =
      opts.compilation.moduleGraph.getOutgoingConnectionsInOrder(module)

    for (const connection of connections) {
      if (!connection.module) continue
      if (!isActiveConnection(connection)) continue

      const resolved = getModuleFile(connection.module)
      const specifier = getConnectionRequest(connection.dependency)
      graph.addEdge(resolved, importer, specifier)
      edges.push({ importer, specifier, resolved })
    }
  }

  return { graph, edges }
}

function isActiveConnection(connection: RspackModuleGraphConnection): boolean {
  if (typeof connection.getActiveState !== 'function') {
    return true
  }

  return connection.getActiveState(undefined) === true
}

function findImportLocationInOriginalCode(
  provider: TransformResultProvider,
  importer: string,
  source: string,
): Loc | undefined {
  const result = provider.getTransformResult(importer)
  if (!result) {
    return undefined
  }

  const originalResult = getOrCreateOriginalTransformResult(result)
  if (!originalResult) {
    return undefined
  }

  const index = importSpecifierLocationIndex.find(originalResult, source)
  if (index === -1) {
    return undefined
  }

  const lineIndex =
    originalResult.lineIndex ??
    (originalResult.lineIndex = buildLineIndex(originalResult.code))
  const loc = indexToLineColumn(lineIndex, index)

  return {
    file: normalizeFilePath(importer),
    line: loc.line,
    column: loc.column,
  }
}

async function resolveImporterLocation(opts: {
  provider: TransformResultProvider
  importLocCache: ImportLocCache
  importer: string
  sourceCandidates: Iterable<string>
  preferOriginalCode?: boolean
  envType?: 'client' | 'server'
}): Promise<Loc | undefined> {
  if (opts.preferOriginalCode) {
    for (const candidate of opts.sourceCandidates) {
      const loc =
        findOriginalUsageLocation(
          opts.provider,
          opts.importer,
          candidate,
          opts.envType,
        ) ??
        findImportLocationInOriginalCode(
          opts.provider,
          opts.importer,
          candidate,
        )
      if (loc) {
        return loc
      }
    }
  }

  for (const candidate of opts.sourceCandidates) {
    const loc =
      (await findPostCompileUsageLocation(
        opts.provider,
        opts.importer,
        candidate,
      )) ||
      (await findImportStatementLocationFromTransformed(
        opts.provider,
        opts.importer,
        candidate,
        opts.importLocCache,
        importSpecifierLocationIndex.find,
      ))

    if (loc) {
      return loc
    }
  }

  if (!opts.preferOriginalCode) {
    for (const candidate of opts.sourceCandidates) {
      const loc = findImportLocationInOriginalCode(
        opts.provider,
        opts.importer,
        candidate,
      )
      if (loc) {
        return loc
      }
    }
  }

  return undefined
}

async function rebuildAndAnnotateTrace(opts: {
  provider: TransformResultProvider
  graph: ImportGraph
  importLocCache: ImportLocCache
  importer: string
  specifier: string
  importerLoc?: Loc
  maxTraceDepth: number
}): Promise<Array<TraceStep>> {
  const trace = buildTrace(opts.graph, opts.importer, opts.maxTraceDepth)

  await addTraceImportLocations(
    opts.provider,
    trace,
    opts.importLocCache,
    importSpecifierLocationIndex.find,
  )

  if (trace.length > 0) {
    const last = trace[trace.length - 1]!
    if (!last.specifier) {
      last.specifier = opts.specifier
    }
    if (opts.importerLoc && last.line == null) {
      last.line = opts.importerLoc.line
      last.column = opts.importerLoc.column
    }
  }

  return trace
}

async function buildViolationInfo(opts: {
  config: PluginConfig
  provider: TransformResultProvider
  graph: ImportGraph
  importLocCache: ImportLocCache
  envName: string
  envType: 'client' | 'server'
  importer: string
  source: string
  resolved?: string
  type: 'specifier' | 'file' | 'marker'
  pattern?: string | RegExp
  preferOriginalCode?: boolean
}): Promise<ViolationInfo> {
  const importerLoc = await resolveImporterLocation({
    provider: opts.provider,
    importLocCache: opts.importLocCache,
    importer: opts.importer,
    sourceCandidates: buildSourceCandidates(
      opts.source,
      opts.resolved,
      opts.config.root,
    ),
    preferOriginalCode: opts.preferOriginalCode,
    envType: opts.envType,
  })

  const trace = await rebuildAndAnnotateTrace({
    provider: opts.provider,
    graph: opts.graph,
    importLocCache: opts.importLocCache,
    importer: opts.importer,
    specifier: opts.source,
    importerLoc,
    maxTraceDepth: opts.config.maxTraceDepth,
  })

  const snippet = importerLoc
    ? buildCodeSnippet(opts.provider, opts.importer, importerLoc)
    : undefined

  return {
    env: opts.envName,
    envType: opts.envType,
    behavior: opts.config.effectiveBehavior,
    type: opts.type,
    pattern: opts.pattern,
    specifier: opts.source,
    importer: opts.importer,
    ...(opts.resolved ? { resolved: opts.resolved } : {}),
    ...(importerLoc ? { importerLoc } : {}),
    trace,
    snippet,
  }
}

async function getMarkerKindForFile(opts: {
  config: PluginConfig
  provider: TransformResultProvider
  loadOriginalCode: OriginalCodeLoader
  markerKindCache: Map<string, Promise<'server' | 'client' | undefined>>
  file: string
}): Promise<'server' | 'client' | undefined> {
  if (!isImportProtectionSourceFile(opts.file)) {
    return undefined
  }

  let cached = opts.markerKindCache.get(opts.file)
  if (!cached) {
    cached = (async () => {
      const code =
        opts.provider.getTransformResult(opts.file)?.originalCode ??
        (await opts.loadOriginalCode(opts.file))

      if (!code) {
        return undefined
      }

      const imports = getImportSources(code)
      const hasServerOnly = imports.some((source) =>
        opts.config.markerSpecifiers.serverOnly.has(source),
      )
      const hasClientOnly = imports.some((source) =>
        opts.config.markerSpecifiers.clientOnly.has(source),
      )

      if (hasServerOnly && !hasClientOnly) {
        return 'server'
      }

      if (hasClientOnly && !hasServerOnly) {
        return 'client'
      }

      return undefined
    })()
    opts.markerKindCache.set(opts.file, cached)
  }

  return cached
}

async function reportViolation(opts: {
  config: PluginConfig
  envState: EnvRuntimeState
  compilation: RspackCompilation
  rspack: RspackNamespace
  info: ViolationInfo
}): Promise<void> {
  const key = dedupeKey(opts.info)
  if (
    opts.config.logMode !== 'always' &&
    opts.envState.seenViolations.has(key)
  ) {
    return
  }

  opts.envState.seenViolations.add(key)

  if (opts.config.onViolation) {
    const result = await opts.config.onViolation(opts.info)
    if (result === false) {
      return
    }
  }

  const message = formatViolation(opts.info, opts.config.root)
  const error = new opts.rspack.WebpackError(message)

  if (opts.config.effectiveBehavior === 'error') {
    opts.compilation.errors.push(error)
  } else {
    opts.compilation.warnings.push(error)
  }
}

export function registerImportProtection(
  api: RsbuildPluginAPI,
  opts: {
    getConfig: GetConfigFn
    framework: CompileStartFrameworkOptions
    environments: Array<{ name: string; type: 'client' | 'server' }>
  },
): void {
  const extensionlessResolver = new ExtensionlessAbsoluteIdResolver()
  const envStates = new Map<string, EnvRuntimeState>()
  const fileReadCache = new Map<string, Promise<string | undefined>>()

  const config: PluginConfig = {
    enabled: true,
    root: '',
    command: api.context.action === 'dev' ? 'serve' : 'build',
    srcDirectory: '',
    framework: opts.framework,
    effectiveBehavior: 'error',
    mockAccess: 'error',
    logMode: 'once',
    maxTraceDepth: 20,
    compiledRules: {
      client: {
        specifiers: [],
        files: [],
        excludeFiles: [],
      },
      server: {
        specifiers: [],
        files: [],
        excludeFiles: [],
      },
    },
    includeMatchers: [],
    excludeMatchers: [],
    ignoreImporterMatchers: [],
    markerSpecifiers: {
      serverOnly: new Set(),
      clientOnly: new Set(),
    },
    envTypeMap: new Map(opts.environments.map((env) => [env.name, env.type])),
    onViolation: undefined,
  }

  const shared: SharedState = {
    root: '',
    virtualModules: new Map(),
    vmPlugins: {},
    readyVmPlugins: {},
    inputFileSystems: {},
    pendingWrites: new Map(),
  }

  function applyUserConfig(): void {
    const { startConfig, resolvedStartConfig } = opts.getConfig()

    config.root = resolvedStartConfig.root
    config.srcDirectory = resolvedStartConfig.srcDirectory
    shared.root = resolvedStartConfig.root

    const userOpts: ImportProtectionOptions | undefined =
      startConfig.importProtection

    if (userOpts?.enabled === false) {
      config.enabled = false
      return
    }

    config.enabled = true

    const behavior = userOpts?.behavior
    if (typeof behavior === 'string') {
      config.effectiveBehavior = behavior
    } else {
      config.effectiveBehavior =
        config.command === 'serve'
          ? (behavior?.dev ?? 'mock')
          : (behavior?.build ?? 'error')
    }

    config.logMode = userOpts?.log ?? 'once'
    config.mockAccess = userOpts?.mockAccess ?? 'error'
    config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20
    config.onViolation = userOpts?.onViolation
      ? (info) => userOpts.onViolation?.(info)
      : undefined

    const defaults = getDefaultImportProtectionRules()
    const pick = <T>(user: Array<T> | undefined, fallback: Array<T>) =>
      user ? [...user] : [...fallback]

    const clientSpecifiers = dedupePatterns([
      ...defaults.client.specifiers,
      ...(userOpts?.client?.specifiers ?? []),
    ])

    config.compiledRules.client = {
      specifiers: compileMatchers(clientSpecifiers),
      files: compileMatchers(
        pick(userOpts?.client?.files, defaults.client.files),
      ),
      excludeFiles: compileMatchers(
        pick(userOpts?.client?.excludeFiles, defaults.client.excludeFiles),
      ),
    }

    config.compiledRules.server = {
      specifiers: compileMatchers(
        dedupePatterns(
          pick(userOpts?.server?.specifiers, defaults.server.specifiers),
        ),
      ),
      files: compileMatchers(
        pick(userOpts?.server?.files, defaults.server.files),
      ),
      excludeFiles: compileMatchers(
        pick(userOpts?.server?.excludeFiles, defaults.server.excludeFiles),
      ),
    }

    config.includeMatchers = compileMatchers(userOpts?.include ?? [])
    config.excludeMatchers = compileMatchers(userOpts?.exclude ?? [])
    config.ignoreImporterMatchers = compileMatchers(
      userOpts?.ignoreImporters ?? [],
    )

    const markers = getMarkerSpecifiers()
    config.markerSpecifiers = {
      serverOnly: new Set(markers.serverOnly),
      clientOnly: new Set(markers.clientOnly),
    }
  }

  api.onBeforeBuild(() => {
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    fileReadCache.clear()
    envStates.clear()
  })

  api.onBeforeDevCompile(() => {
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    fileReadCache.clear()

    for (const envState of envStates.values()) {
      envState.resolveCache.clear()
      envState.buildTransformResults.clear()
      envState.deferredFileViolations.length = 0
      envState.deferredFileViolationKeys.clear()
    }
  })

  api.modifyRspackConfig((rspackConfig, utils) => {
    applyUserConfig()

    const envName = utils.environment.name
    const VMP = utils.rspack.experiments.VirtualModulesPlugin
    const vmPlugin = new VMP({})

    shared.vmPlugins[envName] = vmPlugin
    shared.readyVmPlugins[envName] = false

    rspackConfig.plugins.push(vmPlugin)
    rspackConfig.plugins.push({
      apply(compiler: Rspack.Compiler) {
        shared.inputFileSystems[envName] = compiler.inputFileSystem
        compiler.hooks.thisCompilation.tap(
          'TanStackStartImportProtectionVirtualModulesReady',
          () => {
            shared.readyVmPlugins[envName] = true
            flushPendingWrites(shared, envName)
          },
        )
      },
    })
  })

  for (const environment of opts.environments) {
    api.transform(
      {
        test: /\.[cm]?[tj]sx?$/,
        environments: [environment.name],
        order: 'post',
      },
      async (ctx) => {
        if (!config.enabled) {
          return ctx.code
        }

        const envName = environment.name
        const envType = getImportProtectionEnvType(config, envName)
        const envState = getOrCreateEnvState(envStates, envName)
        const id = ctx.resource
        const file = normalizeFilePath(ctx.resourcePath)

        if (!shouldCheckImportProtectionImporter(config, file)) {
          return ctx.code
        }

        const matchers = getRulesForEnvironment(config, envName)
        const relativeFile = getImportProtectionRelativePath(config.root, file)
        const importSources = getImportSources(ctx.code)
        const transformedImportSources = new Set(importSources)
        const transformInputFileSystem = shared.inputFileSystems[envName]
        const loadOriginalCodeForTransform: OriginalCodeLoader =
          transformInputFileSystem
            ? (target) =>
                loadOriginalCodeFromInputFileSystem(
                  transformInputFileSystem,
                  target,
                )
            : () => Promise.resolve(undefined)
        const originalCode =
          config.command === 'build'
            ? await loadOriginalCode(
                fileReadCache,
                file,
                loadOriginalCodeForTransform,
              )
            : undefined
        const buildImportSources = originalCode
          ? getImportSources(originalCode)
          : []
        const buildTransformResult: TransformResult | undefined =
          config.command === 'build'
            ? {
                code: ctx.code,
                map: undefined,
                originalCode,
                lineIndex: buildLineIndex(ctx.code),
              }
            : undefined

        if (config.command === 'build') {
          const relativeBuildFile = getImportProtectionRelativePath(
            config.root,
            file,
          )
          addTransformResult(
            envState.buildTransformResults,
            file,
            buildTransformResult!,
          )
          addTransformResult(
            envState.buildTransformResults,
            relativeBuildFile,
            buildTransformResult!,
          )
          if (id !== file) {
            addTransformResult(
              envState.buildTransformResults,
              id,
              buildTransformResult!,
            )
          }
        }

        const hasServerOnlyMarker = importSources.some((source) =>
          config.markerSpecifiers.serverOnly.has(source),
        )
        const hasClientOnlyMarker = importSources.some((source) =>
          config.markerSpecifiers.clientOnly.has(source),
        )

        if (hasServerOnlyMarker && hasClientOnlyMarker) {
          throw new Error(
            `[import-protection] File "${relativeFile}" has both server-only and client-only markers. This is not allowed.`,
          )
        }

        const markerKind = hasServerOnlyMarker
          ? ('server' as const)
          : hasClientOnlyMarker
            ? ('client' as const)
            : undefined

        const fileMatch = checkFileDenial(relativeFile, matchers)
        const markerViolation =
          (envType === 'client' && markerKind === 'server') ||
          (envType === 'server' && markerKind === 'client')

        if (fileMatch || markerViolation) {
          let exportNames: Array<string> = []

          try {
            exportNames = getNamedExports(ctx.code)
          } catch {
            exportNames = []
          }

          if (config.command === 'build') {
            return generateSelfContainedMockModule(exportNames)
          }

          const runtimeId = ensureRuntimeMockModule({
            shared,
            envName,
            mode: config.mockAccess,
            env: envName,
            importer: file,
            specifier: relativeFile,
          })

          return generateDevSelfDenialModule(exportNames, runtimeId)
        }

        const deniedSpecifierReplacements = new Map<string, string>()
        const exportsBySource = (() => {
          try {
            return getMockExportNamesBySource(ctx.code)
          } catch {
            return new Map<string, Array<string>>()
          }
        })()

        for (const source of importSources) {
          const specifierMatch = matchesAny(source, matchers.specifiers)
          if (!specifierMatch && config.command === 'build') {
            const resolved = await resolveAgainstImporter({
              envState,
              config,
              ctx,
              importerId: id,
              source,
              extensionlessResolver,
            })

            if (resolved) {
              const relativeResolved = getImportProtectionRelativePath(
                config.root,
                resolved,
              )
              const buildFileMatch = checkFileDenial(relativeResolved, matchers)
              if (
                buildFileMatch &&
                hasOriginalUnsafeUsage(buildTransformResult, source, envType)
              ) {
                deferFileViolation(envState, {
                  importer: file,
                  specifier: source,
                  resolved,
                  relativeResolved,
                  pattern: buildFileMatch.pattern,
                  useOriginalLocation: true,
                })
              }
            }

            continue
          }

          if (!specifierMatch) {
            continue
          }

          const resolved = await resolveAgainstImporter({
            envState,
            config,
            ctx,
            importerId: id,
            source,
            extensionlessResolver,
          })

          const runtimeId =
            config.command === 'build'
              ? ensureSilentMockModule(shared, envName)
              : ensureRuntimeMockModule({
                  shared,
                  envName,
                  mode: config.mockAccess,
                  env: envName,
                  importer: file,
                  specifier: source,
                })

          const replacement = ensureMockEdgeModule({
            shared,
            envName,
            payload: {
              exports: exportsBySource.get(source) ?? [],
              runtimeId,
              violation: {
                env: envName,
                envType,
                importer: file,
                specifier: source,
                ...(resolved ? { resolved } : {}),
                patternText: serializePattern(specifierMatch.pattern),
              },
            },
          })

          deniedSpecifierReplacements.set(source, replacement)
        }

        if (config.command === 'build') {
          for (const source of buildImportSources) {
            if (transformedImportSources.has(source)) {
              continue
            }

            if (matchesAny(source, matchers.specifiers)) {
              continue
            }

            const resolved = await resolveAgainstImporter({
              envState,
              config,
              ctx,
              importerId: id,
              source,
              extensionlessResolver,
            })

            if (!resolved) {
              continue
            }

            const relativeResolved = getImportProtectionRelativePath(
              config.root,
              resolved,
            )
            const buildFileMatch = checkFileDenial(relativeResolved, matchers)
            if (
              !buildFileMatch ||
              !hasOriginalUnsafeUsage(buildTransformResult, source, envType)
            ) {
              continue
            }

            deferFileViolation(envState, {
              importer: file,
              specifier: source,
              resolved,
              relativeResolved,
              pattern: buildFileMatch.pattern,
              useOriginalLocation: true,
            })
          }
        }

        if (deniedSpecifierReplacements.size === 0) {
          return ctx.code
        }

        const rewritten = rewriteDeniedImports(
          ctx.code,
          id,
          new Set(deniedSpecifierReplacements.keys()),
          (source) => deniedSpecifierReplacements.get(source) ?? source,
        )

        if (!rewritten) {
          return ctx.code
        }

        return {
          code: rewritten.code,
          map: normalizeSourceMap(rewritten.map) ?? null,
        }
      },
    )
  }

  api.processAssets(
    {
      stage: 'report',
      environments: opts.environments.map((environment) => environment.name),
    },
    async (context: ProcessAssetsContext) => {
      if (!config.enabled) {
        return
      }

      const envName = context.environment.name
      const envType = getImportProtectionEnvType(config, envName)
      const envState = getOrCreateEnvState(envStates, envName)
      const matchers = getRulesForEnvironment(config, envName)
      const processFileReadCache = new Map<
        string,
        Promise<string | undefined>
      >()
      const loadOriginalCodeFromCompilation: OriginalCodeLoader = (file) =>
        loadOriginalCode(
          processFileReadCache,
          file,
          context.compilation.inputFileSystem
            ? (target) =>
                loadOriginalCodeFromInputFileSystem(
                  context.compilation.inputFileSystem!,
                  target,
                )
            : () => Promise.resolve(undefined),
        )
      const allModules = Array.from(context.compilation.modules)
      const relevantModules = allModules.filter(isImportProtectionSourceModule)

      const provider = await buildTransformResultProvider({
        modules: relevantModules,
        root: config.root,
        loadOriginalCode: loadOriginalCodeFromCompilation,
        preloaded: envState.buildTransformResults,
      })
      const importLocCache = new ImportLocCache()
      const markerKindCache = new Map<
        string,
        Promise<'server' | 'client' | undefined>
      >()
      const { graph, edges } = buildCompilationGraph({
        compilation: context.compilation,
        modules: relevantModules,
      })
      const liveFileEdgeKeys = new Set(
        edges
          .filter((edge) => !!edge.specifier)
          .map(
            (edge) =>
              `${normalizeFilePath(edge.importer)}::${edge.specifier!}::${normalizeFilePath(edge.resolved)}`,
          ),
      )
      const survivingModules = new Set<string>()
      for (const module of relevantModules) {
        for (const candidate of buildResolutionCandidates(
          getModuleFile(module),
        )) {
          survivingModules.add(candidate)
        }
      }

      const didModuleSurvive = (id: string): boolean =>
        buildResolutionCandidates(id).some((candidate) =>
          survivingModules.has(candidate),
        )

      for (const module of relevantModules) {
        const payload = getMockEdgePayloadFromFile(getModuleFile(module))
        if (!payload) {
          continue
        }
        if (
          !shouldCheckImportProtectionImporter(
            config,
            payload.violation.importer,
          )
        ) {
          continue
        }

        const info = await buildViolationInfo({
          config,
          provider,
          graph,
          importLocCache,
          envName,
          envType,
          importer: payload.violation.importer,
          source: payload.violation.specifier,
          resolved: payload.violation.resolved,
          type: 'specifier',
          pattern: payload.violation.patternText,
          preferOriginalCode: true,
        })

        await reportViolation({
          config,
          envState,
          compilation: context.compilation,
          rspack: context.compiler.rspack,
          info,
        })
      }

      for (const edge of edges) {
        if (!edge.specifier) {
          continue
        }
        if (!shouldCheckImportProtectionImporter(config, edge.importer)) {
          continue
        }

        const relativeResolved = getImportProtectionRelativePath(
          config.root,
          edge.resolved,
        )
        if (isFileExcluded(relativeResolved, matchers)) {
          continue
        }
        const fileMatch = checkFileDenial(relativeResolved, matchers)
        if (fileMatch) {
          const info = await buildViolationInfo({
            config,
            provider,
            graph,
            importLocCache,
            envName,
            envType,
            importer: edge.importer,
            source: edge.specifier,
            resolved: edge.resolved,
            type: 'file',
            pattern: fileMatch.pattern,
          })

          await reportViolation({
            config,
            envState,
            compilation: context.compilation,
            rspack: context.compiler.rspack,
            info,
          })
          continue
        }

        const markerKind = await getMarkerKindForFile({
          config,
          provider,
          loadOriginalCode: loadOriginalCodeFromCompilation,
          markerKindCache,
          file: edge.resolved,
        })
        const violatesMarker =
          (envType === 'client' && markerKind === 'server') ||
          (envType === 'server' && markerKind === 'client')

        if (!violatesMarker) {
          continue
        }

        const info = await buildViolationInfo({
          config,
          provider,
          graph,
          importLocCache,
          envName,
          envType,
          importer: edge.importer,
          source: edge.specifier,
          resolved: edge.resolved,
          type: 'marker',
        })

        await reportViolation({
          config,
          envState,
          compilation: context.compilation,
          rspack: context.compiler.rspack,
          info,
        })
      }

      for (const violation of envState.deferredFileViolations) {
        const liveEdgeKey = `${normalizeFilePath(violation.importer)}::${violation.specifier}::${normalizeFilePath(violation.resolved)}`
        if (liveFileEdgeKeys.has(liveEdgeKey)) {
          continue
        }

        if (!didModuleSurvive(violation.resolved)) {
          continue
        }

        if (!didModuleSurvive(violation.importer)) {
          continue
        }

        const info = await buildViolationInfo({
          config,
          provider,
          graph,
          importLocCache,
          envName,
          envType,
          importer: violation.importer,
          source: violation.specifier,
          resolved: violation.resolved,
          type: 'file',
          pattern: violation.pattern,
          preferOriginalCode: violation.useOriginalLocation,
        })

        await reportViolation({
          config,
          envState,
          compilation: context.compilation,
          rspack: context.compiler.rspack,
          info,
        })
      }
    },
  )
}
