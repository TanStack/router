/* eslint-disable import/no-commonjs */
import crypto from 'node:crypto'
import * as t from '@babel/types'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import babel from '@babel/core'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { handleCreateServerFn } from './handleCreateServerFn'
import { handleCreateMiddleware } from './handleCreateMiddleware'
import { handleCreateIsomorphicFn } from './handleCreateIsomorphicFn'
import { handleEnvOnlyFn } from './handleEnvOnly'
import { handleClientOnlyJSX } from './handleClientOnlyJSX'
import type {
  CompilationContext,
  MethodChainPaths,
  RewriteCandidate,
  ServerFn,
} from './types'
import type { CompileStartFrameworkOptions } from '../types'

type Binding =
  | {
      type: 'import'
      source: string
      importedName: string
      resolvedKind?: Kind
    }
  | {
      type: 'var'
      init: t.Expression | null
      resolvedKind?: Kind
    }

type Kind = 'None' | `Root` | `Builder` | LookupKind

export type LookupKind =
  | 'ServerFn'
  | 'Middleware'
  | 'IsomorphicFn'
  | 'ServerOnlyFn'
  | 'ClientOnlyFn'
  | 'ClientOnlyJSX'

// Detection strategy for each kind
type MethodChainSetup = {
  type: 'methodChain'
  candidateCallIdentifier: Set<string>
}
type DirectCallSetup = {
  type: 'directCall'
  // The factory function name used to create this kind (e.g., 'createServerOnlyFn')
  factoryName: string
}
type JSXSetup = { type: 'jsx'; componentName: string }

const LookupSetup: Record<
  LookupKind,
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
  ServerOnlyFn: { type: 'directCall', factoryName: 'createServerOnlyFn' },
  ClientOnlyFn: { type: 'directCall', factoryName: 'createClientOnlyFn' },
  ClientOnlyJSX: { type: 'jsx', componentName: 'ClientOnly' },
}

