import { writeFileSync } from 'node:fs'
import { extname, resolve as resolvePath } from 'node:path'

import { SourceMapConsumer } from 'source-map'

import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from '../import-protection/defaults'
import { normalizePath } from '../utils'
import { ExtensionlessAbsoluteIdResolver } from '../import-protection/extensionlessAbsoluteIdResolver'
import { compileMatchers, matchesAny } from '../import-protection/matchers'
import {
  getImportProtectionEnvType,
  getImportProtectionRelativePath,
  getImportProtectionRulesForEnvironment,
  shouldCheckImportProtectionImporter,
} from '../import-protection/adapterUtils'
import {
  getImportSourcesFromResult,
  getMockExportNamesBySourceFromResult,
  getNamedExportsFromResult,
} from '../import-protection/analysis'
import { rewriteDeniedImports } from '../import-protection/rewrite'
import {
  buildCodeSnippet,
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
import type { FileMatchers } from '../import-protection/utils'
import type {
  SourceMapLike,
  TransformResult,
} from '../import-protection/sourceLocation'
import type { Loc, TraceStep, ViolationInfo } from '../import-protection/trace'
import type { CompileStartFrameworkOptions, GetConfigFn } from '../types'
import type {
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'
import type { RawSourceMap } from 'source-map'

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
type RspackDependency = Rspack.Dependency

type ImportProtectionMarkerKind = 'server' | 'client'
type ImportProtectionBuildInfo = {
  markerKind: ImportProtectionMarkerKind | null
}

const IMPORT_PROTECTION_BUILD_INFO_FIELD = 'tanstack.start.importProtection'
const EMPTY_IMPORT_PROTECTION_BUILD_INFO: ImportProtectionBuildInfo = {
  markerKind: null,
}

type PerfTiming = {
  count: number
  totalMs: number
  maxMs: number
}

type PerfCollector = {
  count: (name: string, value?: number) => void
  time: (name: string, startedAt: number) => void
  flush: (root: string, envName: string, phase: string) => void
}

function isPerfEnabled(): boolean {
  return (
    process.env.TSR_IMPORT_PROTECTION_PERF === '1' ||
    process.env.TSR_IMPORT_PROTECTION_PERF === 'true'
  )
}

function createPerfCollector(): PerfCollector {
  const counters = new Map<string, number>()
  const timings = new Map<string, PerfTiming>()
  const flushEnvironments = new Set<string>()
  let flushCount = 0

  return {
    count(name, value = 1) {
      counters.set(name, (counters.get(name) ?? 0) + value)
    },
    time(name, startedAt) {
      const duration = performance.now() - startedAt
      const timing = timings.get(name)
      if (timing) {
        timing.count++
        timing.totalMs += duration
        timing.maxMs = Math.max(timing.maxMs, duration)
      } else {
        timings.set(name, { count: 1, totalMs: duration, maxMs: duration })
      }
    },
    flush(root, envName, phase) {
      flushCount++
      flushEnvironments.add(envName)

      const payload = {
        adapter: 'rsbuild',
        root,
        phase,
        flushCount,
        flushEnvironments: Array.from(flushEnvironments).sort(),
        counters: Object.fromEntries(counters),
        timings: Object.fromEntries(
          Array.from(timings, ([name, timing]) => [
            name,
            {
              count: timing.count,
              totalMs: Number(timing.totalMs.toFixed(3)),
              avgMs: Number((timing.totalMs / timing.count).toFixed(3)),
              maxMs: Number(timing.maxMs.toFixed(3)),
            },
          ]),
        ),
      }

      const file = process.env.TSR_IMPORT_PROTECTION_PERF_FILE
      if (file) {
        writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)
      } else {
        console.warn(
          `[import-protection:perf] ${JSON.stringify(payload, null, 2)}`,
        )
      }
    },
  }
}

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
}

interface SharedState {
  root: string
  virtualModules: Map<string, string>
  vmPlugins: Record<string, RspackVirtualModulesPlugin>
  readyVmPlugins: Record<string, boolean>
  pendingWrites: Map<string, Map<string, string>>
  moduleByResource: Record<string, Map<string, RspackModule>>
}

