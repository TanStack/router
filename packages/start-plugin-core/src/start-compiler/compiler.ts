import crypto from 'node:crypto'
import { is, walk } from 'yuku-ast'
import {
  analyzeModule,
  cloneModuleAst,
  extractModuleInfo,
  generateModule,
  parseExpression,
  removeUnusedBindings,
  unwrapExpression,
} from '@tanstack/router-utils'
import { handleCreateServerFn } from './handleCreateServerFn'
import { handleCreateMiddleware } from './handleCreateMiddleware'
import { handleCreateIsomorphicFn } from './handleCreateIsomorphicFn'
import { handleEnvOnlyFn } from './handleEnvOnly'
import { handleClientOnlyJSX } from './handleClientOnlyJSX'
import { cleanId, createAstEditor, getVariableDeclarator } from './utils'
import type * as t from '@yuku-toolchain/types'
import type { Module } from 'yuku-analyzer'
import type {
  CompilationContext,
  DevServerFnModuleSpecifierEncoder,
  MethodChainPaths,
  RewriteCandidate,
  ServerFn,
} from './types'
import type { ModuleInfoBinding } from '@tanstack/router-utils'
import type {
  CompileStartFrameworkOptions,
  StartCompilerEnvironment,
  StartCompilerImportTransform,
  StartCompilerPlugin,
  StartCompilerTransformContext,
  StartCompilerTransformResult,
} from '../types'

type Binding = ModuleInfoBinding & {
  resolvedKind?: Kind
}

type ImportBinding = Extract<Binding, { type: 'import' }>

type Kind = 'None' | `Root` | `Builder` | LookupKind
type ParsedAst = t.Program
type StartCompilerAstPlugin = StartCompilerPlugin & {
  transformAst: NonNullable<StartCompilerPlugin['transformAst']>
}

export type BuiltInLookupKind =
  | 'ServerFn'
  | 'Middleware'
  | 'IsomorphicFn'
  | 'ServerOnlyFn'
  | 'ClientOnlyFn'
  | 'ClientOnlyJSX'

export type ExternalLookupKind = `External:${string}`

export type LookupKind = BuiltInLookupKind | ExternalLookupKind

// Detection strategy for each kind
type MethodChainSetup = {
  type: 'methodChain'
  candidateCallIdentifier: Set<string>
}
type DirectCallSetup = {
  type: 'directCall'
  // The factory function name used to create this kind (e.g., 'createServerOnlyFn')
  factoryNames: Set<string>
}
type JSXSetup = { type: 'jsx'; componentName: string }

function isLookupKind(kind: Kind): kind is LookupKind {
  return kind in BuiltInLookupSetup || isExternalLookupKind(kind)
}

export function getExternalLookupKind(
  transform: StartCompilerImportTransform,
): ExternalLookupKind {
  return `External:${transform.name}`
}

function isExternalLookupKind(kind: Kind): kind is ExternalLookupKind {
  return typeof kind === 'string' && kind.startsWith('External:')
}

export function isCompilerTransformEnabledForEnv(
  transform: StartCompilerImportTransform,
  env: StartCompilerEnvironment,
): boolean {
  return isStartCompilerEnvironmentEnabled(transform.environment, env)
}

export function isStartCompilerPluginEnabledForEnv(
  plugin: StartCompilerPlugin,
  env: StartCompilerEnvironment,
): boolean {
  return isStartCompilerEnvironmentEnabled(plugin.environment, env)
}

function isStartCompilerEnvironmentEnabled(
  environment:
    | StartCompilerEnvironment
    | Array<StartCompilerEnvironment>
    | undefined,
  env: StartCompilerEnvironment,
): boolean {
  if (!environment) {
    return true
  }
  if (Array.isArray(environment)) {
    return environment.includes(env)
  }
  return environment === env
}

const BuiltInLookupSetup: Record<
  BuiltInLookupKind,
  MethodChainSetup | DirectCallSetup | JSXSetup
> = {
  ServerFn: {
    type: 'methodChain',
    candidateCallIdentifier: new Set(['handler']),
  },
  Middleware: {
    type: 'methodChain',
    candidateCallIdentifier: new Set(['server', 'client', 'createMiddlewares']),
  },
  IsomorphicFn: {
    type: 'methodChain',
    candidateCallIdentifier: new Set(['server', 'client']),
  },
  ServerOnlyFn: {
    type: 'directCall',
    factoryNames: new Set(['createServerOnlyFn']),
  },
  ClientOnlyFn: {
    type: 'directCall',
    factoryNames: new Set(['createClientOnlyFn']),
  },
  ClientOnlyJSX: { type: 'jsx', componentName: 'ClientOnly' },
}

// Single source of truth for detecting which kinds are present in code
// These patterns are used for:
// 1. Pre-scanning code to determine which kinds to look for (before AST parsing)
// 2. Deriving the plugin's transform code filter
export const KindDetectionPatterns: Record<BuiltInLookupKind, RegExp> = {
  ServerFn: /\bcreateServerFn\b|\.\s*handler\s*\(/,
  Middleware: /createMiddleware/,
  IsomorphicFn: /createIsomorphicFn/,
  ServerOnlyFn: /createServerOnlyFn/,
  ClientOnlyFn: /createClientOnlyFn/,
  ClientOnlyJSX: /<ClientOnly|import\s*\{[^}]*\bClientOnly\b/,
}

// Which kinds are valid for each environment
export const LookupKindsPerEnv: Record<
  'client' | 'server',
  Set<BuiltInLookupKind>
> = {
  client: new Set([
    'Middleware',
    'ServerFn',
    'IsomorphicFn',
    'ServerOnlyFn',
    'ClientOnlyFn',
  ] as const),
  server: new Set([
    'ServerFn',
    'IsomorphicFn',
    'ServerOnlyFn',
    'ClientOnlyFn',
    'ClientOnlyJSX', // Only transform on server to remove children
  ] as const),
}

export function getLookupKindsForEnv(
  env: 'client' | 'server',
  opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined
  },
): Set<LookupKind> {
  const kinds: Set<LookupKind> = new Set(LookupKindsPerEnv[env])
  for (const transform of opts?.compilerTransforms ?? []) {
    if (isCompilerTransformEnabledForEnv(transform, env)) {
      kinds.add(getExternalLookupKind(transform))
    }
  }
  return kinds
}

