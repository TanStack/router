import { normalizePath } from 'vite'

import { resolveViteId } from '../utils'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { SERVER_FN_LOOKUP } from '../start-compiler-plugin/plugin'
import { ImportGraph, buildTrace, formatViolation } from './trace'
import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from './defaults'
import { findPostCompileUsagePos } from './postCompileUsage'
import { compileMatchers, matchesAny } from './matchers'
import {
  clearNormalizeFilePathCache,
  dedupePatterns,
  escapeRegExp,
  extractImportSources,
  getOrCreate,
  normalizeFilePath,
  relativizePath,
} from './utils'
import { collectMockExportNamesBySource } from './rewriteDeniedImports'
import {
  MARKER_PREFIX,
  MOCK_EDGE_PREFIX,
  MOCK_MODULE_ID,
  MOCK_RUNTIME_PREFIX,
  RESOLVED_MARKER_PREFIX,
  RESOLVED_MOCK_EDGE_PREFIX,
  RESOLVED_MOCK_MODULE_ID,
  RESOLVED_MOCK_RUNTIME_PREFIX,
  loadMarkerModule,
  loadMockEdgeModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
  makeMockEdgeModuleId,
  mockRuntimeModuleIdFromViolation,
} from './virtualModules'
import {
  ImportLocCache,
  addTraceImportLocations,
  buildCodeSnippet,
  buildLineIndex,
  clearImportPatternCache,
  findImportStatementLocationFromTransformed,
  findPostCompileUsageLocation,
  pickOriginalCodeFromSourcesContent,
} from './sourceLocation'
import type { PluginOption, ViteDevServer } from 'vite'
import type { CompiledMatcher } from './matchers'
import type { Loc, TraceStep, ViolationInfo } from './trace'
import type {
  SourceMapLike,
  TransformResult,
  TransformResultProvider,
} from './sourceLocation'
import type {
  ImportProtectionBehavior,
  ImportProtectionOptions,
} from '../schema'
import type { CompileStartFrameworkOptions, GetConfigFn } from '../types'

const SERVER_FN_LOOKUP_QUERY = '?' + SERVER_FN_LOOKUP
const RESOLVED_MARKER_SERVER_ONLY = resolveViteId(`${MARKER_PREFIX}server-only`)
const RESOLVED_MARKER_CLIENT_ONLY = resolveViteId(`${MARKER_PREFIX}client-only`)

const IMPORT_PROTECTION_DEBUG =
  process.env.TSR_IMPORT_PROTECTION_DEBUG === '1' ||
  process.env.TSR_IMPORT_PROTECTION_DEBUG === 'true'
const IMPORT_PROTECTION_DEBUG_FILTER =
  process.env.TSR_IMPORT_PROTECTION_DEBUG_FILTER

function debugLog(...args: Array<unknown>) {
  if (!IMPORT_PROTECTION_DEBUG) return
  console.warn('[import-protection:debug]', ...args)
}

/** Check if a value matches the debug filter (when set). */
function matchesDebugFilter(...values: Array<string>): boolean {
  if (!IMPORT_PROTECTION_DEBUG_FILTER) return true
  return values.some((v) => v.includes(IMPORT_PROTECTION_DEBUG_FILTER))
}

export { RESOLVED_MOCK_MODULE_ID } from './virtualModules'
export { rewriteDeniedImports } from './rewriteDeniedImports'
export { dedupePatterns, extractImportSources } from './utils'
export type { Pattern } from './utils'

/**
 * Immutable plugin configuration — set once in `configResolved`, never mutated
 * per-env or per-request afterward.
 */
interface PluginConfig {
  enabled: boolean
  root: string
  command: 'build' | 'serve'
  srcDirectory: string
  framework: CompileStartFrameworkOptions

  /** Absolute, query-free entry file ids used for trace roots. */
  entryFiles: Array<string>

  effectiveBehavior: ImportProtectionBehavior
  mockAccess: 'error' | 'warn' | 'off'
  logMode: 'once' | 'always'
  maxTraceDepth: number

  compiledRules: {
    client: {
      specifiers: Array<CompiledMatcher>
      files: Array<CompiledMatcher>
    }
    server: {
      specifiers: Array<CompiledMatcher>
      files: Array<CompiledMatcher>
    }
  }
  includeMatchers: Array<CompiledMatcher>
  excludeMatchers: Array<CompiledMatcher>
  ignoreImporterMatchers: Array<CompiledMatcher>

  markerSpecifiers: { serverOnly: Set<string>; clientOnly: Set<string> }
  envTypeMap: Map<string, 'client' | 'server'>

  onViolation?: (info: ViolationInfo) => boolean | void
}

/**
 * Per-Vite-environment mutable state.  One instance per environment name,
 * stored in `envStates: Map<string, EnvState>`.
 *
 * All caches that previously lived on `PluginState` with `${envName}:` key
 * prefixes now live here without any prefix.
 */
interface EnvState {
  graph: ImportGraph
  /** Specifiers that resolved to the mock module (for transform-time rewriting). */
  deniedSources: Set<string>
  /** Per-importer denied edges (for dev ESM mock modules). */
  deniedEdges: Map<string, Set<string>>
  /**
   * During `vite dev` in mock mode, we generate a per-importer mock module that
   * exports the names the importer expects.
   * Populated in the transform hook (no disk reads).
   */
  mockExportsByImporter: Map<string, Map<string, Array<string>>>

  /** Resolve cache.  Key: `${normalizedImporter}:${source}` (no env prefix). */
  resolveCache: Map<string, string | null>
  /** Reverse index: file path → Set of resolveCache keys involving that file. */
  resolveCacheByFile: Map<string, Set<string>>

  /** Import location cache.  Key: `${importerFile}::${source}`. */
  importLocCache: ImportLocCache

