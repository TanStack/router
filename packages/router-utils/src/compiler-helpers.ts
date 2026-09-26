import { bindingIdentifiers, is, nameOf, walk } from 'yuku-ast'
import { generatedReferenceOf } from './ast'
import type { Module, Scope, Symbol } from 'yuku-analyzer'
import type { Expression, Node, Program } from '@yuku-toolchain/types'

export interface ModuleDeclarationGraph {
  declarations: Map<Symbol, Node>
  dependencies: Map<Symbol, Set<Symbol>>
  declarationSymbols: Map<Node, Set<Symbol>>
}

/** Runtime references resolved by Yuku, including JSX and excluding shadowed names. */
export function collectModuleReferences(
  module: Module,
  node: Node,
): Set<Symbol> {
  const references = new Set<Symbol>()
  module.walk(
    {
      enter(current) {
        const reference = module.referenceOf(current)
        if (
          reference &&
          !reference.inTypePosition &&
          reference.symbol?.scope === module.rootScope
        ) {
          references.add(reference.symbol)
        }
      },
    },
    node,
  )
  return references
}

function declarationOf(module: Module, identifier: Node): Node | undefined {
  let current: Node | null = identifier
  while (current) {
    if (is.VariableDeclarator(current)) {
      const statement = module.parentOf(current)
      const parent = statement && module.parentOf(statement)
      if (
        is.ForInStatement(parent) ||
        is.ForOfStatement(parent) ||
        is.ForStatement(parent)
      ) {
        return undefined
      }
      return current
    }
    if (is.TSEnumDeclaration(current) || is.TSModuleDeclaration(current)) {
      return current.id === identifier ? current : undefined
    }
    if (
      is.FunctionDeclaration(current) ||
      is.ClassDeclaration(current) ||
      is.TSDeclareFunction(current)
    ) {
      return current.id === identifier ? current : undefined
    }
    if (
      is.ImportSpecifier(current) ||
      is.ImportDefaultSpecifier(current) ||
      is.ImportNamespaceSpecifier(current)
    ) {
      return current
    }
    if (is.Function(current) || is.Class(current) || is.Program(current)) {
      return undefined
    }
    current = module.parentOf(current)
  }
  return undefined
}

function declarationIndex(
  module: Module,
  symbols: Array<Symbol>,
): Pick<ModuleDeclarationGraph, 'declarations' | 'declarationSymbols'> {
  const declarations = new Map<Symbol, Node>()
  const declarationSymbols = new Map<Node, Set<Symbol>>()
  for (const symbol of symbols) {
    for (const identifier of symbol.declarations) {
      const declaration = declarationOf(module, identifier)
      if (!declaration) {
        continue
      }
      const previous = declarations.get(symbol)
      if (
        !previous ||
        (is.TSDeclareFunction(previous) && !is.TSDeclareFunction(declaration))
      ) {
        declarations.set(symbol, declaration)
      }
      const siblings = declarationSymbols.get(declaration) ?? new Set<Symbol>()
      siblings.add(symbol)
      declarationSymbols.set(declaration, siblings)
    }
  }
  return { declarations, declarationSymbols }
}

/** Bindings sharing a declarator are one initialization unit. */
export function moduleDeclarationGraph(module: Module): ModuleDeclarationGraph {
  const index = declarationIndex(module, module.rootScope.bindings)
  const dependencies = new Map<Symbol, Set<Symbol>>()
  for (const [declaration, owners] of index.declarationSymbols) {
    const references = collectModuleReferences(module, declaration)
    for (const symbol of owners) {
      const combined = dependencies.get(symbol) ?? new Set<Symbol>()
      for (const reference of references) {
        if (reference !== symbol) {
          combined.add(reference)
        }
      }
      dependencies.set(symbol, combined)
    }
  }
  return { ...index, dependencies }
}

export function expandTransitively<T>(
  roots: Set<T>,
  dependencies: Map<T, Set<T>>,
): Set<T> {
  const expanded = new Set(roots)
  for (const item of expanded) {
    for (const dependency of dependencies.get(item) ?? []) {
      expanded.add(dependency)
    }
  }
  return expanded
}

/** Erase imports/exports that exist only in TypeScript's type space. */
export function stripTypeExports(program: Program): void {
  program.body = program.body.filter((statement) => {
    if (is.ImportDeclaration(statement)) {
      if (statement.importKind === 'type') {
        return false
      }
      const hadSpecifiers = statement.specifiers.length > 0
      statement.specifiers = statement.specifiers.filter(
        (specifier) =>
          !is.ImportSpecifier(specifier) || specifier.importKind !== 'type',
      )
      return !hadSpecifiers || statement.specifiers.length > 0
    }
    if (is.ExportAllDeclaration(statement)) {
      return statement.exportKind !== 'type'
    }
    if (is.ExportNamedDeclaration(statement)) {
      if (
        statement.exportKind === 'type' ||
        is.TSInterfaceDeclaration(statement.declaration) ||
        is.TSTypeAliasDeclaration(statement.declaration)
      ) {
        return false
      }
      const hadSpecifiers = statement.specifiers.length > 0
      statement.specifiers = statement.specifiers.filter(
        (specifier) => specifier.exportKind !== 'type',
      )
      return (
        !!statement.declaration ||
        !hadSpecifiers ||
        statement.specifiers.length > 0
      )
    }
    return true
  })
}