/**
 * Handler type for processing candidates of a specific kind.
 * The kind is passed as the third argument to allow shared handlers (like handleEnvOnlyFn).
 */
type KindHandler = (
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
  kind: BuiltInLookupKind,
) => void

/**
 * Registry mapping each LookupKind to its handler function.
 * When adding a new kind, add its handler here.
 */
const BuiltInKindHandlers: Record<
  Exclude<BuiltInLookupKind, 'ClientOnlyJSX'>,
  KindHandler
> = {
  ServerFn: handleCreateServerFn,
  Middleware: handleCreateMiddleware,
  IsomorphicFn: handleCreateIsomorphicFn,
  ServerOnlyFn: handleEnvOnlyFn,
  ClientOnlyFn: handleEnvOnlyFn,
  // ClientOnlyJSX is handled separately via JSX traversal, not here
}

const BuiltInKindHandlerOrder: Array<
  Exclude<BuiltInLookupKind, 'ClientOnlyJSX'>
> = ['ServerFn', 'Middleware', 'IsomorphicFn', 'ServerOnlyFn', 'ClientOnlyFn']

// All lookup kinds as an array for iteration with proper typing
const AllBuiltInLookupKinds = Object.keys(
  BuiltInLookupSetup,
) as Array<BuiltInLookupKind>

/**
 * Detects which LookupKinds are present in the code using string matching.
 * This is a fast pre-scan before AST parsing to limit the work done during compilation.
 */
export function detectKindsInCode(
  code: string,
  env: 'client' | 'server',
  opts?: {
    compilerTransforms?: Array<StartCompilerImportTransform> | undefined
  },
): Set<LookupKind> {
  const detected = new Set<LookupKind>()
  const validForEnv = getLookupKindsForEnv(env, opts)

  for (const kind of AllBuiltInLookupKinds) {
    const pattern = KindDetectionPatterns[kind]
    pattern.lastIndex = 0
    if (validForEnv.has(kind) && pattern.test(code)) {
      detected.add(kind)
    }
  }

  for (const transform of opts?.compilerTransforms ?? []) {
    if (!isCompilerTransformEnabledForEnv(transform, env)) {
      continue
    }
    transform.detect.lastIndex = 0
    if (transform.detect.test(code)) {
      detected.add(getExternalLookupKind(transform))
    }
  }

  return detected
}

// Pre-computed map: identifier name -> Set<LookupKind> for fast candidate detection (method chain only)
// Multiple kinds can share the same identifier (e.g., 'server' and 'client' are used by both Middleware and IsomorphicFn)
const IdentifierToKinds = new Map<string, Set<LookupKind>>()
for (const kind of AllBuiltInLookupKinds) {
  const setup = BuiltInLookupSetup[kind]
  if (setup.type === 'methodChain') {
    for (const id of setup.candidateCallIdentifier) {
      let kinds = IdentifierToKinds.get(id)
      if (!kinds) {
        kinds = new Set()
        IdentifierToKinds.set(id, kinds)
      }
      kinds.add(kind)
    }
  }
}

function getLookupSetup(
  kind: LookupKind,
  externalLookupSetup?: Map<ExternalLookupKind, DirectCallSetup>,
): MethodChainSetup | DirectCallSetup | JSXSetup | undefined {
  if (kind in BuiltInLookupSetup) {
    return BuiltInLookupSetup[kind as BuiltInLookupKind]
  }

  if (isExternalLookupKind(kind)) {
    return externalLookupSetup?.get(kind)
  }

  return undefined
}

export type LookupConfig = {
  libName: string
  rootExport: string
  kind: LookupKind | 'Root' // 'Root' for builder pattern, LookupKind for direct call
}

interface ExportResolution {
  moduleInfo: ModuleInfo
  localName: string
  binding: Binding
}

interface ModuleInfo {
  id: string
  bindings: Map<string, Binding>
  // Maps exported name → local binding name
  exports: Map<string, string>
  // Track `export * from './module'` declarations for re-export resolution
  reExportAllSources: Array<string>
}

function isDirectCallCandidateForKind(
  kind: Exclude<LookupKind, 'ClientOnlyJSX'>,
  externalLookupSetup?: Map<ExternalLookupKind, DirectCallSetup>,
): boolean {
  return getLookupSetup(kind, externalLookupSetup)?.type === 'directCall'
}

export class StartCompiler {
  private moduleCache = new Map<string, ModuleInfo>()
  private initialized = false
  private validLookupKinds: Set<LookupKind>
  private externalTransformsByKind = new Map<
    ExternalLookupKind,
    StartCompilerImportTransform
  >()
  private externalLookupSetup = new Map<ExternalLookupKind, DirectCallSetup>()
  private compilerPlugins: Array<StartCompilerPlugin>
  private resolveIdCache = new Map<string, string | null>()
  private exportResolutionCache = new Map<
    string,
    Map<string, ExportResolution | null>
  >()
  // Fast lookup for direct imports from known libraries (e.g., '@tanstack/react-start')
  // Maps: libName → (exportName → Kind)
  // This allows O(1) resolution for the common case without async resolveId calls
  private knownRootImports = new Map<string, Map<string, Kind>>()