  /** Deduplication of logged violations (no env prefix in key). */
  seenViolations: Set<string>

  /**
   * Modules transitively loaded during a `fetchModule(?SERVER_FN_LOOKUP)` call.
   * In dev mode the compiler calls `fetchModule(id + '?' + SERVER_FN_LOOKUP)` to
   * analyse a module's exports.  The direct target carries the query parameter so
   * `isPreTransformResolve` is `true`.  But Vite also resolves the target's own
   * imports (and their imports, etc.) with the plain file path as the importer —
   * those would otherwise fire false-positive violations.
   *
   * We record every module resolved while walking a SERVER_FN_LOOKUP chain so
   * that their child imports are also treated as pre-transform resolves.
   */
  serverFnLookupModules: Set<string>

  /** Transform result cache (code + composed sourcemap + original source). */
  transformResultCache: Map<string, TransformResult>
  /** Reverse index: physical file path → Set of transformResultCache keys. */
  transformResultKeysByFile: Map<string, Set<string>>

  /** Cached provider that reads from {@link transformResultCache}. */
  transformResultProvider: TransformResultProvider

  /**
   * Post-transform resolved imports.  Populated by the transform-cache hook
   * after resolving every import source found in the transformed code.
   * Key: transform cache key (normalised module ID incl. query params).
   * Value: set of resolved child file paths.
   */
  postTransformImports: Map<string, Set<string>>

  /**
   * Whether a `resolveId` call without an importer has been observed for this
   * environment since `buildStart`.  Vite calls `resolveId(source, undefined)`
   * for true entry modules during a cold start.  On warm start (`.vite` cache
   * exists), Vite reuses its module graph and does NOT call `resolveId` for
   * entries, so this stays `false`.
   *
   * When `false`, the import graph is considered unreliable (edges may be
   * missing) and violations are reported immediately instead of deferred.
   */
  hasSeenEntry: boolean

  /**
   * Violations deferred in dev mock mode.  Keyed by the violating importer's
   * normalized file path.  Violations are confirmed or discarded by the
   * transform-cache hook once enough post-transform data is available to
   * determine whether the importer is still reachable from an entry point.
   */
  pendingViolations: Map<string, Array<PendingViolation>>
}

interface PendingViolation {
  info: ViolationInfo
  /** The mock module ID that resolveId already returned for this violation. */
  mockReturnValue: string
}

/**
 * Intentionally cross-env shared mutable state.
 *
 * A file's `'use server'`/`'use client'` directive is inherent to the file
 * content, not the environment that happens to discover it first.
 */
interface SharedState {
  fileMarkerKind: Map<string, 'server' | 'client'>
}

export interface ImportProtectionPluginOptions {
  getConfig: GetConfigFn
  framework: CompileStartFrameworkOptions
  environments: Array<{ name: string; type: 'client' | 'server' }>
  providerEnvName: string
}