// Single source of truth for detecting which kinds are present in code
// These patterns are used for:
// 1. Pre-scanning code to determine which kinds to look for (before AST parsing)
// 2. Deriving the plugin's transform code filter
export const KindDetectionPatterns: Record<LookupKind, RegExp> = {
  ServerFn: /\bcreateServerFn\b|\.\s*handler\s*\(/,
  Middleware: /createMiddleware/,
  IsomorphicFn: /createIsomorphicFn/,
  ServerOnlyFn: /createServerOnlyFn/,
  ClientOnlyFn: /createClientOnlyFn/,
  ClientOnlyJSX: /<ClientOnly|import\s*\{[^}]*\bClientOnly\b/,
}

// Which kinds are valid for each environment
export const LookupKindsPerEnv: Record<'client' | 'server', Set<LookupKind>> = {
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

/**
 * Handler type for processing candidates of a specific kind.
 * The kind is passed as the third argument to allow shared handlers (like handleEnvOnlyFn).
 */
type KindHandler = (
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
  kind: LookupKind,
) => void

/**
 * Registry mapping each LookupKind to its handler function.
 * When adding a new kind, add its handler here.
 */
const KindHandlers: Record<
  Exclude<LookupKind, 'ClientOnlyJSX'>,
  KindHandler
> = {
  ServerFn: handleCreateServerFn,
  Middleware: handleCreateMiddleware,
  IsomorphicFn: handleCreateIsomorphicFn,
  ServerOnlyFn: handleEnvOnlyFn,
  ClientOnlyFn: handleEnvOnlyFn,
  // ClientOnlyJSX is handled separately via JSX traversal, not here
}

// All lookup kinds as an array for iteration with proper typing
const AllLookupKinds = Object.keys(LookupSetup) as Array<LookupKind>

/**
 * Detects which LookupKinds are present in the code using string matching.
 * This is a fast pre-scan before AST parsing to limit the work done during compilation.
 */
export function detectKindsInCode(
  code: string,
  env: 'client' | 'server',
): Set<LookupKind> {
  const detected = new Set<LookupKind>()
  const validForEnv = LookupKindsPerEnv[env]

  for (const kind of AllLookupKinds) {
    if (validForEnv.has(kind) && KindDetectionPatterns[kind].test(code)) {
      detected.add(kind)
    }
  }

  return detected
}

// Pre-computed map: identifier name -> Set<LookupKind> for fast candidate detection (method chain only)
// Multiple kinds can share the same identifier (e.g., 'server' and 'client' are used by both Middleware and IsomorphicFn)
const IdentifierToKinds = new Map<string, Set<LookupKind>>()
for (const kind of AllLookupKinds) {
  const setup = LookupSetup[kind]
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

// Factory function names for direct call patterns.
// Used to filter nested candidates - we only want to include actual factory calls,
// not invocations of already-created functions (e.g., `myServerFn()` should NOT be a candidate)
const DirectCallFactoryNames = new Set<string>()
for (const kind of AllLookupKinds) {
  const setup = LookupSetup[kind]
  if (setup.type === 'directCall') {
    DirectCallFactoryNames.add(setup.factoryName)
  }
}

export type LookupConfig = {
  libName: string
  rootExport: string
  kind: LookupKind | 'Root' // 'Root' for builder pattern, LookupKind for direct call
}

interface ModuleInfo {
  id: string
  bindings: Map<string, Binding>
  // Maps exported name → local binding name
  exports: Map<string, string>
  // Track `export * from './module'` declarations for re-export resolution
  reExportAllSources: Array<string>
}

/**
 * Computes whether any file kinds need direct-call candidate detection.
 * This applies to directCall types (ServerOnlyFn, ClientOnlyFn).
 */
function needsDirectCallDetection(kinds: Set<LookupKind>): boolean {
  for (const kind of kinds) {
    if (LookupSetup[kind].type === 'directCall') {
      return true
    }
  }
  return false
}

/**
 * Checks if all kinds in the set are guaranteed to be top-level only.
 * Only ServerFn is always declared at module level (must be assigned to a variable).
 * Middleware, IsomorphicFn, ServerOnlyFn, ClientOnlyFn can be nested inside functions.
 * When all kinds are top-level-only, we can use a fast scan instead of full traversal.
 */
function areAllKindsTopLevelOnly(kinds: Set<LookupKind>): boolean {
  return kinds.size === 1 && kinds.has('ServerFn')
}

/**
 * Checks if we need to detect JSX elements (e.g., <ClientOnly>).
 */
function needsJSXDetection(kinds: Set<LookupKind>): boolean {
  for (const kind of kinds) {
    if (LookupSetup[kind].type === 'jsx') {
      return true
    }
  }
  return false
}

/**
 * Checks if a CallExpression is a direct-call candidate for NESTED detection.
 * Returns true if the callee is a known factory function name.
 * This is stricter than top-level detection because we need to filter out
 * invocations of existing server functions (e.g., `myServerFn()`).
 */
function isNestedDirectCallCandidate(node: t.CallExpression): boolean {
  let calleeName: string | undefined
  if (t.isIdentifier(node.callee)) {
    calleeName = node.callee.name
  } else if (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property)
  ) {
    calleeName = node.callee.property.name
  }
  return calleeName !== undefined && DirectCallFactoryNames.has(calleeName)
}

/**
 * Checks if a CallExpression path is a top-level direct-call candidate.
 * Top-level means the call is the init of a VariableDeclarator at program level.
 * We accept any simple identifier call or namespace call at top level
 * (e.g., `createServerOnlyFn()`, `TanStackStart.createServerOnlyFn()`) and let
 * resolution verify it. This handles renamed imports.
 */
function isTopLevelDirectCallCandidate(
  path: babel.NodePath<t.CallExpression>,
): boolean {
  const node = path.node

  // Must be a simple identifier call or namespace call
  const isSimpleCall =
    t.isIdentifier(node.callee) ||
    (t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      t.isIdentifier(node.callee.property))

  if (!isSimpleCall) {
    return false
  }

  // Must be top-level: VariableDeclarator -> VariableDeclaration -> Program
  const parent = path.parent
  if (!t.isVariableDeclarator(parent) || parent.init !== node) {
    return false
  }
  const grandParent = path.parentPath.parent
  if (!t.isVariableDeclaration(grandParent)) {
    return false
  }
  return t.isProgram(path.parentPath.parentPath?.parent)
}

export class StartCompiler {
  private moduleCache = new Map<string, ModuleInfo>()
  private initialized = false
  private validLookupKinds: Set<LookupKind>
  private resolveIdCache = new Map<string, string | null>()
  private exportResolutionCache = new Map<
    string,
    Map<string, { moduleInfo: ModuleInfo; binding: Binding } | null>
  >()
  // Fast lookup for direct imports from known libraries (e.g., '@tanstack/react-start')
  // Maps: libName → (exportName → Kind)
  // This allows O(1) resolution for the common case without async resolveId calls
  private knownRootImports = new Map<string, Map<string, Kind>>()

  // For generating unique function IDs in production builds
  private entryIdToFunctionId = new Map<string, string>()
  private functionIds = new Set<string>()

  // Cached root path with trailing slash for dev mode function ID generation
  private _rootWithTrailingSlash: string | undefined

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
      /**
       * Returns the currently known server functions from previous builds.
       * Used by server callers to look up canonical extracted filenames.
       */
      getKnownServerFns?: () => Record<string, ServerFn>
    },
  ) {
    this.validLookupKinds = options.lookupKinds
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
      // In dev, encode the file path and export name for direct lookup
      let file = opts.extractedFilename
      if (opts.extractedFilename.startsWith(this.rootWithTrailingSlash)) {
        file = opts.extractedFilename.slice(this.rootWithTrailingSlash.length)
      }
      file = `/@id/${file}`

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
      if (this.options.generateFunctionId) {
        functionId = this.options.generateFunctionId({
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

  private get rootWithTrailingSlash(): string {
    if (this._rootWithTrailingSlash === undefined) {
      this._rootWithTrailingSlash = this.options.root.endsWith('/')
        ? this.options.root
        : `${this.options.root}/`
    }
    return this._rootWithTrailingSlash
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

  private async init() {
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

    await Promise.all(
      this.options.lookupConfigurations.map(async (config) => {
        // Populate the fast lookup map for direct imports (by package name)
        // This allows O(1) recognition of imports from known packages.
        let libExports = this.knownRootImports.get(config.libName)
        if (!libExports) {
          libExports = new Map()
          this.knownRootImports.set(config.libName, libExports)
        }
        libExports.set(config.rootExport, config.kind)

        // For JSX lookups (e.g., ClientOnlyJSX), we only need the knownRootImports
        // fast path to verify imports. Skip module resolution which may fail if
        // the package isn't a direct dependency (e.g., @tanstack/react-router from
        // within start-plugin-core).
        if (config.kind !== 'Root') {
          const setup = LookupSetup[config.kind]
          if (setup.type === 'jsx') {
            return
          }
        }

        const libId = await this.resolveIdCached(config.libName)
        if (!libId) {
          throw new Error(`could not resolve "${config.libName}"`)
        }
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
      }),
    )

    this.initialized = true
  }

  /**
   * Extracts bindings and exports from an already-parsed AST.
   * This is the core logic shared by ingestModule and ingestModuleFromAst.
   */
  private extractModuleInfo(
    ast: ReturnType<typeof parseAst>,
    id: string,
  ): ModuleInfo {
    const bindings = new Map<string, Binding>()
    const exports = new Map<string, string>()
    const reExportAllSources: Array<string> = []

    // we are only interested in top-level bindings, hence we don't traverse the AST
    // instead we only iterate over the program body
    for (const node of ast.program.body) {
      if (t.isImportDeclaration(node)) {
        const source = node.source.value
        for (const s of node.specifiers) {
          if (t.isImportSpecifier(s)) {
            const importedName = t.isIdentifier(s.imported)
              ? s.imported.name
              : s.imported.value
            bindings.set(s.local.name, { type: 'import', source, importedName })
          } else if (t.isImportDefaultSpecifier(s)) {
            bindings.set(s.local.name, {
              type: 'import',
              source,
              importedName: 'default',
            })
          } else if (t.isImportNamespaceSpecifier(s)) {
            bindings.set(s.local.name, {
              type: 'import',
              source,
              importedName: '*',
            })
          }
        }
      } else if (t.isVariableDeclaration(node)) {
        for (const decl of node.declarations) {
          if (t.isIdentifier(decl.id)) {
            bindings.set(decl.id.name, {
              type: 'var',
              init: decl.init ?? null,
            })
          }
        }
      } else if (t.isExportNamedDeclaration(node)) {
        // export const foo = ...
        if (node.declaration) {
          if (t.isVariableDeclaration(node.declaration)) {
            for (const d of node.declaration.declarations) {
              if (t.isIdentifier(d.id)) {
                exports.set(d.id.name, d.id.name)
                bindings.set(d.id.name, { type: 'var', init: d.init ?? null })
              }
            }
          }
        }
        for (const sp of node.specifiers) {
          if (t.isExportNamespaceSpecifier(sp)) {
            exports.set(sp.exported.name, sp.exported.name)
          }
          // export { local as exported }
          else if (t.isExportSpecifier(sp)) {
            const local = sp.local.name
            const exported = t.isIdentifier(sp.exported)
              ? sp.exported.name
              : sp.exported.value
            exports.set(exported, local)

            // When re-exporting from another module (export { foo } from './module'),
            // create an import binding so the server function can be resolved
            if (node.source) {
              bindings.set(local, {
                type: 'import',
                source: node.source.value,
                importedName: local,
              })
            }
          }
        }
      } else if (t.isExportDefaultDeclaration(node)) {
        const d = node.declaration
        if (t.isIdentifier(d)) {
          exports.set('default', d.name)
        } else {
          const synth = '__default_export__'
          bindings.set(synth, { type: 'var', init: d as t.Expression })
          exports.set('default', synth)
        }
      } else if (t.isExportAllDeclaration(node)) {
        // Handle `export * from './module'` syntax
        // Track the source so we can look up exports from it when needed
        reExportAllSources.push(node.source.value)
      }
    }

    const info: ModuleInfo = {
      id,
      bindings,
      exports,
      reExportAllSources,
    }
    this.moduleCache.set(id, info)
    return info
  }

  public ingestModule({ code, id }: { code: string; id: string }) {
    const ast = parseAst({ code })
    const info = this.extractModuleInfo(ast, id)
    return { info, ast }
  }

  public invalidateModule(id: string) {
    // Note: Resolution caches (resolveIdCache, exportResolutionCache) are only
    // used in build mode where there's no HMR. In dev mode, caching is disabled,
    // so we only need to invalidate the moduleCache here.
    return this.moduleCache.delete(id)
  }

  public async compile({
    code,
    id,
    detectedKinds,
  }: {
    code: string
    id: string
    /** Pre-detected kinds present in this file. If not provided, all valid kinds are checked. */
    detectedKinds?: Set<LookupKind>
  }) {
    if (!this.initialized) {
      await this.init()
    }

    // Use detected kinds if provided, otherwise fall back to all valid kinds for this env
    const fileKinds = detectedKinds
      ? new Set([...detectedKinds].filter((k) => this.validLookupKinds.has(k)))
      : this.validLookupKinds

    // Early exit if no kinds to process
    if (fileKinds.size === 0) {
      return null
    }

    const checkDirectCalls = needsDirectCallDetection(fileKinds)
    // Optimization: ServerFn is always a top-level declaration (must be assigned to a variable).
    // If the file only has ServerFn, we can skip full AST traversal and only visit
    // the specific top-level declarations that have candidates.
    const canUseFastPath = areAllKindsTopLevelOnly(fileKinds)

    // Always parse and extract module info upfront.
    // This ensures the module is cached for import resolution even if no candidates are found.
    const { ast } = this.ingestModule({ code, id })

    // Single-pass traversal to:
    // 1. Collect candidate paths (only candidates, not all CallExpressions)
    // 2. Build a map for looking up paths of nested calls in method chains
    const candidatePaths: Array<babel.NodePath<t.CallExpression>> = []
    // Map for nested chain lookup - only populated for CallExpressions that are
    // part of a method chain (callee.object is a CallExpression)
    const chainCallPaths = new Map<
      t.CallExpression,
      babel.NodePath<t.CallExpression>
    >()

    // JSX candidates (e.g., <ClientOnly>)
    const jsxCandidatePaths: Array<babel.NodePath<t.JSXElement>> = []
    const checkJSX = needsJSXDetection(fileKinds)
    // Get module info that was just cached by ingestModule
    const moduleInfo = this.moduleCache.get(id)!

    if (canUseFastPath) {
      // Fast path: only visit top-level statements that have potential candidates

      // Collect indices of top-level statements that contain candidates
      const candidateIndices: Array<number> = []
      for (let i = 0; i < ast.program.body.length; i++) {
        const node = ast.program.body[i]!
        let declarations: Array<t.VariableDeclarator> | undefined

        if (t.isVariableDeclaration(node)) {
          declarations = node.declarations
        } else if (t.isExportNamedDeclaration(node) && node.declaration) {
          if (t.isVariableDeclaration(node.declaration)) {
            declarations = node.declaration.declarations
          }
        }

        if (declarations) {
          for (const decl of declarations) {
            if (decl.init && t.isCallExpression(decl.init)) {
              if (isMethodChainCandidate(decl.init, fileKinds)) {
                candidateIndices.push(i)
                break // Only need to mark this statement once
              }
            }
          }
        }
      }

      // Early exit: no potential candidates found at top level
      if (candidateIndices.length === 0) {
        return null
      }

      // Targeted traversal: only visit the specific statements that have candidates
      // This is much faster than traversing the entire AST
      babel.traverse(ast, {
        Program(programPath) {
          const bodyPaths = programPath.get('body')
          for (const idx of candidateIndices) {
            const stmtPath = bodyPaths[idx]
            if (!stmtPath) continue

            // Traverse only this statement's subtree
            stmtPath.traverse({
              CallExpression(path) {
                const node = path.node
                const parent = path.parent

                // Check if this call is part of a larger chain (inner call)
                if (
                  t.isMemberExpression(parent) &&
                  t.isCallExpression(path.parentPath.parent)
                ) {
                  chainCallPaths.set(node, path)
                  return
                }

                // Method chain pattern
                if (isMethodChainCandidate(node, fileKinds)) {
                  candidatePaths.push(path)
                }
              },
            })
          }
          // Stop traversal after processing Program
          programPath.stop()
        },
      })
    } else {
      // Normal path: full traversal for non-fast-path kinds
      babel.traverse(ast, {
        CallExpression: (path) => {
          const node = path.node
          const parent = path.parent

          // Check if this call is part of a larger chain (inner call)
          // If so, store it for method chain lookup but don't treat as candidate
          if (
            t.isMemberExpression(parent) &&
            t.isCallExpression(path.parentPath.parent)
          ) {
            // This is an inner call in a chain - store for later lookup
            chainCallPaths.set(node, path)
            return
          }

          // Pattern 1: Method chain pattern (.handler(), .server(), .client(), etc.)
          if (isMethodChainCandidate(node, fileKinds)) {
            candidatePaths.push(path)
            return
          }

          // Pattern 2: Direct call pattern
          if (checkDirectCalls) {
            if (isTopLevelDirectCallCandidate(path)) {
              candidatePaths.push(path)
            } else if (isNestedDirectCallCandidate(node)) {
              candidatePaths.push(path)
            }
          }
        },
        // Pattern 3: JSX element pattern (e.g., <ClientOnly>)
        // Collect JSX elements where the component is imported from a known package
        // and resolves to a JSX kind (e.g., ClientOnly from @tanstack/react-router)
        JSXElement: (path) => {
          if (!checkJSX) return

          const openingElement = path.node.openingElement
          const nameNode = openingElement.name

          // Only handle simple identifier names (not namespaced or member expressions)
          if (!t.isJSXIdentifier(nameNode)) return

          const componentName = nameNode.name
          const binding = moduleInfo.bindings.get(componentName)

          // Must be an import binding from a known package
          if (!binding || binding.type !== 'import') return

          // Verify the import source is a known TanStack router package
          const knownExports = this.knownRootImports.get(binding.source)
          if (!knownExports) return

          // Verify the imported name resolves to a JSX kind (e.g., ClientOnlyJSX)
          const kind = knownExports.get(binding.importedName)
          if (kind !== 'ClientOnlyJSX') return

          jsxCandidatePaths.push(path)
        },
      })
    }

    if (candidatePaths.length === 0 && jsxCandidatePaths.length === 0) {
      return null
    }

    // Resolve all candidates in parallel to determine their kinds
    const resolvedCandidates = await Promise.all(
      candidatePaths.map(async (path) => ({
        path,
        kind: await this.resolveExprKind(path.node, id),
      })),
    )

    // Filter to valid candidates
    const validCandidates = resolvedCandidates.filter(({ kind }) =>
      this.validLookupKinds.has(kind as Exclude<LookupKind, 'ClientOnlyJSX'>),
    ) as Array<{
      path: babel.NodePath<t.CallExpression>
      kind: Exclude<LookupKind, 'ClientOnlyJSX'>
    }>

    if (validCandidates.length === 0 && jsxCandidatePaths.length === 0) {
      return null
    }

    // Process valid candidates to collect method chains
    const pathsToRewrite: Array<{
      path: babel.NodePath<t.CallExpression>
      kind: Exclude<LookupKind, 'ClientOnlyJSX'>
      methodChain: MethodChainPaths
    }> = []

    for (const { path, kind } of validCandidates) {
      const node = path.node

      // Collect method chain paths by walking DOWN from root through the chain
      const methodChain: MethodChainPaths = {
        middleware: null,
        inputValidator: null,
        handler: null,
        server: null,
        client: null,
      }

      // Walk down the call chain using nodes, look up paths from map
      let currentNode: t.CallExpression = node
      let currentPath: babel.NodePath<t.CallExpression> = path

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const callee = currentNode.callee
        if (!t.isMemberExpression(callee)) {
          break
        }

        // Record method chain path if it's a known method
        if (t.isIdentifier(callee.property)) {
          const name = callee.property.name as keyof MethodChainPaths
          if (name in methodChain) {
            // Get first argument path
            const args = currentPath.get('arguments')
            const firstArgPath =
              Array.isArray(args) && args.length > 0 ? (args[0] ?? null) : null
            methodChain[name] = {
              callPath: currentPath,
              firstArgPath,
            }
          }
        }

        // Move to the inner call (the object of the member expression)
        if (!t.isCallExpression(callee.object)) {
          break
        }
        currentNode = callee.object
        // Look up path from chain map, or use candidate path if not found
        const nextPath = chainCallPaths.get(currentNode)
        if (!nextPath) {
          break
        }
        currentPath = nextPath
      }

      pathsToRewrite.push({ path, kind, methodChain })
    }

    const refIdents = findReferencedIdentifiers(ast)

    const context: CompilationContext = {
      ast,
      id,
      code,
      env: this.options.env,
      envName: this.options.envName,
      root: this.options.root,
      framework: this.options.framework,
      providerEnvName: this.options.providerEnvName,

      generateFunctionId: (opts) => this.generateFunctionId(opts),
      getKnownServerFns: () => this.options.getKnownServerFns?.() ?? {},
      onServerFnsById: this.options.onServerFnsById,
    }

    // Group candidates by kind for batch processing
    const candidatesByKind = new Map<
      Exclude<LookupKind, 'ClientOnlyJSX'>,
      Array<RewriteCandidate>
    >()

    for (const { path: candidatePath, kind, methodChain } of pathsToRewrite) {
      const candidate: RewriteCandidate = { path: candidatePath, methodChain }
      const existing = candidatesByKind.get(kind)
      if (existing) {
        existing.push(candidate)
      } else {
        candidatesByKind.set(kind, [candidate])
      }
    }

    // Process each kind using its registered handler
    for (const [kind, candidates] of candidatesByKind) {
      const handler = KindHandlers[kind]
      handler(candidates, context, kind)
    }

    // Handle JSX candidates (e.g., <ClientOnly>)
    // Validation was already done during traversal - just call the handler
    for (const jsxPath of jsxCandidatePaths) {
      handleClientOnlyJSX(jsxPath, { env: 'server' })
    }

    deadCodeElimination(ast, refIdents)

    return generateFromAst(ast, {
      sourceMaps: true,
      sourceFileName: id,
      filename: id,
    })
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
  ): Promise<{ moduleInfo: ModuleInfo; binding: Binding } | undefined> {
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
        const result = { moduleInfo, binding }
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

  private async resolveBindingKind(
    binding: Binding,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (binding.resolvedKind) {
      return binding.resolvedKind
    }
    if (binding.type === 'import') {
      // Fast path: check if this is a direct import from a known library
      // (e.g., import { createServerFn } from '@tanstack/react-start')
      // This avoids async resolveId calls for the common case
      const knownExports = this.knownRootImports.get(binding.source)
      if (knownExports) {
        const kind = knownExports.get(binding.importedName)
        if (kind) {
          binding.resolvedKind = kind
          return kind
        }
      }

      // Slow path: resolve through the module graph
      const target = await this.resolveIdCached(binding.source, fileId)
      if (!target) {
        return 'None'
      }

      const importedModule = await this.getModuleInfo(target)

      // Find the export, recursively searching through export * from chains
      const found = await this.findExportInModule(
        importedModule,
        binding.importedName,
      )

      if (!found) {
        return 'None'
      }

      const { moduleInfo: foundModule, binding: foundBinding } = found

      if (foundBinding.resolvedKind) {
        return foundBinding.resolvedKind
      }

      const resolvedKind = await this.resolveBindingKind(
        foundBinding,
        foundModule.id,
        visited,
      )
      foundBinding.resolvedKind = resolvedKind
      return resolvedKind
    }

    const resolvedKind = await this.resolveExprKind(
      binding.init,
      fileId,
      visited,
    )
    binding.resolvedKind = resolvedKind
    return resolvedKind
  }

  /**
   * Checks if an identifier is a direct import from a known factory library.
   * Returns true for imports like `import { createServerOnlyFn } from '@tanstack/react-start'`
   * or renamed imports like `import { createServerOnlyFn as myFn } from '...'`.
   * Returns false for local variables that hold the result of calling a factory.
   */
  private async isKnownFactoryImport(
    identName: string,
    fileId: string,
  ): Promise<boolean> {
    const info = await this.getModuleInfo(fileId)
    const binding = info.bindings.get(identName)

    if (!binding || binding.type !== 'import') {
      return false
    }

    // Check if it's imported from a known library
    const knownExports = this.knownRootImports.get(binding.source)
    return knownExports !== undefined && knownExports.has(binding.importedName)
  }

  private async resolveExprKind(
    expr: t.Expression | null,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (!expr) {
      return 'None'
    }

    // Unwrap common TypeScript/parenthesized wrappers first for efficiency
    while (
      t.isTSAsExpression(expr) ||
      t.isTSNonNullExpression(expr) ||
      t.isParenthesizedExpression(expr)
    ) {
      expr = expr.expression
    }

    let result: Kind = 'None'

    if (t.isCallExpression(expr)) {
      if (!t.isExpression(expr.callee)) {
        return 'None'
      }
      const calleeKind = await this.resolveCalleeKind(
        expr.callee,
        fileId,
        visited,
      )
      if (calleeKind === 'Root' || calleeKind === 'Builder') {
        return 'Builder'
      }
      // For method chain patterns (callee is MemberExpression like .server() or .client()),
      // return the resolved kind if valid
      if (t.isMemberExpression(expr.callee)) {
        if (this.validLookupKinds.has(calleeKind as LookupKind)) {
          return calleeKind
        }
      }
      // For direct calls (callee is Identifier), only return the kind if the
      // callee is a direct import from a known library (e.g., createServerOnlyFn).
      // Calling a local variable that holds an already-built function (e.g., myServerOnlyFn())
      // should NOT be treated as a transformation candidate.
      if (t.isIdentifier(expr.callee)) {
        const isFactoryImport = await this.isKnownFactoryImport(
          expr.callee.name,
          fileId,
        )
        if (
          isFactoryImport &&
          this.validLookupKinds.has(calleeKind as LookupKind)
        ) {
          return calleeKind
        }
      }
    } else if (t.isMemberExpression(expr) && t.isIdentifier(expr.property)) {
      result = await this.resolveCalleeKind(expr.object, fileId, visited)
    }

    if (result === 'None' && t.isIdentifier(expr)) {
      result = await this.resolveIdentifierKind(expr.name, fileId, visited)
    }

    return result
  }

  private async resolveCalleeKind(
    callee: t.Expression,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (t.isIdentifier(callee)) {
      return this.resolveIdentifierKind(callee.name, fileId, visited)
    }

    if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
      const prop = callee.property.name

      // Check if this property matches any method chain pattern
      const possibleKinds = IdentifierToKinds.get(prop)
      if (possibleKinds) {
        // Resolve base expression ONCE and reuse for all pattern checks
        const base = await this.resolveExprKind(callee.object, fileId, visited)

        // Check each possible kind that uses this identifier
        for (const kind of possibleKinds) {
          if (!this.validLookupKinds.has(kind)) continue

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
      if (t.isIdentifier(callee.object)) {
        const info = await this.getModuleInfo(fileId)
        const binding = info.bindings.get(callee.object.name)
        if (
          binding &&
          binding.type === 'import' &&
          binding.importedName === '*'
        ) {
          // resolve the property from the target module
          const targetModuleId = await this.resolveIdCached(
            binding.source,
            fileId,
          )
          if (targetModuleId) {
            const targetModule = await this.getModuleInfo(targetModuleId)
            const localBindingName = targetModule.exports.get(
              callee.property.name,
            )
            if (localBindingName) {
              const exportedBinding =
                targetModule.bindings.get(localBindingName)
              if (exportedBinding) {
                return await this.resolveBindingKind(
                  exportedBinding,
                  targetModule.id,
                  visited,
                )
              }
            }
          } else {
            return 'None'
          }
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
  const callee = node.callee
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
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
