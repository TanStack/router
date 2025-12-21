/* eslint-disable import/no-commonjs */
import * as t from '@babel/types'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import babel from '@babel/core'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { handleCreateServerFn } from './handleCreateServerFn'
import { handleCreateMiddleware } from './handleCreateMiddleware'
import type { MethodChainPaths, RewriteCandidate } from './types'

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

type ExportEntry =
  | { tag: 'Normal'; name: string }
  | { tag: 'Default'; name: string }
  | { tag: 'Namespace'; name: string; targetId: string } // for `export * as ns from './x'`

type Kind = 'None' | `Root` | `Builder` | LookupKind

export type LookupKind = 'ServerFn' | 'Middleware'

const LookupSetup: Record<
  LookupKind,
  { candidateCallIdentifier: Set<string> }
> = {
  ServerFn: { candidateCallIdentifier: new Set(['handler']) },
  Middleware: {
    candidateCallIdentifier: new Set(['server', 'client', 'createMiddlewares']),
  },
}

// Pre-computed map: identifier name -> LookupKind for fast candidate detection
const IdentifierToKind = new Map<string, LookupKind>()
for (const [kind, setup] of Object.entries(LookupSetup) as Array<
  [LookupKind, { candidateCallIdentifier: Set<string> }]
>) {
  for (const id of setup.candidateCallIdentifier) {
    IdentifierToKind.set(id, kind)
  }
}

export type LookupConfig = {
  libName: string
  rootExport: string
}
interface ModuleInfo {
  id: string
  code: string
  ast: ReturnType<typeof parseAst>
  bindings: Map<string, Binding>
  exports: Map<string, ExportEntry>
  // Track `export * from './module'` declarations for re-export resolution
  reExportAllSources: Array<string>
}

export class ServerFnCompiler {
  private moduleCache = new Map<string, ModuleInfo>()
  private initialized = false
  private validLookupKinds: Set<LookupKind>
  // Fast lookup for direct imports from known libraries (e.g., '@tanstack/react-start')
  // Maps: libName → (exportName → Kind)
  // This allows O(1) resolution for the common case without async resolveId calls
  private knownRootImports = new Map<string, Map<string, Kind>>()
  constructor(
    private options: {
      env: 'client' | 'server'
      directive: string
      lookupConfigurations: Array<LookupConfig>
      lookupKinds: Set<LookupKind>
      loadModule: (id: string) => Promise<void>
      resolveId: (id: string, importer?: string) => Promise<string | null>
    },
  ) {
    this.validLookupKinds = options.lookupKinds
  }

  private async init(id: string) {
    await Promise.all(
      this.options.lookupConfigurations.map(async (config) => {
        const libId = await this.options.resolveId(config.libName, id)
        if (!libId) {
          throw new Error(`could not resolve "${config.libName}"`)
        }
        let rootModule = this.moduleCache.get(libId)
        if (!rootModule) {
          // insert root binding
          rootModule = {
            ast: null as any,
            bindings: new Map(),
            exports: new Map(),
            code: '',
            id: libId,
            reExportAllSources: [],
          }
          this.moduleCache.set(libId, rootModule)
        }

        rootModule.exports.set(config.rootExport, {
          tag: 'Normal',
          name: config.rootExport,
        })
        rootModule.exports.set('*', {
          tag: 'Namespace',
          name: config.rootExport,
          targetId: libId,
        })
        rootModule.bindings.set(config.rootExport, {
          type: 'var',
          init: t.identifier(config.rootExport),
          resolvedKind: `Root` satisfies Kind,
        })
        this.moduleCache.set(libId, rootModule)

        // Also populate the fast lookup map for direct imports
        let libExports = this.knownRootImports.get(config.libName)
        if (!libExports) {
          libExports = new Map()
          this.knownRootImports.set(config.libName, libExports)
        }
        libExports.set(config.rootExport, 'Root')
      }),
    )

    this.initialized = true
  }