export function importProtectionPlugin(
  opts: ImportProtectionPluginOptions,
): PluginOption {
  let devServer: ViteDevServer | null = null

  type ModuleGraphNode = {
    id?: string | null
    url?: string
    importers: Set<ModuleGraphNode>
  }

  /**
   * Build an import trace using Vite's per-environment module graph, which
   * is authoritative even on warm starts when the plugin's own ImportGraph
   * may be incomplete (Vite skips resolveId for cached modules).
   */
  function buildTraceFromModuleGraph(
    envName: string,
    env: EnvState,
    targetFile: string,
  ): Array<TraceStep> | null {
    if (!devServer) return null
    const environment = devServer.environments[envName]
    if (!environment) return null

    const file = normalizeFilePath(targetFile)
    const start = environment.moduleGraph.getModuleById(file)
    if (!start) return null

    // Resolve a module graph node to its normalized file path once and
    // cache the result so BFS + reconstruction don't recompute.
    const nodeIds = new Map<ModuleGraphNode, string>()
    function nodeId(n: ModuleGraphNode): string {
      let cached = nodeIds.get(n)
      if (cached === undefined) {
        cached = n.id
          ? normalizeFilePath(n.id)
          : n.url
            ? normalizeFilePath(n.url)
            : ''
        nodeIds.set(n, cached)
      }
      return cached
    }

    const queue: Array<ModuleGraphNode> = [start]
    const visited = new Set<ModuleGraphNode>([start])
    const parent = new Map<ModuleGraphNode, ModuleGraphNode>()

    let entryRoot: ModuleGraphNode | null = null
    let fallbackRoot: ModuleGraphNode | null = null
    let qi = 0
    while (qi < queue.length) {
      const node = queue[qi++]!
      const id = nodeId(node)

      if (id && env.graph.entries.has(id)) {
        entryRoot = node
        break
      }

      const importers = node.importers
      if (importers.size === 0) {
        if (!fallbackRoot) fallbackRoot = node
        continue
      }

      for (const imp of importers) {
        if (visited.has(imp)) continue
        visited.add(imp)
        parent.set(imp, node)
        queue.push(imp)
      }
    }

    const root = entryRoot ?? fallbackRoot

    if (!root) return null

    // Reconstruct: root -> ... -> start
    const chain: Array<ModuleGraphNode> = []
    let cur: ModuleGraphNode | undefined = root
    for (let i = 0; i < config.maxTraceDepth + 2 && cur; i++) {
      chain.push(cur)
      if (cur === start) break
      cur = parent.get(cur)
    }

    const steps: Array<TraceStep> = []
    for (let i = 0; i < chain.length; i++) {
      const id = nodeId(chain[i]!)
      if (!id) continue
      let specifier: string | undefined
      if (i + 1 < chain.length) {
        const nextId = nodeId(chain[i + 1]!)
        if (nextId) {
          specifier = env.graph.reverseEdges.get(nextId)?.get(id)
        }
      }
      steps.push(specifier ? { file: id, specifier } : { file: id })
    }

    return steps.length ? steps : null
  }

  const config: PluginConfig = {
    enabled: true,
    root: '',
    command: 'build',
    srcDirectory: '',
    framework: opts.framework,
    entryFiles: [],
    effectiveBehavior: 'error',
    mockAccess: 'error',
    logMode: 'once',
    maxTraceDepth: 20,
    compiledRules: {
      client: { specifiers: [], files: [] },
      server: { specifiers: [], files: [] },
    },
    includeMatchers: [],
    excludeMatchers: [],
    ignoreImporterMatchers: [],
    markerSpecifiers: { serverOnly: new Set(), clientOnly: new Set() },
    envTypeMap: new Map(opts.environments.map((e) => [e.name, e.type])),
    onViolation: undefined,
  }

  const envStates = new Map<string, EnvState>()
  const shared: SharedState = { fileMarkerKind: new Map() }

  function getMarkerKindForFile(
    fileId: string,
  ): 'server' | 'client' | undefined {
    const file = normalizeFilePath(fileId)
    return shared.fileMarkerKind.get(file)
  }

  type ViolationReporter = {
    warn: (msg: string) => void
    error: (msg: string) => never
  }

  /**
   * Build the best available trace for a module and enrich each step with
   * line/column locations.  Tries the plugin's own ImportGraph first, then
   * Vite's moduleGraph (authoritative on warm start), keeping whichever is
   * longer.  Annotates the last step with the denied specifier + location.
   *
   * Shared by {@link buildViolationInfo} and {@link processPendingViolations}.
   */
  async function rebuildAndAnnotateTrace(
    provider: TransformResultProvider,
    env: EnvState,
    envName: string,
    normalizedImporter: string,
    specifier: string,
    importerLoc: Loc | undefined,
    traceOverride?: Array<TraceStep>,
  ): Promise<Array<TraceStep>> {
    let trace =
      traceOverride ??
      buildTrace(env.graph, normalizedImporter, config.maxTraceDepth)

    if (config.command === 'serve') {
      const mgTrace = buildTraceFromModuleGraph(
        envName,
        env,
        normalizedImporter,
      )
      if (mgTrace && mgTrace.length > trace.length) {
        trace = mgTrace
      }
    }
    await addTraceImportLocations(provider, trace, env.importLocCache)

    if (trace.length > 0) {
      const last = trace[trace.length - 1]!
      if (!last.specifier) last.specifier = specifier
      if (importerLoc && last.line == null) {
        last.line = importerLoc.line
        last.column = importerLoc.column
      }
    }

    return trace
  }

  /**
   * Build a complete {@link ViolationInfo} with trace, location, and snippet.
   *
   * This is the single path that all violation types go through: specifier,
   * file, and marker.
   */
  async function buildViolationInfo(
    provider: TransformResultProvider,
    env: EnvState,
    envName: string,
    envType: 'client' | 'server',
    importer: string,
    normalizedImporter: string,
    source: string,
    overrides: Omit<
      ViolationInfo,
      | 'env'
      | 'envType'
      | 'behavior'
      | 'specifier'
      | 'importer'
      | 'trace'
      | 'snippet'
      | 'importerLoc'
    >,
    traceOverride?: Array<TraceStep>,
  ): Promise<ViolationInfo> {
    const loc =
      (await findPostCompileUsageLocation(
        provider,
        importer,
        source,
        findPostCompileUsagePos,
      )) ||
      (await findImportStatementLocationFromTransformed(
        provider,
        importer,
        source,
        env.importLocCache,
      ))

    const trace = await rebuildAndAnnotateTrace(
      provider,
      env,
      envName,
      normalizedImporter,
      source,
      loc,
      traceOverride,
    )

    const snippet = loc ? buildCodeSnippet(provider, importer, loc) : undefined

    return {
      env: envName,
      envType,
      behavior: config.effectiveBehavior,
      specifier: source,
      importer: normalizedImporter,
      ...(loc ? { importerLoc: loc } : {}),
      trace,
      snippet,
      ...overrides,
    }
  }

  /**
   * Check if a resolved import violates marker restrictions (e.g. importing
   * a server-only module in the client env).  If so, build and return the
   * {@link ViolationInfo} — the caller is responsible for reporting/deferring.
   *
   * Returns `undefined` when the resolved import has no marker conflict.
   */
  async function buildMarkerViolationFromResolvedImport(
    provider: TransformResultProvider,
    env: EnvState,
    envName: string,
    envType: 'client' | 'server',
    importer: string,
    source: string,
    resolvedId: string,
    relativePath: string,
    traceOverride?: Array<TraceStep>,
  ): Promise<ViolationInfo | undefined> {
    const markerKind = getMarkerKindForFile(resolvedId)
    const violates =
      (envType === 'client' && markerKind === 'server') ||
      (envType === 'server' && markerKind === 'client')
    if (!violates) return undefined

    const normalizedImporter = normalizeFilePath(importer)

    return buildViolationInfo(
      provider,
      env,
      envName,
      envType,
      importer,
      normalizedImporter,
      source,
      {
        type: 'marker',
        resolved: normalizeFilePath(resolvedId),
        message:
          markerKind === 'server'
            ? `Module "${relativePath}" is marked server-only but is imported in the client environment`
            : `Module "${relativePath}" is marked client-only but is imported in the server environment`,
      },
      traceOverride,
    )
  }

  function getEnvType(envName: string): 'client' | 'server' {
    return config.envTypeMap.get(envName) ?? 'server'
  }

  function getRulesForEnvironment(envName: string): {
    specifiers: Array<CompiledMatcher>
    files: Array<CompiledMatcher>
  } {
    const type = getEnvType(envName)
    return type === 'client'
      ? config.compiledRules.client
      : config.compiledRules.server
  }

  const environmentNames = new Set<string>([
    VITE_ENVIRONMENT_NAMES.client,
    VITE_ENVIRONMENT_NAMES.server,
  ])
  if (opts.providerEnvName !== VITE_ENVIRONMENT_NAMES.server) {
    environmentNames.add(opts.providerEnvName)
  }

  /** Get (or lazily create) the per-env state for the given environment name. */
  function getEnv(envName: string): EnvState {
    let envState = envStates.get(envName)
    if (!envState) {
      const transformResultCache = new Map<string, TransformResult>()
      envState = {
        graph: new ImportGraph(),
        deniedSources: new Set(),
        deniedEdges: new Map(),
        mockExportsByImporter: new Map(),
        resolveCache: new Map(),
        resolveCacheByFile: new Map(),
        importLocCache: new ImportLocCache(),
        seenViolations: new Set(),
        transformResultCache,
        transformResultKeysByFile: new Map(),
        transformResultProvider: {
          getTransformResult(id: string) {
            const fullKey = normalizePath(id)
            const exact = transformResultCache.get(fullKey)
            if (exact) return exact
            const strippedKey = normalizeFilePath(id)
            return strippedKey !== fullKey
              ? transformResultCache.get(strippedKey)
              : undefined
          },
        },
        postTransformImports: new Map(),
        hasSeenEntry: false,
        serverFnLookupModules: new Set(),
        pendingViolations: new Map(),
      }
      envStates.set(envName, envState)
    }
    return envState
  }

  const shouldCheckImporterCache = new Map<string, boolean>()
  function shouldCheckImporter(importer: string): boolean {
    let result = shouldCheckImporterCache.get(importer)
    if (result !== undefined) return result

    const relativePath = relativizePath(importer, config.root)

    if (
      config.excludeMatchers.length > 0 &&
      matchesAny(relativePath, config.excludeMatchers)
    ) {
      result = false
    } else if (
      config.ignoreImporterMatchers.length > 0 &&
      matchesAny(relativePath, config.ignoreImporterMatchers)
    ) {
      result = false
    } else if (config.includeMatchers.length > 0) {
      result = !!matchesAny(relativePath, config.includeMatchers)
    } else if (config.srcDirectory) {
      result = importer.startsWith(config.srcDirectory)
    } else {
      result = true
    }

    shouldCheckImporterCache.set(importer, result)
    return result
  }

  function dedupeKey(
    type: string,
    importer: string,
    specifier: string,
    resolved?: string,
  ): string {
    return `${type}:${importer}:${specifier}:${resolved ?? ''}`
  }

  function hasSeen(env: EnvState, key: string): boolean {
    if (config.logMode === 'always') return false
    if (env.seenViolations.has(key)) return true
    env.seenViolations.add(key)
    return false
  }

  function getRelativePath(absolutePath: string): string {
    return relativizePath(normalizePath(absolutePath), config.root)
  }

  /** Register known Start entrypoints as trace roots for all environments. */
  function registerEntries(): void {
    const { resolvedStartConfig } = opts.getConfig()
    for (const envDef of opts.environments) {
      const envState = getEnv(envDef.name)
      if (resolvedStartConfig.routerFilePath) {
        envState.graph.addEntry(
          normalizePath(resolvedStartConfig.routerFilePath),
        )
      }
      if (resolvedStartConfig.startFilePath) {
        envState.graph.addEntry(
          normalizePath(resolvedStartConfig.startFilePath),
        )
      }
    }
  }

  function checkPostTransformReachability(
    env: EnvState,
    file: string,
  ): 'reachable' | 'unreachable' | 'unknown' {
    const visited = new Set<string>()
    const queue: Array<string> = [file]
    let hasUnknownEdge = false
    let qi = 0

    while (qi < queue.length) {
      const current = queue[qi++]!
      if (visited.has(current)) continue
      visited.add(current)

      if (env.graph.entries.has(current)) {
        return 'reachable'
      }

      // Walk reverse edges
      const importers = env.graph.reverseEdges.get(current)
      if (!importers) continue

      for (const [parent] of importers) {
        if (visited.has(parent)) continue

        // Check all code-split variants for this parent. The edge is
        // live if ANY variant's resolved imports include `current`.
        const keySet = env.transformResultKeysByFile.get(parent)
        let anyVariantCached = false
        let edgeLive = false

        if (keySet) {
          for (const k of keySet) {
            const resolvedImports = env.postTransformImports.get(k)
            if (resolvedImports) {
              anyVariantCached = true
              if (resolvedImports.has(current)) {
                edgeLive = true
                break
              }
            }
          }
        }

        // Fallback: direct file-path key
        if (!anyVariantCached) {
          const resolvedImports = env.postTransformImports.get(parent)
          if (resolvedImports) {
            anyVariantCached = true
            if (resolvedImports.has(current)) {
              edgeLive = true
            }
          }
        }

        if (!anyVariantCached) {
          const hasTransformResult =
            env.transformResultCache.has(parent) ||
            (keySet ? keySet.size > 0 : false)

          if (hasTransformResult) {
            // Transform ran but postTransformImports not yet populated
            hasUnknownEdge = true
            continue
          }

          // Transform never ran — Vite served from cache (warm start).
          // Conservatively treat edge as live.
          queue.push(parent)
          continue
        }

        if (edgeLive) {
          queue.push(parent)
        }
      }
    }

    return hasUnknownEdge ? 'unknown' : 'unreachable'
  }

  /**
   * Process pending violations for the given environment.  Called from the
   * transform-cache hook after each module transform is cached, because new
   * transform data may allow us to confirm or discard pending violations.
   *
   * @param warnFn - `this.warn` from the transform hook context
   */
  async function processPendingViolations(
    env: EnvState,
    warnFn: (msg: string) => void,
  ): Promise<void> {
    if (env.pendingViolations.size === 0) return

    const toDelete: Array<string> = []

    for (const [file, violations] of env.pendingViolations) {
      // On warm start, skip graph reachability — confirm immediately.
      const status = env.hasSeenEntry
        ? checkPostTransformReachability(env, file)
        : 'reachable'

      if (status === 'reachable') {
        for (const pv of violations) {
          const key = dedupeKey(
            pv.info.type,
            pv.info.importer,
            pv.info.specifier,
            pv.info.resolved,
          )
          if (!hasSeen(env, key)) {
            const freshTrace = await rebuildAndAnnotateTrace(
              env.transformResultProvider,
              env,
              pv.info.env,
              pv.info.importer,
              pv.info.specifier,
              pv.info.importerLoc,
            )
            if (freshTrace.length > pv.info.trace.length) {
              pv.info.trace = freshTrace
            }

            if (config.onViolation) {
              const result = config.onViolation(pv.info)
              if (result === false) continue
            }
            warnFn(formatViolation(pv.info, config.root))
          }
        }
        toDelete.push(file)
      } else if (status === 'unreachable') {
        toDelete.push(file)
      }
      // 'unknown' — keep pending for next transform-cache invocation.
    }

    for (const file of toDelete) {
      env.pendingViolations.delete(file)
    }
  }

  /**
   * Record a violation as pending for later confirmation via graph
   * reachability.  Called from `resolveId` when `shouldDefer` is true.
   */
  function deferViolation(
    env: EnvState,
    importerFile: string,
    info: ViolationInfo,
    mockReturnValue:
      | { id: string; syntheticNamedExports: boolean }
      | string
      | undefined,
  ): void {
    getOrCreate(env.pendingViolations, importerFile, () => []).push({
      info,
      mockReturnValue:
        typeof mockReturnValue === 'string'
          ? mockReturnValue
          : (mockReturnValue?.id ?? ''),
    })
  }

  function handleViolation(
    ctx: ViolationReporter,
    env: EnvState,
    info: ViolationInfo,
    violationOpts?: { silent?: boolean },
  ): { id: string; syntheticNamedExports: boolean } | string | undefined {
    const key = dedupeKey(
      info.type,
      info.importer,
      info.specifier,
      info.resolved,
    )

    if (!violationOpts?.silent) {
      if (config.onViolation) {
        const result = config.onViolation(info)
        if (result === false) {
          return undefined
        }
      }

      const seen = hasSeen(env, key)

      if (config.effectiveBehavior === 'error') {
        if (!seen) ctx.error(formatViolation(info, config.root))
        return undefined
      }

      if (!seen) {
        ctx.warn(formatViolation(info, config.root))
      }
    } else {
      if (config.effectiveBehavior === 'error') {
        return undefined
      }
    }

    env.deniedSources.add(info.specifier)
    getOrCreate(env.deniedEdges, info.importer, () => new Set<string>()).add(
      info.specifier,
    )

    if (config.command === 'serve') {
      const runtimeId = mockRuntimeModuleIdFromViolation(
        info,
        config.mockAccess,
        config.root,
      )
      const importerFile = normalizeFilePath(info.importer)
      const exports =
        env.mockExportsByImporter.get(importerFile)?.get(info.specifier) ?? []
      return resolveViteId(
        makeMockEdgeModuleId(exports, info.specifier, runtimeId),
      )
    }

    // Build: Rollup uses syntheticNamedExports
    return { id: RESOLVED_MOCK_MODULE_ID, syntheticNamedExports: true }
  }

  /**
   * Unified violation dispatch: either defers or reports immediately.
   *
   * When `shouldDefer` is true, calls `handleViolation` silently to obtain
   * the mock module ID, stores the violation as pending, and triggers
   * `processPendingViolations`.  Otherwise reports (or silences for
   * pre-transform resolves) immediately.
   *
   * Returns the mock module ID / resolve result from `handleViolation`.
   */
  async function reportOrDeferViolation(
    ctx: ViolationReporter,
    env: EnvState,
    importerFile: string,
    info: ViolationInfo,
    shouldDefer: boolean,
    isPreTransformResolve: boolean,
  ): Promise<ReturnType<typeof handleViolation>> {
    if (shouldDefer) {
      const result = handleViolation(ctx, env, info, { silent: true })
      deferViolation(env, importerFile, info, result)
      await processPendingViolations(env, ctx.warn.bind(ctx))
      return result
    }
    return handleViolation(ctx, env, info, {
      silent: isPreTransformResolve,
    })
  }

  return [
    {
      name: 'tanstack-start-core:import-protection',
      enforce: 'pre',

      applyToEnvironment(env) {
        if (!config.enabled) return false
        // Start's environments are named `client` and `ssr` (not `server`), plus
        // an optional serverFn provider environment (eg `rsc`) when configured.
        return environmentNames.has(env.name)
      },

      configResolved(viteConfig) {
        config.root = viteConfig.root
        config.command = viteConfig.command

        const { startConfig, resolvedStartConfig } = opts.getConfig()
        config.srcDirectory = resolvedStartConfig.srcDirectory

        config.entryFiles = [
          resolvedStartConfig.routerFilePath,
          resolvedStartConfig.startFilePath,
        ].filter((f): f is string => Boolean(f))

        const userOpts: ImportProtectionOptions | undefined =
          startConfig.importProtection

        if (userOpts?.enabled === false) {
          config.enabled = false
          return
        }

        config.enabled = true

        if (userOpts?.behavior) {
          if (typeof userOpts.behavior === 'string') {
            config.effectiveBehavior = userOpts.behavior
          } else {
            config.effectiveBehavior =
              viteConfig.command === 'serve'
                ? (userOpts.behavior.dev ?? 'mock')
                : (userOpts.behavior.build ?? 'error')
          }
        } else {
          config.effectiveBehavior =
            viteConfig.command === 'serve' ? 'mock' : 'error'
        }

        config.logMode = userOpts?.log ?? 'once'
        config.mockAccess = userOpts?.mockAccess ?? 'error'
        config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20
        if (userOpts?.onViolation) {
          const fn = userOpts.onViolation
          config.onViolation = (info) => fn(info)
        }

        const defaults = getDefaultImportProtectionRules()

        // Client specifier denies always include framework defaults even
        // when the user provides a custom list.
        const clientSpecifiers = dedupePatterns([
          ...defaults.client.specifiers,
          ...(userOpts?.client?.specifiers ?? []),
        ])

        const clientFiles = userOpts?.client?.files
          ? [...userOpts.client.files]
          : [...defaults.client.files]
        const serverSpecifiers = userOpts?.server?.specifiers
          ? dedupePatterns([...userOpts.server.specifiers])
          : dedupePatterns([...defaults.server.specifiers])
        const serverFiles = userOpts?.server?.files
          ? [...userOpts.server.files]
          : [...defaults.server.files]

        config.compiledRules.client = {
          specifiers: compileMatchers(clientSpecifiers),
          files: compileMatchers(clientFiles),
        }
        config.compiledRules.server = {
          specifiers: compileMatchers(serverSpecifiers),
          files: compileMatchers(serverFiles),
        }

        // Include/exclude
        if (userOpts?.include) {
          config.includeMatchers = compileMatchers(userOpts.include)
        }
        if (userOpts?.exclude) {
          config.excludeMatchers = compileMatchers(userOpts.exclude)
        }
        if (userOpts?.ignoreImporters) {
          config.ignoreImporterMatchers = compileMatchers(
            userOpts.ignoreImporters,
          )
        }

        // Marker specifiers
        const markers = getMarkerSpecifiers()
        config.markerSpecifiers = {
          serverOnly: new Set(markers.serverOnly),
          clientOnly: new Set(markers.clientOnly),
        }
      },

      configureServer(server) {
        devServer = server
      },

      buildStart() {
        if (!config.enabled) return
        // Clear memoization caches that grow unboundedly across builds
        clearNormalizeFilePathCache()
        clearImportPatternCache()
        shouldCheckImporterCache.clear()

        // Clear per-env caches
        for (const envState of envStates.values()) {
          envState.resolveCache.clear()
          envState.resolveCacheByFile.clear()
          envState.importLocCache.clear()
          envState.seenViolations.clear()
          envState.transformResultCache.clear()
          envState.transformResultKeysByFile.clear()
          envState.postTransformImports.clear()
          envState.hasSeenEntry = false
          envState.serverFnLookupModules.clear()
          envState.graph.clear()
          envState.deniedSources.clear()
          envState.deniedEdges.clear()
          envState.mockExportsByImporter.clear()
        }

        // Clear shared state
        shared.fileMarkerKind.clear()

        registerEntries()
      },

      hotUpdate(ctx) {
        if (!config.enabled) return
        // Invalidate caches for updated files
        for (const mod of ctx.modules) {
          if (mod.id) {
            const id = mod.id
            const importerFile = normalizeFilePath(id)
            shared.fileMarkerKind.delete(importerFile)

            // Invalidate per-env caches
            for (const envState of envStates.values()) {
              envState.importLocCache.deleteByFile(importerFile)

              // Invalidate resolve cache using reverse index
              const resolveKeys = envState.resolveCacheByFile.get(importerFile)
              if (resolveKeys) {
                for (const key of resolveKeys) {
                  envState.resolveCache.delete(key)
                }
                envState.resolveCacheByFile.delete(importerFile)
              }

              // Invalidate graph edges
              envState.graph.invalidate(importerFile)
              envState.deniedEdges.delete(importerFile)
              envState.mockExportsByImporter.delete(importerFile)
              envState.serverFnLookupModules.delete(importerFile)
              envState.pendingViolations.delete(importerFile)

              // Invalidate transform result cache for this file.
              const transformKeys =
                envState.transformResultKeysByFile.get(importerFile)
              if (transformKeys) {
                for (const key of transformKeys) {
                  envState.transformResultCache.delete(key)
                  envState.postTransformImports.delete(key)
                }
                envState.transformResultKeysByFile.delete(importerFile)
              } else {
                // Fallback: at least clear the physical-file entry.
                envState.transformResultCache.delete(importerFile)
                envState.postTransformImports.delete(importerFile)
              }
            }
          }
        }
      },

      async resolveId(source, importer, _options) {
        const envName = this.environment.name
        const env = getEnv(envName)
        const envType = getEnvType(envName)
        const provider = env.transformResultProvider
        const isScanResolve = !!(_options as Record<string, unknown>).scan

        if (IMPORT_PROTECTION_DEBUG) {
          const importerPath = importer
            ? normalizeFilePath(importer)
            : '(entry)'
          const isEntryResolve = !importer
          const filtered =
            IMPORT_PROTECTION_DEBUG_FILTER === 'entry'
              ? isEntryResolve
              : matchesDebugFilter(source, importerPath)
          if (filtered) {
            debugLog('resolveId', {
              env: envName,
              envType,
              source,
              importer: importerPath,
              isEntryResolve,
              hasSeenEntry: env.hasSeenEntry,
              command: config.command,
              behavior: config.effectiveBehavior,
            })
          }
        }

        // Internal virtual modules
        if (source === MOCK_MODULE_ID) {
          return RESOLVED_MOCK_MODULE_ID
        }
        if (source.startsWith(MOCK_EDGE_PREFIX)) {
          return resolveViteId(source)
        }
        if (source.startsWith(MOCK_RUNTIME_PREFIX)) {
          return resolveViteId(source)
        }
        if (source.startsWith(MARKER_PREFIX)) {
          return resolveViteId(source)
        }

        if (!importer) {
          env.graph.addEntry(source)
          env.hasSeenEntry = true
          return undefined
        }

        if (source.startsWith('\0') || source.startsWith('virtual:')) {
          return undefined
        }

        const normalizedImporter = normalizeFilePath(importer)
        const isDirectLookup = importer.includes(SERVER_FN_LOOKUP_QUERY)

        if (isDirectLookup) {
          env.serverFnLookupModules.add(normalizedImporter)
        }

        const isPreTransformResolve =
          isDirectLookup ||
          env.serverFnLookupModules.has(normalizedImporter) ||
          isScanResolve

        // Dev mock mode: defer violations until post-transform data is
        // available, then confirm/discard via graph reachability.
        const isDevMock =
          config.command === 'serve' && config.effectiveBehavior === 'mock'

        const shouldDefer = isDevMock && !isPreTransformResolve

        // Check if this is a marker import
        const markerKind = config.markerSpecifiers.serverOnly.has(source)
          ? ('server' as const)
          : config.markerSpecifiers.clientOnly.has(source)
            ? ('client' as const)
            : undefined

        if (markerKind) {
          const existing = shared.fileMarkerKind.get(normalizedImporter)
          if (existing && existing !== markerKind) {
            this.error(
              `[import-protection] File "${getRelativePath(normalizedImporter)}" has both server-only and client-only markers. This is not allowed.`,
            )
          }
          shared.fileMarkerKind.set(normalizedImporter, markerKind)

          const violatesEnv =
            (envType === 'client' && markerKind === 'server') ||
            (envType === 'server' && markerKind === 'client')

          if (violatesEnv) {
            const info = await buildViolationInfo(
              provider,
              env,
              envName,
              envType,
              importer,
              normalizedImporter,
              source,
              {
                type: 'marker',
                message:
                  markerKind === 'server'
                    ? `Module "${getRelativePath(normalizedImporter)}" is marked server-only but is imported in the client environment`
                    : `Module "${getRelativePath(normalizedImporter)}" is marked client-only but is imported in the server environment`,
              },
            )
            await reportOrDeferViolation(
              this,
              env,
              normalizedImporter,
              info,
              shouldDefer,
              isPreTransformResolve,
            )
          }

          return markerKind === 'server'
            ? RESOLVED_MARKER_SERVER_ONLY
            : RESOLVED_MARKER_CLIENT_ONLY
        }

        // Check if the importer is within our scope
        if (!shouldCheckImporter(normalizedImporter)) {
          return undefined
        }

        const matchers = getRulesForEnvironment(envName)

        // 1. Specifier-based denial
        const specifierMatch = matchesAny(source, matchers.specifiers)
        if (specifierMatch) {
          env.graph.addEdge(source, normalizedImporter, source)
          const info = await buildViolationInfo(
            provider,
            env,
            envName,
            envType,
            importer,
            normalizedImporter,
            source,
            {
              type: 'specifier',
              pattern: specifierMatch.pattern,
              message: `Import "${source}" is denied in the ${envType} environment`,
            },
          )
          return reportOrDeferViolation(
            this,
            env,
            normalizedImporter,
            info,
            shouldDefer,
            isPreTransformResolve,
          )
        }

        // 2. Resolve the import (cached)
        const cacheKey = `${normalizedImporter}:${source}`
        let resolved: string | null

        if (env.resolveCache.has(cacheKey)) {
          resolved = env.resolveCache.get(cacheKey) ?? null
        } else {
          const result = await this.resolve(source, importer, {
            skipSelf: true,
          })
          resolved = result ? normalizeFilePath(result.id) : null
          env.resolveCache.set(cacheKey, resolved)
          getOrCreate(
            env.resolveCacheByFile,
            normalizedImporter,
            () => new Set(),
          ).add(cacheKey)
        }

        if (resolved) {
          const relativePath = getRelativePath(resolved)

          // Propagate pre-transform status transitively
          if (isPreTransformResolve && !isScanResolve) {
            env.serverFnLookupModules.add(resolved)
          }

          env.graph.addEdge(resolved, normalizedImporter, source)

          const fileMatch =
            matchers.files.length > 0
              ? matchesAny(relativePath, matchers.files)
              : undefined

          if (fileMatch) {
            const info = await buildViolationInfo(
              provider,
              env,
              envName,
              envType,
              importer,
              normalizedImporter,
              source,
              {
                type: 'file',
                pattern: fileMatch.pattern,
                resolved,
                message: `Import "${source}" (resolved to "${relativePath}") is denied in the ${envType} environment`,
              },
            )
            return reportOrDeferViolation(
              this,
              env,
              normalizedImporter,
              info,
              shouldDefer,
              isPreTransformResolve,
            )
          }

          const markerInfo = await buildMarkerViolationFromResolvedImport(
            provider,
            env,
            envName,
            envType,
            importer,
            source,
            resolved,
            relativePath,
          )
          if (markerInfo) {
            return reportOrDeferViolation(
              this,
              env,
              normalizedImporter,
              markerInfo,
              shouldDefer,
              isPreTransformResolve,
            )
          }
        }

        return undefined
      },

      load: {
        filter: {
          id: new RegExp(
            [
              RESOLVED_MOCK_MODULE_ID,
              RESOLVED_MARKER_PREFIX,
              RESOLVED_MOCK_EDGE_PREFIX,
              RESOLVED_MOCK_RUNTIME_PREFIX,
            ]
              .map(escapeRegExp)
              .join('|'),
          ),
        },
        handler(id) {
          if (IMPORT_PROTECTION_DEBUG) {
            if (matchesDebugFilter(id)) {
              debugLog('load:handler', {
                env: this.environment.name,
                id: normalizePath(id),
              })
            }
          }

          if (id === RESOLVED_MOCK_MODULE_ID) {
            return loadSilentMockModule()
          }

          if (id.startsWith(RESOLVED_MOCK_EDGE_PREFIX)) {
            return loadMockEdgeModule(
              id.slice(RESOLVED_MOCK_EDGE_PREFIX.length),
            )
          }

          if (id.startsWith(RESOLVED_MOCK_RUNTIME_PREFIX)) {
            return loadMockRuntimeModule(
              id.slice(RESOLVED_MOCK_RUNTIME_PREFIX.length),
            )
          }

          if (id.startsWith(RESOLVED_MARKER_PREFIX)) {
            return loadMarkerModule()
          }

          return undefined
        },
      },
    },
    {
      // Captures transformed code + composed sourcemap for location mapping.
      // Runs after all `enforce: 'pre'` hooks (including the Start compiler).
      // Only files under `srcDirectory` are cached.
      name: 'tanstack-start-core:import-protection-transform-cache',

      applyToEnvironment(env) {
        if (!config.enabled) return false
        return environmentNames.has(env.name)
      },

      transform: {
        filter: {
          id: {
            include: [/\.[cm]?[tj]sx?($|\?)/],
          },
        },
        async handler(code, id) {
          const envName = this.environment.name
          const file = normalizeFilePath(id)

          if (IMPORT_PROTECTION_DEBUG) {
            if (matchesDebugFilter(file)) {
              debugLog('transform-cache', {
                env: envName,
                id: normalizePath(id),
                file,
              })
            }
          }

          if (!shouldCheckImporter(file)) {
            return undefined
          }

          // getCombinedSourcemap() returns the composed sourcemap
          let map: SourceMapLike | undefined
          try {
            map = this.getCombinedSourcemap()
          } catch {
            map = undefined
          }

          let originalCode: string | undefined
          if (map?.sourcesContent) {
            originalCode = pickOriginalCodeFromSourcesContent(
              map,
              file,
              config.root,
            )
          }

          const lineIndex = buildLineIndex(code)
          const cacheKey = normalizePath(id)

          const envState = getEnv(envName)

          // Propagate SERVER_FN_LOOKUP status before import-analysis
          if (id.includes(SERVER_FN_LOOKUP_QUERY)) {
            envState.serverFnLookupModules.add(file)
          }

          envState.transformResultCache.set(cacheKey, {
            code,
            map,
            originalCode,
            lineIndex,
          })

          const keySet = getOrCreate(
            envState.transformResultKeysByFile,
            file,
            () => new Set<string>(),
          )
          keySet.add(cacheKey)

          // Also store stripped-path entry for physical-file lookups.
          if (cacheKey !== file) {
            envState.transformResultCache.set(file, {
              code,
              map,
              originalCode,
              lineIndex,
            })
            keySet.add(file)
          }

          // Resolve import sources to canonical paths for reachability checks.
          const importSources = extractImportSources(code)
          const resolvedChildren = new Set<string>()
          for (const src of importSources) {
            try {
              const resolved = await this.resolve(src, id, { skipSelf: true })
              if (resolved && !resolved.external) {
                const resolvedPath = normalizeFilePath(resolved.id)
                resolvedChildren.add(resolvedPath)
                // Populate import graph edges for warm-start trace accuracy
                envState.graph.addEdge(resolvedPath, file, src)
              }
            } catch {
              // Non-fatal
            }
          }
          envState.postTransformImports.set(cacheKey, resolvedChildren)
          if (cacheKey !== file) {
            envState.postTransformImports.set(file, resolvedChildren)
          }

          await processPendingViolations(envState, this.warn.bind(this))

          return undefined
        },
      },
    },
    {
      // Separate plugin so the transform can be enabled/disabled per-environment.
      name: 'tanstack-start-core:import-protection-mock-rewrite',
      enforce: 'pre',

      // Only needed during dev. In build, we rely on Rollup's syntheticNamedExports.
      apply: 'serve',

      applyToEnvironment(env) {
        if (!config.enabled) return false
        // Only needed in mock mode — when not mocking, there is nothing to
        // record.  applyToEnvironment runs after configResolved, so
        // config.effectiveBehavior is already set.
        if (config.effectiveBehavior !== 'mock') return false
        // We record expected named exports per importer in all Start Vite
        // environments during dev so mock-edge modules can provide explicit
        // ESM named exports.
        return environmentNames.has(env.name)
      },

      transform: {
        filter: {
          id: {
            include: [/\.[cm]?[tj]sx?($|\?)/],
          },
        },
        handler(code, id) {
          const envName = this.environment.name
          const envState = envStates.get(envName)
          if (!envState) return undefined

          // Record export names per source for this importer so we can generate
          // dev mock-edge modules without any disk reads.
          try {
            const importerFile = normalizeFilePath(id)
            envState.mockExportsByImporter.set(
              importerFile,
              collectMockExportNamesBySource(code),
            )
          } catch {
            // Best-effort only
          }

          // Note: we no longer rewrite imports here.
          // Dev uses per-importer mock-edge modules in resolveId so native ESM
          // has explicit named exports, and runtime diagnostics are handled by
          // the mock runtime proxy when those mocks are actually invoked.
          return undefined
        },
      },
    },
  ] satisfies Array<PluginOption>
}