  // For generating unique function IDs in production builds
  private entryIdToFunctionId = new Map<string, string>()
  private functionIds = new Set<string>()

  constructor(
    private options: {
      env: 'client' | 'server'
      envName: string
      root: string
      lookupConfigurations: Array<LookupConfig>
      lookupKinds: Set<LookupKind>
      loadModule: (id: string) => Promise<void>
      resolveId: (id: string, importer?: string) => Promise<string | null>
      /**
       * In 'build' mode, resolution results are cached for performance.
       * In 'dev' mode (default), caching is disabled to avoid invalidation complexity with HMR.
       */
      mode?: 'dev' | 'build'
      /**
       * The framework being used (e.g., 'react', 'solid').
       */
      framework: CompileStartFrameworkOptions
      /**
       * The Vite environment name for the server function provider.
       */
      providerEnvName: string
      /**
       * Custom function ID generator (optional, defaults to hash-based).
       */
      generateFunctionId?: (opts: {
        filename: string
        functionName: string
      }) => string | undefined
      /**
       * Callback when server functions are discovered.
       * Called after each file is compiled with its new functions.
       */
      onServerFnsById?: (d: Record<string, ServerFn>) => void
      compilerTransforms?: Array<StartCompilerImportTransform> | undefined
      compilerPlugins?: Array<StartCompilerPlugin> | undefined
      serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined
      warn?: (message: string) => void
      /**
       * Returns the currently known server functions from previous builds.
       * Used by server callers to look up canonical extracted filenames.
       */
      getKnownServerFns: () => Record<string, ServerFn>
      devServerFnModuleSpecifierEncoder?: DevServerFnModuleSpecifierEncoder
    },
  ) {
    this.validLookupKinds = options.lookupKinds
    this.compilerPlugins = (options.compilerPlugins ?? []).filter((plugin) =>
      isStartCompilerPluginEnabledForEnv(plugin, options.env),
    )

    for (const transform of options.compilerTransforms ?? []) {
      const kind = getExternalLookupKind(transform)
      if (!this.validLookupKinds.has(kind)) {
        continue
      }

      this.externalTransformsByKind.set(kind, transform)

      const factoryNames = new Set<string>()
      for (const entry of transform.imports) {
        factoryNames.add(entry.rootExport)
      }

      this.externalLookupSetup.set(kind, {
        type: 'directCall',
        factoryNames,
      })
    }
  }

  /**
   * Generates a unique function ID for a server function.
   * In dev mode, uses a base64-encoded JSON with file path and export name.
   * In build mode, uses SHA256 hash or custom generator.
   */
  private generateFunctionId(opts: {
    filename: string
    functionName: string
    extractedFilename: string
  }): string {
    if (this.mode === 'dev') {
      // In dev, encode the file path and export name for direct lookup.
      // Each bundler adapter supplies its own strategy for encoding
      // module specifiers that work with its dev server runtime.
      const encodeModuleSpecifier =
        this.options.devServerFnModuleSpecifierEncoder
      if (!encodeModuleSpecifier) {
        throw new Error(
          'devServerFnModuleSpecifierEncoder is required in dev mode.',
        )
      }
      const file = encodeModuleSpecifier({
        extractedFilename: opts.extractedFilename,
        root: this.options.root,
      })

      const serverFn = {
        file,
        export: opts.functionName,
      }
      return Buffer.from(JSON.stringify(serverFn), 'utf8').toString('base64url')
    }

    // Production build: use custom generator or hash
    const entryId = `${opts.filename}--${opts.functionName}`
    let functionId = this.entryIdToFunctionId.get(entryId)
    if (functionId === undefined) {
      const knownFn = Object.values(this.options.getKnownServerFns()).find(
        (serverFn) =>
          serverFn.functionName === opts.functionName &&
          serverFn.extractedFilename === opts.extractedFilename,
      )

      if (knownFn) {
        functionId = knownFn.functionId
      }

      if (this.options.generateFunctionId) {
        functionId ??= this.options.generateFunctionId({
          filename: opts.filename,
          functionName: opts.functionName,
        })
      }
      if (!functionId) {
        functionId = crypto.createHash('sha256').update(entryId).digest('hex')
      }
      // Deduplicate in case the generated id conflicts with an existing id
      if (this.functionIds.has(functionId)) {
        let deduplicatedId
        let iteration = 0
        do {
          deduplicatedId = `${functionId}_${++iteration}`
        } while (this.functionIds.has(deduplicatedId))
        functionId = deduplicatedId
      }
      this.entryIdToFunctionId.set(entryId, functionId)
      this.functionIds.add(functionId)
    }
    return functionId
  }

  private get mode(): 'dev' | 'build' {
    return this.options.mode ?? 'dev'
  }

