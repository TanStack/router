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
}

export class ServerFnCompiler {
  private moduleCache = new Map<string, ModuleInfo>()
  private initialized = false
  private validLookupKinds: Set<LookupKind>
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
      }),
    )

    this.initialized = true
  }

  public ingestModule({ code, id }: { code: string; id: string }) {
    const ast = parseAst({ code })

    const bindings = new Map<string, Binding>()
    const exports = new Map<string, ExportEntry>()

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
      }
    }

    const info: ModuleInfo = { code, id, ast, bindings, exports }
    this.moduleCache.set(id, info)
    return info
  }

  public invalidateModule(id: string) {
    return this.moduleCache.delete(id)
  }

  public async compile({ code, id }: { code: string; id: string }) {
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
    const toRewrite: Array<{
      callExpression: t.CallExpression
      kind: LookupKind
    }> = []
    for (const handler of candidates) {
      const kind = await this.resolveExprKind(handler, id)
      if (this.validLookupKinds.has(kind as LookupKind)) {
        toRewrite.push({ callExpression: handler, kind: kind as LookupKind })
      }
    }
    if (toRewrite.length === 0) {
      return null
    }

    const pathsToRewrite: Array<{
      nodePath: babel.NodePath<t.CallExpression>
      kind: LookupKind
    }> = []
    babel.traverse(ast, {
      CallExpression(path) {
        const found = toRewrite.findIndex((h) => path.node === h.callExpression)
        if (found !== -1) {
          pathsToRewrite.push({ nodePath: path, kind: toRewrite[found]!.kind })
          // delete from toRewrite
          toRewrite.splice(found, 1)
        }
      },
    })

    if (toRewrite.length > 0) {
      throw new Error(
        `Internal error: could not find all paths to rewrite. please file an issue`,
      )
    }

    const refIdents = findReferencedIdentifiers(ast)

    pathsToRewrite.map((p) => {
      if (p.kind === 'ServerFn') {
        handleCreateServerFn(p.nodePath, {
          env: this.options.env,
          code,
          directive: this.options.directive,
        })
      } else {
        handleCreateMiddleware(p.nodePath, { env: this.options.env })
      }
    })

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
        const handler = isCandidateCallExpression(
          binding.init,
          this.validLookupKinds,
        )
        if (handler) {
          candidates.push(handler)
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

  private async resolveBindingKind(
    binding: Binding,
    fileId: string,
    visited = new Set<string>(),
  ): Promise<Kind> {
    if (binding.resolvedKind) {
      return binding.resolvedKind
    }
    if (binding.type === 'import') {
      const target = await this.options.resolveId(binding.source, fileId)
      if (!target) {
        return 'None'
      }

      const importedModule = await this.getModuleInfo(target)

      const moduleExport = importedModule.exports.get(binding.importedName)
      if (!moduleExport) {
        return 'None'
      }
      const importedBinding = importedModule.bindings.get(moduleExport.name)
      if (!importedBinding) {
        return 'None'
      }
      if (importedBinding.resolvedKind) {
        return importedBinding.resolvedKind
      }

      const resolvedKind = await this.resolveBindingKind(
        importedBinding,
        importedModule.id,
        visited,
      )
      importedBinding.resolvedKind = resolvedKind
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
      if (calleeKind !== 'None') {
        if (calleeKind === `Root` || calleeKind === `Builder`) {
          return `Builder`
        }
        for (const kind of this.validLookupKinds) {
          if (calleeKind === kind) {
            return kind
          }
        }
      }
    } else if (t.isMemberExpression(expr) && t.isIdentifier(expr.property)) {
      result = await this.resolveCalleeKind(expr.object, fileId, visited)
    }

    if (result === 'None' && t.isIdentifier(expr)) {
      result = await this.resolveIdentifierKind(expr.name, fileId, visited)
    }

    if (result === 'None' && t.isTSAsExpression(expr)) {
      result = await this.resolveExprKind(expr.expression, fileId, visited)
    }
    if (result === 'None' && t.isTSNonNullExpression(expr)) {
      result = await this.resolveExprKind(expr.expression, fileId, visited)
    }
    if (result === 'None' && t.isParenthesizedExpression(expr)) {
      result = await this.resolveExprKind(expr.expression, fileId, visited)
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
): undefined | t.CallExpression {
  if (!t.isCallExpression(node)) return undefined

  const callee = node.callee
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
    return undefined
  }
  for (const kind of lookupKinds) {
    if (LookupSetup[kind].candidateCallIdentifier.has(callee.property.name)) {
      return node
    }
  }

  return undefined
}
