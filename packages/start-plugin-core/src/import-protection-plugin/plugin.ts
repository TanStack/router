import * as path from 'pathe'
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
import { dedupePatterns, normalizeFilePath } from './utils'
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
  addTraceImportLocations,
  buildCodeSnippet,
  buildLineIndex,
  findImportStatementLocationFromTransformed,
  findPostCompileUsageLocation,
  pickOriginalCodeFromSourcesContent,
} from './sourceLocation'
import type { PluginOption } from 'vite'
import type { CompiledMatcher } from './matchers'
import type { ViolationInfo } from './trace'
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

// Re-export public API that tests and other consumers depend on.
export { RESOLVED_MOCK_MODULE_ID } from './virtualModules'
export { rewriteDeniedImports } from './rewriteDeniedImports'
export { dedupePatterns } from './utils'
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
  importLocCache: Map<
    string,
    { file?: string; line: number; column: number } | null
  >
  /** Reverse index: file path → Set of importLocCache keys for that file. */
  importLocByFile: Map<string, Set<string>>

  /** Deduplication of logged violations (no env prefix in key). */
  seenViolations: Set<string>

  /** Transform result cache (code + composed sourcemap + original source). */
  transformResultCache: Map<string, TransformResult>
  /** Reverse index: physical file path → Set of transformResultCache keys. */
  transformResultKeysByFile: Map<string, Set<string>>
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
  const config: PluginConfig = {
    enabled: true,
    root: '',
    command: 'build',
    srcDirectory: '',
    framework: opts.framework,
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

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a per-env `importLocCache` whose `.set` method automatically
   * maintains the reverse index (`importLocByFile`) for O(1) invalidation
   * in `hotUpdate`.
   *
   * Cache keys have the format `${importerFile}::${source}`.
   */
  function createImportLocCache(
    env: EnvState,
  ): Map<string, { file?: string; line: number; column: number } | null> {
    const cache = new Map<
      string,
      { file?: string; line: number; column: number } | null
    >()
    const originalSet = cache.set.bind(cache)
    cache.set = function (key, value) {
      originalSet(key, value)
      const sepIdx = key.indexOf('::')
      if (sepIdx !== -1) {
        const file = key.slice(0, sepIdx)
        let fileKeys = env.importLocByFile.get(file)
        if (!fileKeys) {
          fileKeys = new Set()
          env.importLocByFile.set(file, fileKeys)
        }
        fileKeys.add(key)
      }
      return this
    }
    return cache
  }

  function getMockEdgeExports(
    env: EnvState,
    importerId: string,
    source: string,
  ): Array<string> {
    const importerFile = normalizeFilePath(importerId)
    return env.mockExportsByImporter.get(importerFile)?.get(source) ?? []
  }

  function getMarkerKindForFile(
    fileId: string,
  ): 'server' | 'client' | undefined {
    const file = normalizeFilePath(fileId)
    return shared.fileMarkerKind.get(file)
  }

  /**
   * Build a {@link TransformResultProvider} for the given environment.
   *
   * The provider reads from the transform result cache that is populated by
   * the `tanstack-start-core:import-protection-transform-cache` plugin's
   * transform hook.
   */
  function getTransformResultProvider(env: EnvState): TransformResultProvider {
    return {
      getTransformResult(id: string) {
        // Try the full normalized ID first (preserves query params like
        // ?tsr-split=component for virtual modules).
        const fullKey = normalizePath(id)
        const exact = env.transformResultCache.get(fullKey)
        if (exact) return exact

        // Fall back to the query-stripped path for modules looked up by
        // their physical file path (e.g. trace steps, modules without
        // query params).
        const strippedKey = normalizeFilePath(id)
        return strippedKey !== fullKey
          ? env.transformResultCache.get(strippedKey)
          : undefined
      },
    }
  }

  type ViolationReporter = {
    warn: (msg: string) => void
    error: (msg: string) => never
  }

  /**
   * Build a complete {@link ViolationInfo} with trace, location, and snippet.
   *
   * This is the single path that all violation types go through: specifier,
   * file, and marker.  Centralizing it eliminates the duplicated sequences of
   * `buildTrace` → `addTraceImportLocations` → location lookup → annotate →
   * snippet that previously appeared 5 times in the codebase.
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
  ): Promise<ViolationInfo> {
    const trace = buildTrace(
      env.graph,
      normalizedImporter,
      config.maxTraceDepth,
    )
    await addTraceImportLocations(provider, trace, env.importLocCache)

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

    // Annotate the last trace step with the denied import's specifier and
    // location so every trace step (including the leaf) gets file:line:col.
    if (trace.length > 0) {
      const last = trace[trace.length - 1]!
      if (!last.specifier) last.specifier = source
      if (loc && last.line == null) {
        last.line = loc.line
        last.column = loc.column
      }
    }

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

  async function maybeReportMarkerViolationFromResolvedImport(
    ctx: ViolationReporter,
    provider: TransformResultProvider,
    env: EnvState,
    envName: string,
    envType: 'client' | 'server',
    importer: string,
    source: string,
    resolvedId: string,
    relativePath: string,
    opts?: { silent?: boolean },
  ): Promise<ReturnType<typeof handleViolation> | undefined> {
    const markerKind = getMarkerKindForFile(resolvedId)
    const violates =
      (envType === 'client' && markerKind === 'server') ||
      (envType === 'server' && markerKind === 'client')
    if (!violates) return undefined

    const normalizedImporter = normalizeFilePath(importer)

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
        resolved: normalizeFilePath(resolvedId),
        message:
          markerKind === 'server'
            ? `Module "${relativePath}" is marked server-only but is imported in the client environment`
            : `Module "${relativePath}" is marked client-only but is imported in the server environment`,
      },
    )

    return handleViolation.call(ctx, env, info, opts)
  }

  function buildMockEdgeModuleId(
    env: EnvState,
    importerId: string,
    source: string,
    runtimeId: string,
  ): string {
    const exports = getMockEdgeExports(env, importerId, source)
    return makeMockEdgeModuleId(exports, source, runtimeId)
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
      const importLocByFile = new Map<string, Set<string>>()
      envState = {
        graph: new ImportGraph(),
        deniedSources: new Set(),
        deniedEdges: new Map(),
        mockExportsByImporter: new Map(),
        resolveCache: new Map(),
        resolveCacheByFile: new Map(),
        importLocCache: new Map(), // placeholder, replaced below
        importLocByFile,
        seenViolations: new Set(),
        transformResultCache: new Map(),
        transformResultKeysByFile: new Map(),
      }
      // Install reverse-index-maintaining importLocCache
      envState.importLocCache = createImportLocCache(envState)
      envStates.set(envName, envState)
    }
    return envState
  }

  function shouldCheckImporter(importer: string): boolean {
    // Normalize for matching
    const relativePath = path.relative(config.root, importer)

    // Check exclude first
    if (
      config.excludeMatchers.length > 0 &&
      matchesAny(relativePath, config.excludeMatchers)
    ) {
      return false
    }

    // Check ignore importers
    if (
      config.ignoreImporterMatchers.length > 0 &&
      matchesAny(relativePath, config.ignoreImporterMatchers)
    ) {
      return false
    }

    // Check include
    if (config.includeMatchers.length > 0) {
      return !!matchesAny(relativePath, config.includeMatchers)
    }

    // Default: check if within srcDirectory
    if (config.srcDirectory) {
      return importer.startsWith(config.srcDirectory)
    }

    return true
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
    return normalizePath(path.relative(config.root, absolutePath))
  }

  // ---------------------------------------------------------------------------
  // Vite plugins
  // ---------------------------------------------------------------------------

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

        const userOpts: ImportProtectionOptions | undefined =
          startConfig.importProtection

        // Determine if plugin is enabled
        if (userOpts?.enabled === false) {
          config.enabled = false
          return
        }

        config.enabled = true

        // Determine effective behavior
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
          // Defaults: dev='mock', build='error'
          config.effectiveBehavior =
            viteConfig.command === 'serve' ? 'mock' : 'error'
        }

        // Log mode
        config.logMode = userOpts?.log ?? 'once'

        // Mock runtime access diagnostics
        config.mockAccess = userOpts?.mockAccess ?? 'error'

        // Max trace depth
        config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20

        // User callback
        config.onViolation = userOpts?.onViolation as
          | ((info: ViolationInfo) => boolean | void)
          | undefined

        // Get default rules
        const defaults = getDefaultImportProtectionRules(opts.framework)

        // Merge user rules with defaults and compile matchers per env.
        // IMPORTANT: client specifier denies for Start server entrypoints must
        // always include the framework defaults even when the user provides a
        // custom list.
        const clientSpecifiers = dedupePatterns([
          ...defaults.client.specifiers,
          ...(userOpts?.client?.specifiers ?? []),
        ])

        // For file patterns, user config overrides defaults.
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
        const markers = getMarkerSpecifiers(opts.framework)
        config.markerSpecifiers = {
          serverOnly: new Set(markers.serverOnly),
          clientOnly: new Set(markers.clientOnly),
        }

        // Use known Start env entrypoints as trace roots.
        // This makes traces deterministic and prevents 1-line traces.
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
      },

      buildStart() {
        if (!config.enabled) return
        // Clear per-env caches
        for (const envState of envStates.values()) {
          envState.resolveCache.clear()
          envState.resolveCacheByFile.clear()
          envState.importLocCache.clear()
          envState.importLocByFile.clear()
          envState.seenViolations.clear()
          envState.transformResultCache.clear()
          envState.transformResultKeysByFile.clear()
          envState.graph.clear()
          envState.deniedSources.clear()
          envState.deniedEdges.clear()
          envState.mockExportsByImporter.clear()
        }

        // Clear shared state
        shared.fileMarkerKind.clear()

        // Re-add known entries after clearing.
        for (const envDef of opts.environments) {
          const envState = getEnv(envDef.name)
          const { resolvedStartConfig } = opts.getConfig()
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
              // Invalidate cached import locations using reverse index
              const locKeys = envState.importLocByFile.get(importerFile)
              if (locKeys) {
                for (const key of locKeys) {
                  envState.importLocCache.delete(key)
                }
                envState.importLocByFile.delete(importerFile)
              }

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

              // Invalidate transform result cache for this file.
              const transformKeys =
                envState.transformResultKeysByFile.get(importerFile)
              if (transformKeys) {
                for (const key of transformKeys) {
                  envState.transformResultCache.delete(key)
                }
                envState.transformResultKeysByFile.delete(importerFile)
              } else {
                // Fallback: at least clear the physical-file entry.
                envState.transformResultCache.delete(importerFile)
              }
            }
          }
        }
      },

      async resolveId(source, importer, _options) {
        if (!config.enabled) return undefined
        const envName = this.environment.name
        const env = getEnv(envName)
        const envType = getEnvType(envName)
        const provider = getTransformResultProvider(env)

        // Internal virtual modules must resolve in dev.
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

        // Skip if no importer (entry points)
        if (!importer) {
          // Track entry-ish modules so traces can terminate.
          // Vite may pass virtual ids here; normalize but keep them.
          env.graph.addEntry(source)
          return undefined
        }

        // Skip virtual modules
        if (source.startsWith('\0') || source.startsWith('virtual:')) {
          return undefined
        }

        // Two code paths resolve imports from raw (pre-compiler-transform)
        // source in dev mode:
        //
        // 1. The Start compiler calls `fetchModule(id + '?' + SERVER_FN_LOOKUP)`
        //    to inspect a child module's exports.  The compiler's own transform
        //    is excluded for these requests, so Vite sees the original imports.
        //
        // 2. Vite's dep-optimizer scanner (`options.scan === true`) uses esbuild
        //    to discover bare imports for pre-bundling.  esbuild reads raw source
        //    without running Vite transform hooks, so it also sees imports that
        //    the compiler would normally strip.
        //
        // In both cases the imports are NOT real client-side imports.  We must
        // suppress violation *reporting* (no warnings / errors) but still return
        // mock module IDs so that transitive resolution doesn't blow up.
        const isPreTransformResolve =
          importer.includes('?' + SERVER_FN_LOOKUP) ||
          !!(_options as Record<string, unknown>).scan

        // Check if this is a marker import
        if (config.markerSpecifiers.serverOnly.has(source)) {
          // Record importer as server-only
          const resolvedImporter = normalizeFilePath(importer)
          const existing = shared.fileMarkerKind.get(resolvedImporter)
          if (existing && existing !== 'server') {
            this.error(
              `[import-protection] File "${getRelativePath(resolvedImporter)}" has both server-only and client-only markers. This is not allowed.`,
            )
          }
          shared.fileMarkerKind.set(resolvedImporter, 'server')

          // If we're in the client environment, this is a violation
          if (envType === 'client') {
            const info = await buildViolationInfo(
              provider,
              env,
              envName,
              envType,
              importer,
              resolvedImporter,
              source,
              {
                type: 'marker',
                message: `Module "${getRelativePath(resolvedImporter)}" is marked server-only but is imported in the client environment`,
              },
            )
            handleViolation.call(this, env, info, {
              silent: isPreTransformResolve,
            })
          }

          // Return virtual empty module
          return resolveViteId(`${MARKER_PREFIX}server-only`)
        }

        if (config.markerSpecifiers.clientOnly.has(source)) {
          const resolvedImporter = normalizeFilePath(importer)
          const existing = shared.fileMarkerKind.get(resolvedImporter)
          if (existing && existing !== 'client') {
            this.error(
              `[import-protection] File "${getRelativePath(resolvedImporter)}" has both server-only and client-only markers. This is not allowed.`,
            )
          }
          shared.fileMarkerKind.set(resolvedImporter, 'client')

          if (envType === 'server') {
            const info = await buildViolationInfo(
              provider,
              env,
              envName,
              envType,
              importer,
              resolvedImporter,
              source,
              {
                type: 'marker',
                message: `Module "${getRelativePath(resolvedImporter)}" is marked client-only but is imported in the server environment`,
              },
            )
            handleViolation.call(this, env, info, {
              silent: isPreTransformResolve,
            })
          }

          return resolveViteId(`${MARKER_PREFIX}client-only`)
        }

        // Check if the importer is within our scope
        const normalizedImporter = normalizeFilePath(importer)
        if (!shouldCheckImporter(normalizedImporter)) {
          return undefined
        }

        const matchers = getRulesForEnvironment(envName)

        // 1. Specifier-based denial (fast, no resolution needed)
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
              message: `Import "${source}" is denied in the "${envName}" environment`,
            },
          )
          return handleViolation.call(this, env, info, {
            silent: isPreTransformResolve,
          })
        }

        // 2. Resolve the import (cached) — needed for file-based denial,
        //    marker checks, and graph edge tracking.
        const cacheKey = `${normalizedImporter}:${source}`
        let resolved: string | null

        if (env.resolveCache.has(cacheKey)) {
          resolved = env.resolveCache.get(cacheKey) || null
        } else {
          const result = await this.resolve(source, importer, {
            skipSelf: true,
          })
          resolved = result ? normalizeFilePath(result.id) : null
          env.resolveCache.set(cacheKey, resolved)

          // Maintain reverse index for O(1) hotUpdate invalidation.
          // Index by the importer so that when a file changes, all resolve
          // cache entries where it was the importer are cleared.
          let fileKeys = env.resolveCacheByFile.get(normalizedImporter)
          if (!fileKeys) {
            fileKeys = new Set()
            env.resolveCacheByFile.set(normalizedImporter, fileKeys)
          }
          fileKeys.add(cacheKey)
        }

        if (resolved) {
          const relativePath = getRelativePath(resolved)

          // Always record the edge for trace building, even when not denied.
          env.graph.addEdge(resolved, normalizedImporter, source)

          // File-based denial check
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
                message: `Import "${source}" (resolved to "${relativePath}") is denied in the "${envName}" environment`,
              },
            )
            return handleViolation.call(this, env, info, {
              silent: isPreTransformResolve,
            })
          }

          // Marker restrictions apply regardless of explicit deny rules.
          const markerRes = await maybeReportMarkerViolationFromResolvedImport(
            this,
            provider,
            env,
            envName,
            envType,
            importer,
            source,
            resolved,
            relativePath,
            { silent: isPreTransformResolve },
          )
          if (markerRes !== undefined) {
            return markerRes
          }
        }

        return undefined
      },

      load: {
        filter: {
          id: new RegExp(
            `(${RESOLVED_MOCK_MODULE_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${RESOLVED_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${RESOLVED_MOCK_EDGE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${RESOLVED_MOCK_RUNTIME_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
          ),
        },
        handler(id) {
          if (!config.enabled) return undefined
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
      // This plugin runs WITHOUT `enforce` so it executes after all
      // `enforce: 'pre'` transform hooks (including the Start compiler).
      // It captures the transformed code + composed sourcemap for every module
      // so that the `resolveId` hook (in the main plugin above) can look up
      // the importer's transform result and map violation locations back to
      // original source.
      //
      // Why not use `ctx.load()` in `resolveId`?
      //   - Vite dev: `this.load()` returns a ModuleInfo proxy that throws on
      //     `.code` access — code is not exposed.
      //   - Rollup build: `ModuleInfo` has `.code` but NOT `.map`, so we
      //     can't map generated positions back to original source.
      //
      // By caching in the transform hook we get both code and the composed
      // sourcemap that chains all the way back to the original file.
      //
      // Performance: only files under `srcDirectory` are cached because only
      // those can be importers in a violation.  Third-party code in
      // node_modules is never checked.
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
        handler(code, id) {
          if (!config.enabled) return undefined
          const envName = this.environment.name
          const file = normalizeFilePath(id)

          // Only cache files that could ever be checked as an importer.
          // This reuses the same include/exclude/ignoreImporters predicate as
          // the main import-protection resolveId hook.
          if (!shouldCheckImporter(file)) {
            return undefined
          }

          // getCombinedSourcemap() returns the composed sourcemap of all
          // transform hooks that ran before this one. It includes
          // sourcesContent so we can extract original source later.
          let map: SourceMapLike | undefined
          try {
            map = this.getCombinedSourcemap()
          } catch {
            // No sourcemap available (e.g. virtual modules or modules
            // that no prior plugin produced a map for).
            map = undefined
          }

          // Extract the original source from sourcesContent right here.
          // Composed sourcemaps can contain multiple sources; try to pick the
          // entry that best matches this importer.
          let originalCode: string | undefined
          if (map?.sourcesContent) {
            originalCode = pickOriginalCodeFromSourcesContent(
              map,
              file,
              config.root,
            )
          }

          // Precompute a line index for fast index->line/col conversions.
          const lineIndex = buildLineIndex(code)

          // Key by the full normalized module ID including query params
          // (e.g. "src/routes/index.tsx?tsr-split=component") so that
          // virtual modules derived from the same physical file each get
          // their own cache entry.
          const cacheKey = normalizePath(id)
          const envState = getEnv(envName)
          envState.transformResultCache.set(cacheKey, {
            code,
            map,
            originalCode,
            lineIndex,
          })

          // Maintain reverse index so hotUpdate invalidation is O(keys for file).
          let keySet = envState.transformResultKeysByFile.get(file)
          if (!keySet) {
            keySet = new Set<string>()
            envState.transformResultKeysByFile.set(file, keySet)
          }
          keySet.add(cacheKey)

          // Also store/update the stripped-path entry so that lookups by
          // physical file path (e.g. from trace steps in the import graph,
          // which normalize away query params) still find a result.
          // The last variant transformed wins, which is acceptable — trace
          // lookups are best-effort for line numbers.
          if (cacheKey !== file) {
            envState.transformResultCache.set(file, {
              code,
              map,
              originalCode,
              lineIndex,
            })
            keySet.add(file)
          }

          // Return nothing — we don't modify the code.
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
          if (!config.enabled) return undefined
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

  // ---------------------------------------------------------------------------
  // Violation handling
  // ---------------------------------------------------------------------------

  function handleViolation(
    this: { warn: (msg: string) => void; error: (msg: string) => never },
    env: EnvState,
    info: ViolationInfo,
    opts?: { silent?: boolean },
  ): { id: string; syntheticNamedExports: boolean } | string | undefined {
    const key = dedupeKey(
      info.type,
      info.importer,
      info.specifier,
      info.resolved,
    )

    if (!opts?.silent) {
      // Call user callback
      if (config.onViolation) {
        const result = config.onViolation(info)
        if (result === false) {
          return undefined
        }
      }

      const seen = hasSeen(env, key)

      if (config.effectiveBehavior === 'error') {
        if (!seen) this.error(formatViolation(info, config.root))
        return undefined
      }

      // Mock mode: log once, but always return the mock module.
      if (!seen) {
        this.warn(formatViolation(info, config.root))
      }
    } else {
      // Silent mode: in error behavior, skip entirely (no mock needed
      // for compiler-internal lookups); in mock mode, fall through to
      // return the mock module ID without logging.
      if (config.effectiveBehavior === 'error') {
        return undefined
      }
    }

    env.deniedSources.add(info.specifier)
    let edgeSet = env.deniedEdges.get(info.importer)
    if (!edgeSet) {
      edgeSet = new Set<string>()
      env.deniedEdges.set(info.importer, edgeSet)
    }
    edgeSet.add(info.specifier)

    if (config.command === 'serve') {
      const runtimeId = mockRuntimeModuleIdFromViolation(
        info,
        config.mockAccess,
        config.root,
      )
      return resolveViteId(
        buildMockEdgeModuleId(env, info.importer, info.specifier, runtimeId),
      )
    }

    // Build: Rollup can synthesize named exports.
    return { id: RESOLVED_MOCK_MODULE_ID, syntheticNamedExports: true }
  }
}