  private async resolveIdCached(id: string, importer?: string) {
    if (this.mode === 'dev') {
      return this.options.resolveId(id, importer)
    }

    const cacheKey = importer ? `${importer}::${id}` : id
    const cached = this.resolveIdCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }
    const resolved = await this.options.resolveId(id, importer)
    this.resolveIdCache.set(cacheKey, resolved)
    return resolved
  }

  private getExportResolutionCache(moduleId: string) {
    let cache = this.exportResolutionCache.get(moduleId)
    if (!cache) {
      cache = new Map()
      this.exportResolutionCache.set(moduleId, cache)
    }
    return cache
  }

  private init() {
    // Register internal stub package exports for recognition.
    // These don't need module resolution - only the knownRootImports fast path.
    this.knownRootImports.set(
      '@tanstack/start-fn-stubs',
      new Map<string, Kind>([
        ['createIsomorphicFn', 'IsomorphicFn'],
        ['createServerOnlyFn', 'ServerOnlyFn'],
        ['createClientOnlyFn', 'ClientOnlyFn'],
      ]),
    )

    // Register start-client-core exports for internal package usage.
    // These don't need module resolution - only the knownRootImports fast path.
    this.knownRootImports.set(
      '@tanstack/start-client-core',
      new Map<string, Kind>([
        ['createServerFn', 'Root'],
        ['createIsomorphicFn', 'IsomorphicFn'],
        ['createServerOnlyFn', 'ServerOnlyFn'],
        ['createClientOnlyFn', 'ClientOnlyFn'],
        ['createMiddleware', 'Middleware'],
        ['createStart', 'Root'],
      ]),
    )

    for (const config of this.options.lookupConfigurations) {
      // Populate the fast lookup map for direct imports (by package name)
      // This allows O(1) recognition of imports from known packages.
      let libExports = this.knownRootImports.get(config.libName)
      if (!libExports) {
        libExports = new Map()
        this.knownRootImports.set(config.libName, libExports)
      }
      libExports.set(config.rootExport, config.kind)

      // For JSX lookups (e.g., ClientOnlyJSX), we only need the knownRootImports
      // fast path to verify imports. Skip synthetic root module setup.
      if (config.kind !== 'Root') {
        const setup = getLookupSetup(config.kind, this.externalLookupSetup)
        if (setup?.type === 'jsx') {
          continue
        }
      }

      // Root lookup metadata is synthetic package-level state, not a real
      // resolved module. Keep the ID stable across bundlers and export-map
      // behavior by always keying it to the package specifier itself.
      const libId = config.libName

      let rootModule = this.moduleCache.get(libId)
      if (!rootModule) {
        // insert root binding
        rootModule = {
          bindings: new Map(),
          exports: new Map(),
          id: libId,
          reExportAllSources: [],
        }
        this.moduleCache.set(libId, rootModule)
      }

      rootModule.exports.set(config.rootExport, config.rootExport)
      rootModule.exports.set('*', config.rootExport)
      rootModule.bindings.set(config.rootExport, {
        type: 'var',
        init: null, // Not needed since resolvedKind is set
        resolvedKind: config.kind satisfies Kind,
      })
      this.moduleCache.set(libId, rootModule)
    }

    this.initialized = true
  }

  /**
   * Extracts bindings and exports from an already-parsed AST.
   */
  private extractModuleInfo(module: Module, id: string): ModuleInfo {
    const extracted = extractModuleInfo(module)

    const info: ModuleInfo = {
      id,
      bindings: new Map(extracted.bindings),
      exports: extracted.exports,
      reExportAllSources: extracted.reExportAllSources,
    }
    this.moduleCache.set(id, info)
    return info
  }

  public ingestModule({
    code,
    id,
    parserFilename,
  }: {
    code: string
    id: string
    parserFilename?: string
  }) {
    const module = analyzeModule({
      code,
      filename: parserFilename ?? cleanId(id),
    })
    const info = this.extractModuleInfo(module, id)
    return { info, module }
  }

  public invalidateModule(id: string) {
    return this.invalidateModules([id]).size > 0
  }

  public invalidateModules(ids: Iterable<string>): Set<string> {
    const normalizedIds = new Set<string>()

    for (const id of ids) {
      normalizedIds.add(cleanId(id))

      for (const plugin of this.compilerPlugins) {
        plugin.invalidateModule?.({ id, envName: this.options.envName })
      }
    }

    const deletedModuleIds = new Set<string>()
    if (normalizedIds.size === 0) {
      return deletedModuleIds
    }

    for (const moduleId of Array.from(this.moduleCache.keys())) {
      const normalizedModuleId = cleanId(moduleId)
      if (normalizedIds.has(normalizedModuleId)) {
        this.moduleCache.delete(moduleId)
        deletedModuleIds.add(normalizedModuleId)
      }
    }

    // Root import metadata is synthetic compiler state and should survive HMR.
    // The stale dev state lives in per-module resolvedKind memoization.
    for (const [moduleId, moduleInfo] of this.moduleCache) {
      if (this.knownRootImports.has(moduleId)) {
        continue
      }

      for (const binding of moduleInfo.bindings.values()) {
        binding.resolvedKind = undefined
      }
    }

    // Build-mode caches are cheap to rebuild and may point at removed entries.
    this.resolveIdCache.clear()
    this.exportResolutionCache.clear()

    return deletedModuleIds
  }

  public async getTransitiveImporters(
    ids: string | Iterable<string>,
  ): Promise<Set<string>> {
    const discoveredImporters = new Set<string>()
    const pendingTargets =
      typeof ids === 'string'
        ? [cleanId(ids)]
        : Array.from(ids, (id) => cleanId(id))
    const visitedTargets = new Set<string>()
    const resolveCache = new Map<string, Promise<string | null>>()
    const importersByTarget = new Map<string, Set<string>>()

    const resolveSource = (source: string, importer: string) => {
      const cacheKey = `${importer}::${source}`
      let resolved = resolveCache.get(cacheKey)

      if (!resolved) {
        resolved = this.resolveIdCached(source, importer)
        resolveCache.set(cacheKey, resolved)
      }

      return resolved
    }

    await Promise.all(
      Array.from(this.moduleCache.values()).map(async (moduleInfo) => {
        if (this.knownRootImports.has(moduleInfo.id)) {
          return
        }

        const moduleId = cleanId(moduleInfo.id)
        const importSources = new Set(moduleInfo.reExportAllSources)

        for (const binding of moduleInfo.bindings.values()) {
          if (binding.type === 'import') {
            importSources.add(binding.source)
          }
        }

        await Promise.all(
          Array.from(importSources, async (source) => {
            const resolved = await resolveSource(source, moduleInfo.id)
            if (!resolved) {
              return
            }

            const targetId = cleanId(resolved)
            if (targetId === moduleId) {
              return
            }

            let importers = importersByTarget.get(targetId)
            if (!importers) {
              importers = new Set()
              importersByTarget.set(targetId, importers)
            }
            importers.add(moduleId)
          }),
        )
      }),
    )

    while (pendingTargets.length > 0) {
      const targetId = pendingTargets.pop()!

      if (visitedTargets.has(targetId)) {
        continue
      }

      visitedTargets.add(targetId)

      for (const importerId of importersByTarget.get(targetId) ?? []) {
        if (discoveredImporters.has(importerId)) {
          continue
        }

        discoveredImporters.add(importerId)
        pendingTargets.push(importerId)
      }
    }

    return discoveredImporters
  }

  public async compile({
    code,
    id,
    parserFilename,
    detectedKinds,
    warn,
  }: {
    code: string
    id: string
    parserFilename?: string
    /** Pre-detected kinds present in this file. If not provided, all valid kinds are checked. */
    detectedKinds?: Set<LookupKind>
    warn?: (message: string) => void
  }) {
    if (!this.initialized) {
      await this.init()
    }

    const fileKinds = detectedKinds
      ? new Set(
          [...detectedKinds].filter((kind) => this.validLookupKinds.has(kind)),
        )
      : this.validLookupKinds
    const candidateKinds = new Set(fileKinds)
    if (
      fileKinds.has('ServerFn') &&
      ![...fileKinds].some(isExternalLookupKind)
    ) {
      for (const kind of this.validLookupKinds) {
        if (
          !isExternalLookupKind(kind) &&
          getLookupSetup(kind)?.type === 'directCall'
        ) {
          candidateKinds.add(kind)
        }
      }
    }
    const { module } = this.ingestModule({ code, id, parserFilename })
    const { program: ast, originalNodes } = cloneModuleAst(module)
    const editor = createAstEditor(ast)
    const context: CompilationContext = {
      ast,
      module,
      originalNodes,
      ...editor,
      code,
      id,
      env: this.options.env,
      envName: this.options.envName,
      mode: this.mode,
      root: this.options.root,
      framework: this.options.framework,
      providerEnvName: this.options.providerEnvName,
      parseExpression,
      warn: warn ?? this.options.warn,
      generateFunctionId: (options) => this.generateFunctionId(options),
      getKnownServerFns: this.options.getKnownServerFns,
      serverFnProviderModuleDirectives:
        this.options.serverFnProviderModuleDirectives,
      onServerFnsById: this.options.onServerFnsById,
    }
    const calls: Array<t.CallExpression> = []
    const jsx: Array<t.JSXElement> = []
    const sourceInfo = this.moduleCache.get(id)!
    walk(ast, {
      CallExpression: (node, position) => {
        if (
          is.MemberExpression(position.parent) &&
          is.CallExpression(editor.parentOf(position.parent))
        ) {
          return
        }
        if (isMethodChainCandidate(node, fileKinds)) {
          calls.push(node)
          return
        }
        const callee = is.Expression(node.callee)
          ? unwrapExpression(node.callee)
          : node.callee
        const name = is.Identifier(callee)
          ? callee.name
          : is.MemberExpression(callee) && is.Identifier(callee.property)
            ? callee.property.name
            : null
        if (!name) {
          return
        }
        const receiver =
          is.MemberExpression(callee) && is.Expression(callee.object)
            ? unwrapExpression(callee.object)
            : null
        const simpleDirectCall =
          is.Identifier(callee) || is.Identifier(receiver)
        const declarator = getVariableDeclarator(node, editor.parentOf)
        const declaration = declarator && editor.parentOf(declarator)
        const parent = declaration && editor.parentOf(declaration)
        const topLevel =
          is.Program(parent) ||
          (is.ExportNamedDeclaration(parent) &&
            is.Program(editor.parentOf(parent)))
        for (const kind of candidateKinds) {
          const setup = getLookupSetup(kind, this.externalLookupSetup)
          if (setup?.type !== 'directCall') {
            continue
          }
          if ((topLevel && simpleDirectCall) || setup.factoryNames.has(name)) {
            calls.push(node)
            return
          }
          if (isExternalLookupKind(kind)) {
            const root = is.Identifier(callee)
              ? callee
              : is.Identifier(receiver)
                ? receiver
                : null
            const symbol = root && module.symbolOf(originalNodes.get(root)!)
            const binding = symbol && sourceInfo.bindings.get(symbol.name)
            if (
              binding?.type === 'import' &&
              symbol?.scope === module.rootScope &&
              this.knownRootImports
                .get(binding.source)
                ?.get(
                  binding.importedName === '*' ? name : binding.importedName,
                ) === kind
            ) {
              calls.push(node)
              return
            }
          }
        }
      },
      JSXElement: (node) => {
        if (
          !fileKinds.has('ClientOnlyJSX') ||
          !is.JSXIdentifier(node.openingElement.name)
        ) {
          return
        }
        const original = originalNodes.get(node.openingElement.name)!
        const symbol = module.symbolOf(original)
        if (!symbol || symbol.scope !== module.rootScope) {
          return
        }
        const binding = sourceInfo.bindings.get(symbol.name)
        if (
          binding?.type === 'import' &&
          this.knownRootImports
            .get(binding.source)
            ?.get(binding.importedName) === 'ClientOnlyJSX'
        ) {
          jsx.push(node)
        }
      },
    })
    const candidatesByKind = new Map<
      Exclude<LookupKind, 'ClientOnlyJSX'>,
      Array<RewriteCandidate>
    >()
    const resolved = await Promise.all(
      calls.map(async (node) => {
        // Only module bindings can participate in the cross-module builder graph.
        // Local shadowing is decided by Yuku's resolved references before tracing.
        let base: t.Node = node
        for (;;) {
          if (is.Expression(base)) {
            base = unwrapExpression(base)
          }
          if (is.CallExpression(base)) {
            base = base.callee
          } else if (is.MemberExpression(base)) {
            base = base.object
          } else {
            break
          }
        }
        if (is.Identifier(base)) {
          const symbol = module.symbolOf(originalNodes.get(base)!)
          if (!symbol || symbol.scope !== module.rootScope) {
            return { node, kind: 'None' as Kind }
          }
        }
        return { node, kind: await this.resolveExprKind(node, id) }
      }),
    )
    for (const { node, kind } of resolved) {
      if (
        !isLookupKind(kind) ||
        kind === 'ClientOnlyJSX' ||
        !candidateKinds.has(kind)
      ) {
        continue
      }
      if (
        !isMethodChainCandidate(node, fileKinds) &&
        !isDirectCallCandidateForKind(kind, this.externalLookupSetup)
      ) {
        continue
      }
      const methodChain: MethodChainPaths = {
        middleware: null,
        validator: null,
        inputValidator: null,
        handler: null,
        server: null,
        client: null,
      }
      let current = node
      for (;;) {
        const callee = is.Expression(current.callee)
          ? unwrapExpression(current.callee)
          : current.callee
        if (!is.MemberExpression(callee)) {
          break
        }
        if (
          is.Identifier(callee.property) &&
          callee.property.name in methodChain
        ) {
          methodChain[callee.property.name as keyof MethodChainPaths] = {
            call: current,
            firstArg: current.arguments[0] ?? null,
          }
        }
        const object = is.Expression(callee.object)
          ? unwrapExpression(callee.object)
          : callee.object
        if (!is.CallExpression(object)) {
          break
        }
        current = object
      }
      const candidates = candidatesByKind.get(kind) ?? []
      candidates.push({ node, methodChain })
      candidatesByKind.set(kind, candidates)
    }
    let modified = candidatesByKind.size > 0 || jsx.length > 0
    if (modified) {
      this.runExternalTransforms('pre', candidatesByKind, context)
      for (const kind of BuiltInKindHandlerOrder) {
        const candidates = candidatesByKind.get(kind)
        if (candidates) {
          BuiltInKindHandlers[kind](candidates, context, kind)
        }
      }
      this.runExternalTransforms('post', candidatesByKind, context)
      for (const element of jsx) {
        handleClientOnlyJSX(element, { env: 'server' })
      }
      removeUnusedBindings(module, ast, originalNodes, {
        preserveInitiallyUnused: true,
      })
    }
    modified =
      this.runAstTransforms(
        context,
        this.getAstTransformPluginsForCode(code),
      ) || modified
    return modified ? this.generateResultFromAst(ast, code, id) : null
  }

  private generateResultFromAst(
    ast: ParsedAst,
    sourceCode: string,
    id: string,
  ): StartCompilerTransformResult {
    return generateModule(ast, { source: sourceCode, filename: id })
  }

  private getAstTransformPluginsForCode(
    code: string,
  ): Array<StartCompilerAstPlugin> {
    return this.compilerPlugins.filter(
      (plugin): plugin is StartCompilerAstPlugin => {
        if (!plugin.transformAst) {
          return false
        }
        if (!plugin.detect) {
          return true
        }
        plugin.detect.lastIndex = 0
        return plugin.detect.test(code)
      },
    )
  }

  private runAstTransforms(
    context: StartCompilerTransformContext,
    transforms: Array<StartCompilerAstPlugin>,
  ): boolean {
    let modified = false
    for (const plugin of transforms) {
      modified = plugin.transformAst(context) || modified
    }
    return modified
  }

  private runExternalTransforms(
    order: 'pre' | 'post',
    candidatesByKind: Map<
      Exclude<LookupKind, 'ClientOnlyJSX'>,
      Array<RewriteCandidate>
    >,
    context: CompilationContext,
  ) {
    for (const [kind, transform] of this.externalTransformsByKind) {
      if ((transform.order ?? 'pre') !== order) {
        continue
      }

      const candidates = candidatesByKind.get(kind)
      if (!candidates) {
        continue
      }

      transform.transform(candidates, context)
    }
  }

  private async resolveIdentifierKind(
    ident: string,
    id: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    const info = await this.getModuleInfo(id)

    const binding = info.bindings.get(ident)
    if (!binding) {
      return 'None'
    }
    if (binding.resolvedKind) {
      return binding.resolvedKind
    }

    // TODO improve cycle detection? should we throw here instead of returning 'None'?
    // prevent cycles
    const vKey = `${id}:${ident}`
    if (visited.has(vKey)) {
      return 'None'
    }
    visited.add(vKey)

    const resolvedKind = await this.resolveBindingKind(binding, id, visited)
    binding.resolvedKind = resolvedKind
    return resolvedKind
  }

  /**
   * Recursively find an export in a module, following `export * from` chains.
   * Returns the module info and binding if found, or undefined if not found.
   */
  private async findExportInModule(
    moduleInfo: ModuleInfo,
    exportName: string,
    visitedModules = new Set<string>(),
  ): Promise<ExportResolution | undefined> {
    const isBuildMode = this.mode === 'build'

    // Check cache first (only for top-level calls in build mode)
    if (isBuildMode && visitedModules.size === 0) {
      const moduleCache = this.exportResolutionCache.get(moduleInfo.id)
      if (moduleCache) {
        const cached = moduleCache.get(exportName)
        if (cached !== undefined) {
          return cached ?? undefined
        }
      }
    }

    // Prevent infinite loops in circular re-exports
    if (visitedModules.has(moduleInfo.id)) {
      return undefined
    }
    visitedModules.add(moduleInfo.id)

    // First check direct exports
    const localBindingName = moduleInfo.exports.get(exportName)
    if (localBindingName) {
      const binding = moduleInfo.bindings.get(localBindingName)
      if (binding) {
        const result = { moduleInfo, localName: localBindingName, binding }
        // Cache the result (build mode only)
        if (isBuildMode) {
          this.getExportResolutionCache(moduleInfo.id).set(exportName, result)
        }
        return result
      }
    }

    // If not found, recursively check re-export-all sources in parallel
    // Valid code won't have duplicate exports across chains, so first match wins
    if (moduleInfo.reExportAllSources.length > 0) {
      const results = await Promise.all(
        moduleInfo.reExportAllSources.map(async (reExportSource) => {
          const reExportTarget = await this.resolveIdCached(
            reExportSource,
            moduleInfo.id,
          )

          if (reExportTarget) {
            const reExportModule = await this.getModuleInfo(reExportTarget)
            return this.findExportInModule(
              reExportModule,
              exportName,
              visitedModules,
            )
          }
          return undefined
        }),
      )
      // Return the first valid result
      for (const result of results) {
        if (result) {
          // Cache the result (build mode only)
          if (isBuildMode) {
            this.getExportResolutionCache(moduleInfo.id).set(exportName, result)
          }
          return result
        }
      }
    }

    // Cache negative result (build mode only)
    if (isBuildMode) {
      this.getExportResolutionCache(moduleInfo.id).set(exportName, null)
    }
    return undefined
  }

  private async resolveBindingTarget(
    resolution: ExportResolution,
    visited = new Set<string>(),
  ): Promise<ExportResolution | undefined> {
    const key = `${resolution.moduleInfo.id}:${resolution.localName}`
    if (visited.has(key)) {
      return undefined
    }
    visited.add(key)

    if (resolution.binding.type !== 'import') {
      return resolution
    }

    const target = await this.resolveIdCached(
      resolution.binding.source,
      resolution.moduleInfo.id,
    )
    if (!target) {
      return undefined
    }

    const importedModule = await this.getModuleInfo(target)
    const found = await this.findExportInModule(
      importedModule,
      resolution.binding.importedName,
    )
    if (!found) {
      return undefined
    }

    return this.resolveBindingTarget(found, visited)
  }

  private async resolveKnownImportKind(
    binding: ImportBinding,
    resolved?: ExportResolution,
  ): Promise<Kind> {
    const directKind =
      this.knownRootImports.get(binding.source)?.get(binding.importedName) ??
      'None'
    if (directKind !== 'None') {
      return directKind
    }

    if (!resolved) {
      return 'None'
    }

    for (const [source, rootExports] of this.knownRootImports) {
      const kind = rootExports.get(binding.importedName)
      if (!kind) {
        continue
      }

      let targetId: string | null
      try {
        targetId = await this.resolveIdCached(source, resolved.moduleInfo.id)
      } catch {
        continue
      }

      if (!targetId) {
        continue
      }

      try {
        const rootModule = await this.getModuleInfo(targetId)
        const found = await this.findExportInModule(
          rootModule,
          binding.importedName,
        )
        const target = found
          ? ((await this.resolveBindingTarget(found)) ?? found)
          : undefined

        // Match by resolved binding identity, not by export name alone.
        if (
          target &&
          resolved.moduleInfo.id === target.moduleInfo.id &&
          resolved.localName === target.localName
        ) {
          return kind
        }
      } catch {
        continue
      }
    }

    return 'None'
  }

  private async resolveImportKind(
    binding: ImportBinding,
    fileId: string,
    visited: Set<string>,
  ): Promise<Kind> {
    const directKnownKind = await this.resolveKnownImportKind(binding)
    if (directKnownKind !== 'None') {
      binding.resolvedKind = directKnownKind
      return directKnownKind
    }

    if (binding.importedName === '*') {
      return 'None'
    }

    const target = await this.resolveIdCached(binding.source, fileId)
    if (!target) {
      return 'None'
    }

    const importedModule = await this.getModuleInfo(target)
    const found = await this.findExportInModule(
      importedModule,
      binding.importedName,
    )
    if (!found) {
      return 'None'
    }

    const knownKind = await this.resolveKnownImportKind(binding, found)
    if (knownKind !== 'None') {
      found.binding.resolvedKind = knownKind
      binding.resolvedKind = knownKind
      return knownKind
    }

    if (found.binding.resolvedKind) {
      return found.binding.resolvedKind
    }

    // Import aliases can form cycles, e.g. A re-exports from B while B
    // re-exports from A. Track the exported binding before following it.
    const vKey = `${found.moduleInfo.id}:${found.localName}`
    if (visited.has(vKey)) {
      return 'None'
    }
    visited.add(vKey)

    const resolvedKind = await this.resolveBindingKind(
      found.binding,
      found.moduleInfo.id,
      visited,
    )
    found.binding.resolvedKind = resolvedKind
    return resolvedKind
  }

  private async resolveBindingKind(
    binding: Binding,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (binding.resolvedKind) {
      return binding.resolvedKind
    }
    if (binding.type === 'import') {
      return this.resolveImportKind(binding, fileId, visited)
    }

    const resolvedKind = await this.resolveExprKind(
      binding.init,
      fileId,
      visited,
    )
    // When a var binding's init is a call to a directCall factory
    // (e.g., `const myFn = createServerOnlyFn(() => ...)`), the binding holds
    // the RESULT of the factory, not the factory itself. Clear the kind so
    // `myFn()` isn't incorrectly matched as a directCall candidate.
    // We only clear when the init is a CallExpression — an alias like
    // `const createSO = createServerOnlyFn` should still propagate the kind.
    if (
      isLookupKind(resolvedKind) &&
      getLookupSetup(resolvedKind, this.externalLookupSetup)?.type ===
        'directCall' &&
      binding.init &&
      is.CallExpression(unwrapExpression(binding.init))
    ) {
      binding.resolvedKind = 'None'
      return 'None'
    }
    binding.resolvedKind = resolvedKind
    return resolvedKind
  }

  private async resolveExprKind(
    expr: t.Expression | t.Super | null,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (!expr || is.Super(expr)) {
      return 'None'
    }

    expr = unwrapExpression(expr)

    let result: Kind = 'None'

    if (is.CallExpression(expr)) {
      if (!is.Expression(expr.callee)) {
        return 'None'
      }
      const callee = unwrapExpression(expr.callee)
      const calleeKind = await this.resolveCalleeKind(callee, fileId, visited)
      if (calleeKind === 'Root' || calleeKind === 'Builder') {
        return 'Builder'
      }
      // For method chain patterns (callee is MemberExpression like .server() or .client()),
      // return the resolved kind if valid
      if (is.MemberExpression(callee)) {
        if (this.validLookupKinds.has(calleeKind as LookupKind)) {
          return calleeKind
        }
      }
      // For direct calls (callee is Identifier like createServerOnlyFn()),
      // trust calleeKind if it resolved to a valid LookupKind. This means
      // resolveBindingKind successfully traced the import back to
      // @tanstack/start-fn-stubs (via fast path or slow path through re-exports).
      // This handles both direct imports from @tanstack/react-start and imports
      // from intermediate packages that re-export from @tanstack/start-client-core.
      if (is.Identifier(callee)) {
        if (this.validLookupKinds.has(calleeKind as LookupKind)) {
          return calleeKind
        }
      }
    } else if (is.MemberExpression(expr) && is.Identifier(expr.property)) {
      result = await this.resolveCalleeKind(expr.object, fileId, visited)
    }

    if (result === 'None' && is.Identifier(expr)) {
      result = await this.resolveIdentifierKind(expr.name, fileId, visited)
    }

    return result
  }

  private async resolveCalleeKind(
    callee: t.Expression | t.Super,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (is.Expression(callee)) {
      callee = unwrapExpression(callee)
    }
    if (is.Identifier(callee)) {
      return this.resolveIdentifierKind(callee.name, fileId, visited)
    }

    if (is.MemberExpression(callee) && is.Identifier(callee.property)) {
      const prop = callee.property.name

      // Check if this property matches any method chain pattern
      const possibleKinds = IdentifierToKinds.get(prop)
      if (possibleKinds) {
        // Resolve base expression ONCE and reuse for all pattern checks
        const base = await this.resolveExprKind(callee.object, fileId, visited)

        // Check each possible kind that uses this identifier
        for (const kind of possibleKinds) {
          if (!this.validLookupKinds.has(kind)) {
            continue
          }

          if (kind === 'ServerFn') {
            if (base === 'Root' || base === 'Builder') {
              return 'ServerFn'
            }
          } else if (kind === 'Middleware') {
            if (
              base === 'Root' ||
              base === 'Builder' ||
              base === 'Middleware'
            ) {
              return 'Middleware'
            }
          } else if (kind === 'IsomorphicFn') {
            if (
              base === 'Root' ||
              base === 'Builder' ||
              base === 'IsomorphicFn'
            ) {
              return 'IsomorphicFn'
            }
          }
        }
      }

      // Check if the object is a namespace import
      const receiver = is.Expression(callee.object)
        ? unwrapExpression(callee.object)
        : callee.object
      if (is.Identifier(receiver)) {
        const info = await this.getModuleInfo(fileId)
        const binding = info.bindings.get(receiver.name)
        if (
          binding &&
          binding.type === 'import' &&
          binding.importedName === '*'
        ) {
          return this.resolveImportKind(
            {
              type: 'import',
              source: binding.source,
              importedName: callee.property.name,
            },
            fileId,
            visited,
          )
        }
      }
      return this.resolveExprKind(callee.object, fileId, visited)
    }

    // handle nested expressions
    return this.resolveExprKind(callee, fileId, visited)
  }

  private async getModuleInfo(id: string) {
    let cached = this.moduleCache.get(id)
    if (cached) {
      return cached
    }

    await this.options.loadModule(id)

    cached = this.moduleCache.get(id)
    if (!cached) {
      throw new Error(`could not load module info for ${id}`)
    }
    return cached
  }
}

/**
 * Checks if a CallExpression has a method chain pattern that matches any of the lookup kinds.
 * E.g., `.handler()`, `.server()`, `.client()`, `.createMiddlewares()`
 */
function isMethodChainCandidate(
  node: t.CallExpression,
  lookupKinds: Set<LookupKind>,
): boolean {
  const callee = is.Expression(node.callee)
    ? unwrapExpression(node.callee)
    : node.callee
  if (!is.MemberExpression(callee) || !is.Identifier(callee.property)) {
    return false
  }

  // Use pre-computed map for O(1) lookup
  // IdentifierToKinds maps identifier -> Set<LookupKind> to handle shared identifiers
  const possibleKinds = IdentifierToKinds.get(callee.property.name)
  if (possibleKinds) {
    // Check if any of the possible kinds are in the valid lookup kinds
    for (const kind of possibleKinds) {
      if (lookupKinds.has(kind)) {
        return true
      }
    }
  }

  return false
}