  public ingestModule({ code, id }: { code: string; id: string }) {
    const ast = parseAst({ code })

    const bindings = new Map<string, Binding>()
    const exports = new Map<string, ExportEntry>()
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
                exports.set(d.id.name, { tag: 'Normal', name: d.id.name })
                bindings.set(d.id.name, { type: 'var', init: d.init ?? null })
              }
            }
          }
        }
        for (const sp of node.specifiers) {
          if (t.isExportNamespaceSpecifier(sp)) {
            exports.set(sp.exported.name, {
              tag: 'Namespace',
              name: sp.exported.name,
              targetId: node.source?.value || '',
            })
          }
          // export { local as exported }
          else if (t.isExportSpecifier(sp)) {
            const local = sp.local.name
            const exported = t.isIdentifier(sp.exported)
              ? sp.exported.name
              : sp.exported.value
            exports.set(exported, { tag: 'Normal', name: local })

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
          exports.set('default', { tag: 'Default', name: d.name })
        } else {
          const synth = '__default_export__'
          bindings.set(synth, { type: 'var', init: d as t.Expression })
          exports.set('default', { tag: 'Default', name: synth })
        }
      } else if (t.isExportAllDeclaration(node)) {
        // Handle `export * from './module'` syntax
        // Track the source so we can look up exports from it when needed
        reExportAllSources.push(node.source.value)
      }
    }

    const info: ModuleInfo = {
      code,
      id,
      ast,
      bindings,
      exports,
      reExportAllSources,
    }
    this.moduleCache.set(id, info)
    return info
  }

  public invalidateModule(id: string) {
    return this.moduleCache.delete(id)
  }

  public async compile({
    code,
    id,
    isProviderFile,
  }: {
    code: string
    id: string
    isProviderFile: boolean
  }) {
    if (!this.initialized) {
      await this.init(id)
    }
    const { bindings, ast } = this.ingestModule({ code, id })
    const candidates = this.collectCandidates(bindings)
    if (candidates.length === 0) {
      // this hook will only be invoked if there is `.handler(` | `.server(` | `.client(` in the code,
      // so not discovering a handler candidate is rather unlikely, but maybe possible?
      return null
    }

    // let's find out which of the candidates are actually server functions
    // Resolve all candidates in parallel for better performance
    const resolvedCandidates = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        kind: await this.resolveExprKind(candidate, id),
      })),
    )

    // Map from candidate/root node -> kind
    // Note: For top-level variable declarations, candidate === root (the outermost CallExpression)
    const toRewriteMap = new Map<t.CallExpression, LookupKind>()
    for (const { candidate, kind } of resolvedCandidates) {
      if (this.validLookupKinds.has(kind as LookupKind)) {
        toRewriteMap.set(candidate, kind as LookupKind)
      }
    }
    if (toRewriteMap.size === 0) {
      return null
    }

    // Single-pass traversal to find NodePaths and collect method chains
    const pathsToRewrite: Array<{
      path: babel.NodePath<t.CallExpression>
      kind: LookupKind
      methodChain: MethodChainPaths
    }> = []

    // First, collect all CallExpression paths in the AST for O(1) lookup
    const callExprPaths = new Map<
      t.CallExpression,
      babel.NodePath<t.CallExpression>
    >()

    babel.traverse(ast, {
      CallExpression(path) {
        callExprPaths.set(path.node, path)
      },
    })

    // Now process candidates - we can look up any CallExpression path in O(1)
    for (const [node, kind] of toRewriteMap) {
      const path = callExprPaths.get(node)
      if (!path) {
        continue
      }

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
            const currentPath = callExprPaths.get(currentNode)!
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
      }

      pathsToRewrite.push({ path, kind, methodChain })
    }

    // Verify we found all candidates (pathsToRewrite should have same size as toRewriteMap had)
    if (pathsToRewrite.length !== toRewriteMap.size) {
      throw new Error(
        `Internal error: could not find all paths to rewrite. please file an issue`,
      )
    }

    const refIdents = findReferencedIdentifiers(ast)

    for (const { path, kind, methodChain } of pathsToRewrite) {
      const candidate: RewriteCandidate = { path, methodChain }
      if (kind === 'ServerFn') {
        handleCreateServerFn(candidate, {
          env: this.options.env,
          code,
          directive: this.options.directive,
          isProviderFile,
        })
      } else {
        handleCreateMiddleware(candidate, {
          env: this.options.env,
        })
      }
    }

    deadCodeElimination(ast, refIdents)

    return generateFromAst(ast, {
      sourceMaps: true,
      sourceFileName: id,
      filename: id,
    })
  }

  // collects all candidate CallExpressions at top-level
  private collectCandidates(bindings: Map<string, Binding>) {
    const candidates: Array<t.CallExpression> = []

    for (const binding of bindings.values()) {
      if (binding.type === 'var') {
        const candidate = isCandidateCallExpression(
          binding.init,
          this.validLookupKinds,
        )
        if (candidate) {
          candidates.push(candidate)
        }
      }
    }
    return candidates
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
    // Prevent infinite loops in circular re-exports
    if (visitedModules.has(moduleInfo.id)) {
      return undefined
    }
    visitedModules.add(moduleInfo.id)

    // First check direct exports
    const directExport = moduleInfo.exports.get(exportName)
    if (directExport) {
      const binding = moduleInfo.bindings.get(directExport.name)
      if (binding) {
        return { moduleInfo, binding }
      }
    }

    // If not found, recursively check re-export-all sources in parallel
    // Valid code won't have duplicate exports across chains, so first match wins
    if (moduleInfo.reExportAllSources.length > 0) {
      const results = await Promise.all(
        moduleInfo.reExportAllSources.map(async (reExportSource) => {
          const reExportTarget = await this.options.resolveId(
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
          return result
        }
      }
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
      const target = await this.options.resolveId(binding.source, fileId)
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
      // Use direct Set.has() instead of iterating
      if (this.validLookupKinds.has(calleeKind as LookupKind)) {
        return calleeKind
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

      if (
        this.validLookupKinds.has('ServerFn') &&
        LookupSetup['ServerFn'].candidateCallIdentifier.has(prop)
      ) {
        const base = await this.resolveExprKind(callee.object, fileId, visited)
        if (base === 'Root' || base === 'Builder') {
          return 'ServerFn'
        }
        return 'None'
      } else if (
        this.validLookupKinds.has('Middleware') &&
        LookupSetup['Middleware'].candidateCallIdentifier.has(prop)
      ) {
        const base = await this.resolveExprKind(callee.object, fileId, visited)
        if (base === 'Root' || base === 'Builder' || base === 'Middleware') {
          return 'Middleware'
        }
        return 'None'
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
          const targetModuleId = await this.options.resolveId(
            binding.source,
            fileId,
          )
          if (targetModuleId) {
            const targetModule = await this.getModuleInfo(targetModuleId)
            const exportEntry = targetModule.exports.get(callee.property.name)
            if (exportEntry) {
              const exportedBinding = targetModule.bindings.get(
                exportEntry.name,
              )
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

function isCandidateCallExpression(
  node: t.Node | null | undefined,
  lookupKinds: Set<LookupKind>,
): t.CallExpression | undefined {
  if (!t.isCallExpression(node)) return undefined

  const callee = node.callee
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
    return undefined
  }

  // Use pre-computed map for O(1) lookup instead of iterating over lookupKinds
  const kind = IdentifierToKind.get(callee.property.name)
  if (kind && lookupKinds.has(kind)) {
    return node
  }

  return undefined
}