interface CompilationEdge {
  dependency: RspackDependency
  importerModule: RspackModule
  specifier?: string
  resolved: string
  resolvedModule: RspackModule
}

interface CompilationEdgeIndex {
  edges: Array<CompilationEdge>
  edgeByKey: Map<string, CompilationEdge>
  edgesByModules: Map<string, Array<CompilationEdge>>
}

interface CompilationImportGraph {
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
}

interface CompilationTransformResultProvider {
  getTransformResult: (module: RspackModule) => TransformResult | undefined
}

// An identity-only snapshot of one module's active compilation connections.
// Derived paths, requests, locations, and diagnostic indexes live elsewhere.
interface CompilationImport {
  dependency: RspackDependency
  module: RspackModule
}

interface RspackModuleGraphNode {
  module: RspackModule
  imports: Array<CompilationImport>
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

interface ModuleGraphEdge {
  dependency: RspackDependency
  importer: RspackModule
  module: RspackModule
}

type CompilationViolationCandidate =
  | {
      type: 'specifier'
      payload: MockEdgePayload
      edge: ModuleGraphEdge
    }
  | {
      type: 'file'
      edge: ModuleGraphEdge
      source: string
      pattern: string | RegExp
    }
  | {
      type: 'marker'
      edge: ModuleGraphEdge
      source: string
    }

type ResolvedImportProtectionCheck =
  | { type: 'file'; fileMatch: FileMatchers['files'][number] }
  | { type: 'marker' }

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

export function getRsbuildResolvedImportProtectionCheck(
  relativeResolved: string,
  matchers: FileMatchers,
): ResolvedImportProtectionCheck | undefined {
  if (isFileExcluded(relativeResolved, matchers)) {
    return undefined
  }

  const fileMatch = matchers.files.find((matcher) =>
    matcher.test(relativeResolved),
  )
  if (fileMatch) {
    return { type: 'file', fileMatch }
  }

  return { type: 'marker' }
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

async function resolveAgainstImporter(opts: {
  envState: EnvRuntimeState
  config: PluginConfig
  ctx: TransformContext
  importerId: string
  source: string
  extensionlessResolver: ExtensionlessAbsoluteIdResolver
  perf?: PerfCollector
}): Promise<string | null> {
  const importerDir =
    opts.ctx.context ?? opts.importerId.replace(/[/\\][^/\\]*$/, '')
  const normalizedImporterDir = normalizeFilePath(importerDir)
  const cacheKey = `${normalizedImporterDir}:${opts.source}`

  if (opts.envState.resolveCache.has(cacheKey)) {
    opts.perf?.count('resolve.cached')
    return opts.envState.resolveCache.get(cacheKey) ?? null
  }

  const startedAt = opts.perf ? performance.now() : 0
  opts.perf?.count('resolve.calls')
  const resolved = await new Promise<string | null>((resolve, reject) => {
    opts.ctx.resolve(importerDir, opts.source, (error, result) => {
      if (error) {
        reject(error)
        return
      }

      resolve(typeof result === 'string' ? result : null)
    })
  })
    .catch(() => null)
    .finally(() => {
      if (opts.perf) {
        opts.perf.time('resolve', startedAt)
      }
    })

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

function getModuleResource(module: RspackModule): string {
  const resourceResolveData = (
    module as RspackModule & {
      resourceResolveData?: { resource?: string }
    }
  ).resourceResolveData

  return normalizeFilePath(resourceResolveData?.resource ?? module.identifier())
}

function getMarkerKindFromBuildInfo(
  module: RspackModule,
): ImportProtectionMarkerKind | undefined {
  const metadata = module.buildInfo[IMPORT_PROTECTION_BUILD_INFO_FIELD]
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  if (!('markerKind' in metadata)) {
    return undefined
  }

  return metadata.markerKind === 'server' || metadata.markerKind === 'client'
    ? metadata.markerKind
    : undefined
}

function getDependencyLocation(dependency: RspackDependency): Loc | undefined {
  const loc = dependency.loc
  if (!loc || !('start' in loc)) {
    return undefined
  }

  const start = loc.start
  const line = start.line
  const column = start.column
  if (typeof line !== 'number') {
    return undefined
  }

  return {
    line,
    column: typeof column === 'number' ? column : 1,
  }
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

function buildTransformResultProvider(opts: {
  root: string
  perf?: PerfCollector
}): CompilationTransformResultProvider {
  const resultByModule = new WeakMap<RspackModule, TransformResult>()
  const missingSource = new WeakSet<RspackModule>()

  return {
    getTransformResult(module) {
      if (missingSource.has(module)) {
        return undefined
      }

      const cached = resultByModule.get(module)
      if (cached) {
        return cached
      }

      opts.perf?.count('processAssets.provider.modulesLoaded')
      const source = module.originalSource()
      if (!source) {
        missingSource.add(module)
        return undefined
      }

      const sourceAndMapStartedAt = opts.perf ? performance.now() : 0
      const sourceAndMap = source.sourceAndMap()
      if (opts.perf) {
        opts.perf.time(
          'processAssets.provider.sourceAndMap',
          sourceAndMapStartedAt,
        )
      }
      const resource = getModuleResource(module)
      const code = String(sourceAndMap.source)
      const map = normalizeSourceMap(sourceAndMap.map as SourceMapLike | null)
      const originalCodeStartedAt = opts.perf ? performance.now() : 0
      const originalCode = map?.sourcesContent
        ? pickOriginalCodeFromSourcesContent(map, resource, opts.root)
        : undefined
      if (opts.perf) {
        opts.perf.time(
          'processAssets.provider.originalCode',
          originalCodeStartedAt,
        )
      }

      const result: TransformResult = {
        code,
        filename: resource,
        map,
        originalCode,
        perf: opts.perf,
      }
      resultByModule.set(module, result)
      return result
    },
  }
}

function getCompilationEdgeKey(
  importer: string,
  resolved: string,
  specifier: string | undefined,
): string {
  return `${importer}\0${resolved}\0${specifier ?? ''}`
}

function getCompilationModulesKey(importer: string, resolved: string): string {
  return `${importer}\0${resolved}`
}

function addEntryModulesToGraph(opts: {
  compilation: RspackCompilation
  importGraph: ImportGraph
}): void {
  for (const entry of opts.compilation.entries.values()) {
    for (const dependency of entry.dependencies) {
      const connection = opts.compilation.moduleGraph.getConnection(dependency)
      const module = connection?.module
      if (!module) {
        continue
      }
      opts.importGraph.addEntry(getModuleResource(module))
    }
  }
}

function forEachActiveModules(opts: {
  compilation: RspackCompilation
  modules: Array<RspackModule>
  visitNode: (node: RspackModuleGraphNode) => void
}): Array<RspackModuleGraphNode> {
  const nodes: Array<RspackModuleGraphNode> = []

  for (const module of opts.modules) {
    const imports: Array<CompilationImport> = []
    const importedModules = new WeakSet<RspackModule>()
    const connections =
      opts.compilation.moduleGraph.getOutgoingConnectionsInOrder(module)

    for (const connection of connections) {
      const connectedModule = connection.module
      if (!connectedModule) {
        continue
      }

      if (connection.getActiveState(undefined) !== true) {
        continue
      }

      // Only consider modules that are not errored
      if ('error' in connectedModule && connectedModule.error) {
        continue
      }

      if (importedModules.has(connectedModule)) {
        continue
      }
      importedModules.add(connectedModule)

      imports.push({
        dependency: connection.dependency,
        module: connectedModule,
      })
    }

    const node = { module, imports }
    nodes.push(node)
    opts.visitNode(node)
  }

  return nodes
}

interface PendingMarkerImport {
  importer: RspackModule
  imported: CompilationImport
  source: string
}

type FileViolationCandidate = Extract<
  CompilationViolationCandidate,
  { type: 'file' }
>

interface CompilationViolationScanner {
  visitNode: (node: RspackModuleGraphNode) => void
  finish: () => Array<CompilationViolationCandidate>
}

function createCompilationViolationScanner(opts: {
  config: PluginConfig
  envType: 'client' | 'server'
  matchers: FileMatchers
  shouldCheckImporter: (importer: string) => boolean
}): CompilationViolationScanner {
  const mockCandidates: Array<CompilationViolationCandidate> = []
  const regularChecks: Array<FileViolationCandidate | PendingMarkerImport> = []
  const importSpecifiersByModule = new WeakMap<RspackModule, Set<string>>()
  const mockPayloadByModule = new WeakMap<
    RspackModule,
    MockEdgePayload | null
  >()

  const getMockPayload = (module: RspackModule) => {
    const cached = mockPayloadByModule.get(module)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const payload = getMockEdgePayloadFromFile(getModuleResource(module))
    mockPayloadByModule.set(module, payload ?? null)
    return payload
  }

  return {
    visitNode(node) {
      const importer = getModuleResource(node.module)
      if (!isImportProtectionSourceFile(importer)) {
        return
      }

      const shouldCheckImporter = opts.shouldCheckImporter(importer)
      const importSpecifiers = new Set<string>()

      for (const imported of node.imports) {
        const source = imported.dependency.request
        if (source) {
          importSpecifiers.add(source)
        }

        if (!shouldCheckImporter) {
          continue
        }

        const payload = getMockPayload(imported.module)
        if (payload?.violation.importer === importer) {
          mockCandidates.push({
            type: 'specifier',
            payload,
            edge: {
              importer: node.module,
              module: imported.module,
              dependency: imported.dependency,
            },
          })
        }

        if (!source) {
          continue
        }

        const resolved = getModuleResource(imported.module)
        const relativeResolved = getImportProtectionRelativePath(
          opts.config.root,
          resolved,
        )
        const importProtectionCheck = getRsbuildResolvedImportProtectionCheck(
          relativeResolved,
          opts.matchers,
        )
        if (!importProtectionCheck) {
          continue
        }

        if (importProtectionCheck.type === 'file') {
          regularChecks.push({
            type: 'file',
            edge: {
              importer: node.module,
              module: imported.module,
              dependency: imported.dependency,
            },
            source,
            pattern: importProtectionCheck.fileMatch.pattern,
          })
        } else {
          regularChecks.push({ importer: node.module, imported, source })
        }
      }

      importSpecifiersByModule.set(node.module, importSpecifiers)
    },
    finish() {
      const candidates = [...mockCandidates]

      for (const check of regularChecks) {
        if ('type' in check) {
          candidates.push(check)
          continue
        }

        const markerKind = getMarkerKindForModule({
          config: opts.config,
          importSpecifiersByModule,
          module: check.imported.module,
        })
        const violatesMarker =
          (opts.envType === 'client' && markerKind === 'server') ||
          (opts.envType === 'server' && markerKind === 'client')
        if (!violatesMarker) {
          continue
        }

        candidates.push({
          type: 'marker',
          edge: {
            importer: check.importer,
            module: check.imported.module,
            dependency: check.imported.dependency,
          },
          source: check.source,
        })
      }

      return candidates
    },
  }
}

function buildCompilationImportGraph(opts: {
  compilation: RspackCompilation
  nodes: Array<RspackModuleGraphNode>
}): CompilationImportGraph {
  const importGraph = new ImportGraph()
  const edges: Array<CompilationEdge> = []
  const edgeByKey = new Map<string, CompilationEdge>()
  const edgesByModules = new Map<string, Array<CompilationEdge>>()

  addEntryModulesToGraph({
    compilation: opts.compilation,
    importGraph,
  })

  for (const node of opts.nodes) {
    const importer = getModuleResource(node.module)
    for (const imported of node.imports) {
      const resolved = getModuleResource(imported.module)
      const specifier = imported.dependency.request
      const edge = {
        importerModule: node.module,
        specifier,
        resolved,
        resolvedModule: imported.module,
        dependency: imported.dependency,
      }
      edges.push(edge)
      importGraph.addEdge(resolved, importer, specifier)

      const edgeKey = getCompilationEdgeKey(importer, resolved, specifier)
      if (!edgeByKey.has(edgeKey)) {
        edgeByKey.set(edgeKey, edge)
      }

      const modulesKey = getCompilationModulesKey(importer, resolved)
      const moduleEdges = edgesByModules.get(modulesKey)
      if (moduleEdges) {
        moduleEdges.push(edge)
      } else {
        edgesByModules.set(modulesKey, [edge])
      }
    }
  }

  return {
    importGraph,
    edgeIndex: {
      edges,
      edgeByKey,
      edgesByModules,
    },
  }
}

function findCompilationEdge(
  edgeIndex: CompilationEdgeIndex,
  importer: string,
  resolved: string,
  specifier?: string,
): CompilationEdge | undefined {
  if (specifier) {
    const exact = edgeIndex.edgeByKey.get(
      getCompilationEdgeKey(importer, resolved, specifier),
    )
    if (exact) {
      return exact
    }
  }

  return edgeIndex.edgesByModules.get(
    getCompilationModulesKey(importer, resolved),
  )?.[0]
}

async function mapCompilationLocation(opts: {
  provider: CompilationTransformResultProvider
  importer: string
  importerModule: RspackModule
  generatedLoc?: Loc
}): Promise<Loc | undefined> {
  if (!opts.generatedLoc) {
    return undefined
  }

  const map = opts.provider.getTransformResult(opts.importerModule)?.map
  if (!map) {
    return undefined
  }

  const fallback: Loc = {
    file: normalizeFilePath(opts.importer),
    line: opts.generatedLoc.line,
    column: opts.generatedLoc.column,
  }
  const consumer = await getCompilationSourceMapConsumer(map)
  if (!consumer) {
    return fallback
  }

  try {
    const original = consumer.originalPositionFor({
      line: opts.generatedLoc.line,
      column: Math.max(0, opts.generatedLoc.column - 1),
    })
    if (original.line != null && original.column != null) {
      return {
        file: original.source
          ? normalizeFilePath(original.source)
          : fallback.file,
        line: original.line,
        column: original.column + 1,
      }
    }
  } catch {
    // Malformed sourcemap
  }

  return fallback
}

const compilationSourceMapConsumerCache = new WeakMap<
  object,
  Promise<SourceMapConsumer | null>
>()

function getCompilationSourceMapConsumer(
  map: SourceMapLike,
): Promise<SourceMapConsumer | null> {
  const cached = compilationSourceMapConsumerCache.get(map)
  if (cached) {
    return cached
  }

  const consumer = (async () => {
    try {
      const rawMap: RawSourceMap = {
        ...map,
        file: map.file ?? '',
        version: Number(map.version),
        sourcesContent: map.sourcesContent?.map((source) => source ?? '') ?? [],
      }
      return await new SourceMapConsumer(rawMap)
    } catch {
      return null
    }
  })()
  compilationSourceMapConsumerCache.set(map, consumer)
  return consumer
}

async function rebuildAndAnnotateTrace(opts: {
  provider: CompilationTransformResultProvider
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
  importer: string
  specifier: string
  importerLoc?: Loc
  maxTraceDepth: number
}): Promise<Array<TraceStep>> {
  const trace = buildTrace(opts.importGraph, opts.importer, opts.maxTraceDepth)

  for (let i = 0; i < trace.length - 1; i++) {
    const step = trace[i]!
    const next = trace[i + 1]!
    const edge = findCompilationEdge(
      opts.edgeIndex,
      step.file,
      next.file,
      step.specifier,
    )
    const loc = edge
      ? await mapCompilationLocation({
          provider: opts.provider,
          importer: step.file,
          importerModule: edge.importerModule,
          generatedLoc: getDependencyLocation(edge.dependency),
        })
      : undefined
    if (loc) {
      step.line = loc.line
      step.column = loc.column
    }
  }

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
  provider: CompilationTransformResultProvider
  importGraph: ImportGraph
  edgeIndex: CompilationEdgeIndex
  perf?: PerfCollector
  envName: string
  envType: 'client' | 'server'
  importer: string
  importerModule: RspackModule
  source: string
  resolved?: string
  importLoc?: Loc
  type: 'specifier' | 'file' | 'marker'
  pattern?: string | RegExp
}): Promise<ViolationInfo> {
  const startedAt = opts.perf ? performance.now() : 0
  opts.perf?.count('violations.enriched')

  const importerLocStartedAt = opts.perf ? performance.now() : 0
  const importerLoc = await mapCompilationLocation({
    provider: opts.provider,
    importer: opts.importer,
    importerModule: opts.importerModule,
    generatedLoc: opts.importLoc,
  })
  if (opts.perf) {
    opts.perf.time('violations.resolveImporterLocation', importerLocStartedAt)
  }

  const traceStartedAt = opts.perf ? performance.now() : 0
  const trace = await rebuildAndAnnotateTrace({
    provider: opts.provider,
    importGraph: opts.importGraph,
    edgeIndex: opts.edgeIndex,
    importer: opts.importer,
    specifier: opts.source,
    importerLoc,
    maxTraceDepth: opts.config.maxTraceDepth,
  })
  if (opts.perf) {
    opts.perf.time('violations.trace', traceStartedAt)
  }

  const snippetStartedAt = opts.perf ? performance.now() : 0
  const snippet = importerLoc
    ? buildCodeSnippet(
        {
          getTransformResult: () =>
            opts.provider.getTransformResult(opts.importerModule),
        },
        opts.importer,
        importerLoc,
      )
    : undefined
  if (opts.perf && importerLoc) {
    opts.perf.time('violations.snippet', snippetStartedAt)
  }

  const info = {
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

  if (opts.perf) {
    opts.perf.time('violations.enrich', startedAt)
  }

  return info
}

function getMarkerKindForModule(opts: {
  config: PluginConfig
  importSpecifiersByModule: WeakMap<RspackModule, Set<string>>
  module: RspackModule
}): 'server' | 'client' | undefined {
  const file = getModuleResource(opts.module)
  if (!isImportProtectionSourceFile(file)) {
    return undefined
  }

  const markerKind = getMarkerKindFromBuildInfo(opts.module)
  if (markerKind) {
    return markerKind
  }

  const imports = opts.importSpecifiersByModule.get(opts.module)
  let hasServerOnly = false
  let hasClientOnly = false
  for (const source of imports ?? []) {
    hasServerOnly ||= opts.config.markerSpecifiers.serverOnly.has(source)
    hasClientOnly ||= opts.config.markerSpecifiers.clientOnly.has(source)
  }

  if (hasServerOnly && !hasClientOnly) {
    return 'server'
  }
  if (hasClientOnly && !hasServerOnly) {
    return 'client'
  }
  return undefined
}

async function reportViolation(opts: {
  config: PluginConfig
  envState: EnvRuntimeState
  compilation: RspackCompilation
  rspack: RspackNamespace
  perf?: PerfCollector
  info: ViolationInfo
}): Promise<void> {
  const key = dedupeKey(opts.info)
  if (
    opts.config.logMode !== 'always' &&
    opts.envState.seenViolations.has(key)
  ) {
    opts.perf?.count('violations.deduped')
    return
  }

  opts.envState.seenViolations.add(key)
  opts.perf?.count('violations.reported')

  if (opts.config.onViolation) {
    const startedAt = opts.perf ? performance.now() : 0
    const result = await opts.config.onViolation(opts.info)
    if (opts.perf) {
      opts.perf.time('violations.onViolation', startedAt)
    }
    if (result === false) {
      opts.perf?.count('violations.suppressed')
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
  const perf = isPerfEnabled() ? createPerfCollector() : undefined
  const extensionlessResolver = new ExtensionlessAbsoluteIdResolver()
  const envStates = new Map<string, EnvRuntimeState>()
  const shouldCheckImporterCache = new Map<string, boolean>()
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
    pendingWrites: new Map(),
    moduleByResource: {},
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

  function shouldCheckImporter(file: string): boolean {
    const normalizedFile = normalizeFilePath(file)
    const cached = shouldCheckImporterCache.get(normalizedFile)
    if (cached !== undefined) {
      perf?.count('shouldCheckImporter.cached')
      return cached
    }

    const result = shouldCheckImportProtectionImporter(config, normalizedFile)
    shouldCheckImporterCache.set(normalizedFile, result)
    return result
  }

  api.onBeforeBuild(() => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    shouldCheckImporterCache.clear()
    envStates.clear()
    if (perf) {
      perf.time('onBeforeBuild', startedAt)
    }
  })

  api.onBeforeDevCompile(() => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()
    clearNormalizeFilePathCache()
    extensionlessResolver.clear()
    shouldCheckImporterCache.clear()

    for (const envState of envStates.values()) {
      envState.resolveCache.clear()
    }
    if (perf) {
      perf.time('onBeforeDevCompile', startedAt)
    }
  })

  api.modifyRspackConfig((rspackConfig, utils) => {
    const startedAt = perf ? performance.now() : 0
    applyUserConfig()

    const envName = utils.environment.name
    const VMP = utils.rspack.experiments.VirtualModulesPlugin
    const vmPlugin = new VMP({})

    shared.vmPlugins[envName] = vmPlugin
    shared.readyVmPlugins[envName] = false
    const moduleByResource = new Map<string, RspackModule>()
    shared.moduleByResource[envName] = moduleByResource

    rspackConfig.plugins.push(vmPlugin)
    rspackConfig.plugins.push({
      apply(compiler: Rspack.Compiler) {
        compiler.hooks.compilation.tap(
          'TanStackStartImportProtectionBuildInfo',
          (compilation) => {
            utils.rspack.NormalModule.getCompilationHooks(
              compilation,
            ).loader.tap(
              'TanStackStartImportProtectionBuildInfo',
              (loaderContext, module) => {
                if (!isImportProtectionSourceFile(loaderContext.resourcePath)) {
                  return
                }

                moduleByResource.set(loaderContext.resource, module)
              },
            )
          },
        )

        compiler.hooks.compile.tap(
          'TanStackStartImportProtectionModuleCleanup',
          () => moduleByResource.clear(),
        )

        compiler.hooks.thisCompilation.tap(
          'TanStackStartImportProtectionVirtualModulesReady',
          () => {
            shared.readyVmPlugins[envName] = true
            flushPendingWrites(shared, envName)
          },
        )
      },
    })
    if (perf) {
      perf.time('modifyRspackConfig', startedAt)
    }
  })

  for (const environment of opts.environments) {
    api.transform(
      {
        test: /\.[cm]?[tj]sx?$/,
        environments: [environment.name],
        order: 'post',
      },
      async (ctx) => {
        const startedAt = perf ? performance.now() : 0
        perf?.count('transform.calls')
        perf?.count(`transform.env.${environment.name}`)

        try {
          const envName = environment.name
          const id = ctx.resource
          const moduleByResource = shared.moduleByResource[envName]
          const module = moduleByResource?.get(id)
          moduleByResource?.delete(id)

          if (module) {
            module.buildInfo[IMPORT_PROTECTION_BUILD_INFO_FIELD] =
              EMPTY_IMPORT_PROTECTION_BUILD_INFO
          }

          if (!config.enabled) {
            return ctx.code
          }

          const envType = getImportProtectionEnvType(config, envName)
          const envState = getOrCreateEnvState(envStates, envName)
          const file = normalizeFilePath(ctx.resourcePath)

          if (!shouldCheckImporter(file)) {
            perf?.count('transform.skippedImporter')
            return ctx.code
          }

          const matchers = getRulesForEnvironment(config, envName)
          const relativeFile = getImportProtectionRelativePath(
            config.root,
            file,
          )
          const transformResult: TransformResult = {
            code: ctx.code,
            filename: file,
            map: undefined,
            originalCode: undefined,
            perf,
          }
          const importSources = getImportSourcesFromResult(transformResult)
          perf?.count('transform.importSources', importSources.length)

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

          if (module && markerKind) {
            module.buildInfo[IMPORT_PROTECTION_BUILD_INFO_FIELD] = {
              markerKind,
            }
          }

          const fileMatch = checkFileDenial(relativeFile, matchers)
          const markerViolation =
            (envType === 'client' && markerKind === 'server') ||
            (envType === 'server' && markerKind === 'client')

          if (fileMatch || markerViolation) {
            let exportNames: Array<string> = []

            try {
              exportNames = getNamedExportsFromResult(transformResult)
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
          let exportsBySource: Map<string, Array<string>> | undefined
          const getExportsBySource = () => {
            if (exportsBySource) {
              return exportsBySource
            }

            try {
              exportsBySource =
                getMockExportNamesBySourceFromResult(transformResult)
            } catch {
              exportsBySource = new Map<string, Array<string>>()
            }
            return exportsBySource
          }

          for (const source of importSources) {
            const specifierMatch = matchesAny(source, matchers.specifiers)
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
              perf,
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
                exports: getExportsBySource().get(source) ?? [],
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
        } finally {
          if (perf) {
            perf.time('transform', startedAt)
          }
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
      const envName = context.environment.name
      const startedAt = perf ? performance.now() : 0
      perf?.count('processAssets.calls')
      perf?.count(`processAssets.env.${envName}`)

      try {
        if (!config.enabled) {
          return
        }

        const envType = getImportProtectionEnvType(config, envName)
        const envState = getOrCreateEnvState(envStates, envName)
        const matchers = getRulesForEnvironment(config, envName)
        const allModules = Array.from(context.compilation.modules)
        perf?.count('processAssets.modules.total', allModules.length)

        const violationScanner = createCompilationViolationScanner({
          config,
          envType,
          matchers,
          shouldCheckImporter,
        })
        const forEachStartedAt = perf ? performance.now() : 0
        const moduleGraphNodes: Array<RspackModuleGraphNode> = []
        forEachActiveModules({
          compilation: context.compilation,
          modules: allModules,
          visitNode(node) {
            moduleGraphNodes.push(node)
            violationScanner.visitNode(node)
          },
        })
        if (perf) {
          perf.time('processAssets.forEachActiveModules', forEachStartedAt)
          perf.count('processAssets.modules.collected', moduleGraphNodes.length)
          perf.count(
            'processAssets.imports.active',
            moduleGraphNodes.reduce(
              (total, node) => total + node.imports.length,
              0,
            ),
          )
        }

        const candidateStartedAt = perf ? performance.now() : 0
        const candidates = violationScanner.finish()
        if (perf) {
          perf.time('processAssets.candidates.finish', candidateStartedAt)
          perf.count('processAssets.candidates', candidates.length)
        }

        if (candidates.length === 0) {
          return
        }

        const graphStartedAt = perf ? performance.now() : 0
        const { importGraph, edgeIndex } = buildCompilationImportGraph({
          compilation: context.compilation,
          nodes: moduleGraphNodes,
        })
        if (perf) {
          perf.time('processAssets.importGraph.build', graphStartedAt)
          perf.count('processAssets.importGraph.edges', edgeIndex.edges.length)
        }

        let provider: CompilationTransformResultProvider | undefined
        const getProvider = () => {
          if (!provider) {
            const providerStartedAt = perf ? performance.now() : 0
            provider = buildTransformResultProvider({
              root: config.root,
              perf,
            })
            if (perf) {
              perf.time('processAssets.provider.build', providerStartedAt)
            }
          }
          return provider
        }

        for (const candidate of candidates) {
          let info: ViolationInfo

          if (candidate.type === 'specifier') {
            const { payload } = candidate
            info = await buildViolationInfo({
              config,
              provider: getProvider(),
              importGraph,
              edgeIndex,
              perf,
              envName,
              envType,
              importer: payload.violation.importer,
              importerModule: candidate.edge.importer,
              source: payload.violation.specifier,
              resolved: payload.violation.resolved,
              importLoc: getDependencyLocation(candidate.edge.dependency),
              type: 'specifier',
              pattern: payload.violation.patternText,
            })
          } else {
            const { edge, source } = candidate
            const importer = getModuleResource(edge.importer)
            const resolved = getModuleResource(edge.module)
            info = await buildViolationInfo({
              config,
              provider: getProvider(),
              importGraph,
              edgeIndex,
              perf,
              envName,
              envType,
              importer,
              importerModule: edge.importer,
              source,
              resolved,
              importLoc: getDependencyLocation(edge.dependency),
              type: candidate.type,
              ...(candidate.type === 'file'
                ? { pattern: candidate.pattern }
                : {}),
            })
          }

          await reportViolation({
            config,
            envState,
            compilation: context.compilation,
            rspack: context.compiler.rspack,
            perf,
            info,
          })
        }
      } finally {
        if (perf) {
          perf.time('processAssets', startedAt)
          perf.flush(config.root, envName, 'processAssets')
        }
      }
    },
  )
}