export interface RemoveUnusedBindingsOptions {
  roots?: Iterable<Symbol | string>
  /** Preserve user declarations that were unused before the transform. */
  preserveInitiallyUnused?: boolean
}

/**
 * Rebuild liveness from surviving nodes, using original symbol identity. This
 * removes dependencies of erased route options without reparsing generated code.
 * Callers decide output ownership before invoking this lexical binding cleanup.
 */
export function removeUnusedBindings(
  module: Module,
  program: Program,
  originalNodes: WeakMap<Node, Node>,
  {
    roots = [],
    preserveInitiallyUnused = true,
  }: RemoveUnusedBindingsOptions = {},
): void {
  stripTypeExports(program)
  const graph = declarationIndex(module, module.symbols)
  const byName = new Map(
    module.rootScope.bindings.map((symbol) => [symbol.name, symbol]),
  )
  const originalOwners = new Map<Node, Set<Symbol>>(graph.declarationSymbols)
  // Export records are uses even when there are no lexical references. A
  // transform that removes an export may also remove its declaration graph.
  const { exports: originalExports } = module
  const originallyExported = new Set(
    originalExports
      .filter((record) => !record.typeOnly && record.local)
      .map((record) => record.local),
  )
  const live = new Set<Symbol>()
  const dependencies = new Map<Symbol, Set<Symbol>>()
  const present = new Set<Symbol>()
  const ownerStack: Array<Set<Symbol> | null> = []
  const scopeStack: Array<Scope> = []
  const addDependency = (from: Symbol, to: Symbol) => {
    const edges = dependencies.get(from) ?? new Set<Symbol>()
    edges.add(to)
    dependencies.set(from, edges)
  }
  for (const root of roots) {
    const symbol = typeof root === 'string' ? byName.get(root) : root
    if (symbol) {
      live.add(symbol)
    }
  }
  walk(program, {
    enter(node) {
      const original = originalNodes.get(node)
      const own = original ? originalOwners.get(original) : undefined
      const parentOwner = ownerStack.at(-1) ?? null
      const owner = own ?? parentOwner
      ownerStack.push(owner)
      const scope = original
        ? module.scopeOf(original)
        : (scopeStack.at(-1) ?? module.rootScope)
      scopeStack.push(scope)
      if (own) {
        for (const symbol of own) {
          present.add(symbol)
          if (
            preserveInitiallyUnused &&
            symbol.references.length === 0 &&
            !originallyExported.has(symbol)
          ) {
            if (parentOwner) {
              for (const parent of parentOwner) {
                addDependency(parent, symbol)
              }
            } else {
              live.add(symbol)
            }
          }
          for (const parent of parentOwner ?? []) {
            addDependency(symbol, parent)
          }
        }
      }
      const markExport = (identifier: Node) => {
        const originalIdentifier = originalNodes.get(identifier)
        const symbol = originalIdentifier
          ? module.symbolOf(originalIdentifier)
          : byName.get(nameOf(identifier) ?? '')
        if (!symbol) {
          return
        }
        if (owner) {
          for (const parent of owner) {
            addDependency(parent, symbol)
          }
        } else {
          live.add(symbol)
        }
      }
      if (is.ExportNamedDeclaration(node) && node.declaration) {
        const declaration = node.declaration
        if (is.VariableDeclaration(declaration)) {
          for (const item of declaration.declarations) {
            for (const identifier of bindingIdentifiers(item.id)) {
              markExport(identifier)
            }
          }
        } else if ('id' in declaration && declaration.id) {
          markExport(declaration.id)
        }
      }
      if (
        is.ExportDefaultDeclaration(node) &&
        (is.FunctionDeclaration(node.declaration) ||
          is.ClassDeclaration(node.declaration)) &&
        node.declaration.id
      ) {
        markExport(node.declaration.id)
      }
      if (is.ExportSpecifier(node)) {
        markExport(node.local)
      }
      const reference = original ? module.referenceOf(original) : null
      let symbol =
        reference && !reference.inTypePosition ? reference.symbol : null
      const generated = generatedReferenceOf(node)
      if (!original && generated) {
        symbol =
          typeof generated === 'string'
            ? module.resolve(generated, scope)
            : generated
      }
      if (!symbol || !graph.declarations.has(symbol)) {
        return
      }
      if (!owner) {
        live.add(symbol)
      } else {
        for (const source of owner) {
          const edges = dependencies.get(source) ?? new Set<Symbol>()
          edges.add(symbol)
          dependencies.set(source, edges)
        }
      }
    },
    leave() {
      ownerStack.pop()
      scopeStack.pop()
    },
  })
  // Destructuring must initialize once in its entirety if any sibling is live.
  for (const siblings of graph.declarationSymbols.values()) {
    const representative = siblings.values().next().value
    if (!representative) {
      continue
    }
    for (const symbol of siblings) {
      if (symbol !== representative) {
        addDependency(representative, symbol)
        addDependency(symbol, representative)
      }
    }
  }
  const retained = expandTransitively(live, dependencies)
  const removable = new Set(
    [...present].filter((symbol) => !retained.has(symbol)),
  )
  walk(program, {
    enter(node, context) {
      const original = originalNodes.get(node)
      const owners = original ? originalOwners.get(original) : undefined
      if (owners && [...owners].every((symbol) => removable.has(symbol))) {
        context.remove()
      }
    },
    leave(node, context) {
      if (is.VariableDeclaration(node) && node.declarations.length === 0) {
        context.remove()
      } else if (is.ImportDeclaration(node) && node.specifiers.length === 0) {
        const original = originalNodes.get(node)
        if (
          original &&
          is.ImportDeclaration(original) &&
          original.specifiers.length > 0
        ) {
          context.remove()
        }
      } else if (
        is.ExportNamedDeclaration(node) &&
        !node.declaration &&
        node.specifiers.length === 0 &&
        !node.source
      ) {
        context.remove()
      }
    },
  })

  const referencedNames = new Set<string>()
  walk(program, {
    enter(node) {
      const original = originalNodes.get(node)
      if (original) {
        const reference = module.referenceOf(original)
        if (reference && !reference.inTypePosition) {
          referencedNames.add(reference.name)
        }
      } else {
        const generated = generatedReferenceOf(node)
        if (generated) {
          referencedNames.add(
            typeof generated === 'string' ? generated : generated.name,
          )
        }
      }
    },
  })
  program.body = program.body.filter((statement) => {
    if (
      !is.ImportDeclaration(statement) ||
      originalNodes.has(statement) ||
      statement.specifiers.length === 0
    ) {
      return true
    }
    statement.specifiers = statement.specifiers.filter((specifier) =>
      referencedNames.has(specifier.local.name),
    )
    return statement.specifiers.length > 0
  })
}

export type ModuleInfoBinding =
  | { type: 'import'; source: string; importedName: string }
  | { type: 'var'; init: Expression | null }

export interface ExtractedModuleInfo {
  bindings: Map<string, ModuleInfoBinding>
  exports: Map<string, string>
  reExportAllSources: Array<string>
}

/** The bundler owns cross-module resolution; Yuku provides local module records. */
export function extractModuleInfo(sourceModule: Module): ExtractedModuleInfo {
  const bindings = new Map<string, ModuleInfoBinding>()
  const exportBindings = new Map<string, string>()
  const reExportAllSources: Array<string> = []
  const graph = declarationIndex(sourceModule, sourceModule.rootScope.bindings)
  for (const [symbol, declaration] of graph.declarations) {
    bindings.set(symbol.name, {
      type: 'var',
      init: is.VariableDeclarator(declaration) ? declaration.init : null,
    })
  }
  for (const record of sourceModule.imports) {
    if (record.local && record.specifier && !record.typeOnly) {
      bindings.set(record.local.name, {
        type: 'import',
        source: record.specifier,
        importedName: record.isNamespace ? '*' : (record.name ?? 'default'),
      })
    }
  }
  let syntheticIndex = 0
  const syntheticName = () => {
    let name: string
    do {
      name = `__module_export_${syntheticIndex++}__`
    } while (bindings.has(name))
    return name
  }
  for (const record of sourceModule.exports) {
    if (record.typeOnly) {
      continue
    }
    if (record.kind === 'star' && record.specifier) {
      reExportAllSources.push(record.specifier)
    } else if (record.name) {
      if (record.local) {
        exportBindings.set(record.name, record.local.name)
      } else if (record.specifier) {
        const name = syntheticName()
        bindings.set(name, {
          type: 'import',
          source: record.specifier,
          importedName:
            record.kind === 'namespace'
              ? '*'
              : (record.fromName ?? record.name),
        })
        exportBindings.set(record.name, name)
      } else if (record.name === 'default') {
        const statement = sourceModule.ast.body.find(
          is.ExportDefaultDeclaration,
        )
        if (statement) {
          const declaration = statement.declaration
          const name = syntheticName()
          bindings.set(name, {
            type: 'var',
            init: is.Expression(declaration) ? declaration : null,
          })
          exportBindings.set('default', name)
        }
      }
    }
  }
  return { bindings, exports: exportBindings, reExportAllSources }
}

export { unwrap as unwrapExpression } from 'yuku-ast'
