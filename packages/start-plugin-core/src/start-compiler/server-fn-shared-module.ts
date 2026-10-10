import * as t from '@babel/types'
import {
  collectIdentifiersFromNode,
  collectIdentifiersFromPattern,
  findSharedBindings,
  removeBindingsTransitivelyDependingOn,
} from '@tanstack/router-utils'
import path from 'pathe'
import type babel from '@babel/core'

/**
 * On the server, other code imports a module's SSR caller while the
 * server-fn router runs its handlers from the provider module
 * (`?tss-serverfn-split`). Both are compiled from the same source, so every
 * module-level binding they both use would exist twice: two classes, two
 * caches, two counters. Like the route splitter's `?tsr-shared=1` module,
 * those bindings move into one `?tss-serverfn-shared` module that the
 * provider and the module's other variants import.
 */
export const TSS_SERVERFN_SHARED_PARAM = 'tss-serverfn-shared'

export interface ServerFnDeclaration {
  /** The variable the server function is assigned to. */
  name: string
  /** The `.handler()` call; only the provider keeps its argument. */
  handlerCall: t.CallExpression
}

/** The import specifier of a module's shared module, relative to the module. */
export function getServerFnSharedModuleSpecifier(id: string) {
  const queryIndex = id.indexOf('?')
  const filename = queryIndex === -1 ? id : id.slice(0, queryIndex)
  return `./${path.basename(filename)}?${TSS_SERVERFN_SHARED_PARAM}`
}

/**
 * The first name the module-level `statement` declares, with `declarator`
 * the variable declarator of it on the way down, or undefined when it
 * declares none. Destructured names move together, so the first one stands
 * for all of them.
 */
function getDeclaredName(
  statement: t.Node,
  declarator: t.VariableDeclarator | undefined,
) {
  const declaration =
    t.isExportNamedDeclaration(statement) ||
    t.isExportDefaultDeclaration(statement)
      ? statement.declaration
      : statement
  if (t.isVariableDeclaration(declaration)) {
    if (!declarator) return undefined
    return t.isIdentifier(declarator.id)
      ? declarator.id.name
      : collectIdentifiersFromPattern(declarator.id)[0]
  }
  if (
    (t.isFunctionDeclaration(declaration) ||
      t.isClassDeclaration(declaration)) &&
    declaration.id
  ) {
    return declaration.id.name
  }
  return undefined
}

/** The name of the module-level declaration around `nodePath`, if any. */
export function getModuleDeclarationName(nodePath: babel.NodePath) {
  let declarator: t.VariableDeclarator | undefined
  let current = nodePath
  while (current.parentPath && current.parentPath.node.type !== 'Program') {
    if (current.node.type === 'VariableDeclarator') declarator = current.node
    current = current.parentPath
  }
  return getDeclaredName(current.node, declarator)
}

// Group sets for `findSharedBindings`, shared to avoid one per binding.
const REST = new Set([0])
const PROVIDER = new Set([1])
const BOTH = new Set([0, 1])
const NONE: ReadonlySet<string> = new Set()

// Nodes whose identifiers only exist for the type checker.
const TYPE_ONLY_NODE_TYPES = new Set<string>([
  ...t.TSTYPE_TYPES,
  'TSTypeAnnotation',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSDeclareFunction',
])

/**
 * The module-level bindings that server function handlers share with the
 * rest of their module, or undefined when they share none. The provider uses
 * the server function declarations; the rest of the module uses its exports
 * and statements, and each server function's builder chain but not its
 * handler. Shared bindings take along what they depend on, every declaration
 * that writes them and their destructuring siblings, so a server function
 * whose handler writes one moves with it. What has to stay in the module
 * keeps a copy as before: `Route`, bindings statements use or write, and
 * runtime TypeScript declarations.
 *
 * Dependencies come from the references Babel's scope already tracks, walking
 * up from each reference to its module-level declaration.
 */
export function computeServerFnSharedBindings(
  ast: t.File,
  scope: babel.NodePath<t.Program>['scope'],
  serverFns: Array<ServerFnDeclaration>,
): Set<string> | undefined {
  // Declarations that can move; everything else the program scope binds
  // stays, along with what depends on it.
  const movable = new Set<string>()
  const restRoots: Array<string> = []
  const graph = new Map<string, Set<string>>()
  const addEdge = (
    edges: Map<string, Set<string>>,
    from: string,
    to: string,
  ) => {
    const targets = edges.get(from)
    if (targets) targets.add(to)
    else edges.set(from, new Set([to]))
  }
  // Enums and namespaces are not scope bindings.
  const unbound = new Set<string>()

  for (const statement of ast.program.body) {
    let declaration: t.Node | null | undefined = statement
    let isExported = false
    if (t.isExportNamedDeclaration(statement)) {
      if (!statement.declaration || statement.exportKind === 'type') continue
      declaration = statement.declaration
      isExported = true
    } else if (t.isExportDefaultDeclaration(statement)) {
      declaration = statement.declaration
      isExported = true
    }

    if (t.isVariableDeclaration(declaration)) {
      if (declaration.declare) continue
      for (const declarator of declaration.declarations) {
        const names = collectIdentifiersFromPattern(declarator.id)
        for (const name of names) {
          movable.add(name)
          if (isExported) restRoots.push(name)
          // Declared together, they move together.
          for (const sibling of names) {
            if (sibling !== name) addEdge(graph, name, sibling)
          }
        }
      }
    } else if (
      (t.isFunctionDeclaration(declaration) ||
        (t.isClassDeclaration(declaration) && !declaration.declare)) &&
      declaration.id
    ) {
      movable.add(declaration.id.name)
      if (isExported) restRoots.push(declaration.id.name)
    } else if (
      (t.isTSEnumDeclaration(declaration) ||
        (t.isTSModuleDeclaration(declaration) && !declaration.declare)) &&
      t.isIdentifier(declaration.id)
    ) {
      unbound.add(declaration.id.name)
    }
  }
  if (movable.size <= serverFns.length) return undefined

  const fixed = new Set<string>(unbound)
  fixed.add('Route')
  const handlerArgs = new Set<t.Node>()
  const chainGraph = new Map<string, Set<string>>()
  for (const { name, handlerCall } of serverFns) {
    const handler = handlerCall.arguments[0]
    if (handler) handlerArgs.add(handler)
    chainGraph.set(name, new Set())
  }

  const collectUses = (
    name: string,
    paths: Array<babel.NodePath>,
    isWrite: boolean,
  ) => {
    for (const path of paths) {
      // Babel also records the export of a declaration as a reference to it.
      if (t.isExportDeclaration(path.node)) continue
      let current = path
      let declarator: t.VariableDeclarator | undefined
      let inHandler = false
      let isTypeOnly = false
      while (current.parentPath && current.parentPath.node.type !== 'Program') {
        const node = current.node
        if (TYPE_ONLY_NODE_TYPES.has(node.type)) {
          isTypeOnly = true
          break
        }
        if (handlerArgs.has(node)) inHandler = true
        else if (node.type === 'VariableDeclarator') declarator = node
        current = current.parentPath
      }
      const statement = current.node
      if (isTypeOnly || TYPE_ONLY_NODE_TYPES.has(statement.type)) continue

      const user = getDeclaredName(statement, declarator)

      if (user === undefined) {
        restRoots.push(name)
        const isInert =
          !isWrite &&
          ((t.isExportNamedDeclaration(statement) && !statement.declaration) ||
            (t.isExportDefaultDeclaration(statement) &&
              (t.isIdentifier(statement.declaration) ||
                t.isFunctionDeclaration(statement.declaration))))
        if (!isInert) fixed.add(name)
        continue
      }
      if (user === name) continue
      addEdge(graph, user, name)
      if (!inHandler && chainGraph.has(user)) addEdge(chainGraph, user, name)
      // A binding goes where the declarations that write it go.
      if (isWrite) addEdge(graph, name, user)
    }
  }
  const bindings = scope.bindings
  for (const name in bindings) {
    const binding = bindings[name]!
    if (binding.kind === 'module') continue
    if (!movable.has(name)) fixed.add(name)
    collectUses(name, binding.referencePaths, false)
    collectUses(name, binding.constantViolations, true)
  }

  // So their uses are found by walking the declarations, in the rare module
  // that has them.
  if (unbound.size > 0) {
    const usesUnbound = (node: t.Node) => {
      for (const id of collectIdentifiersFromNode(node)) {
        if (unbound.has(id)) return true
      }
      return false
    }
    for (const statement of ast.program.body) {
      const declaration =
        t.isExportNamedDeclaration(statement) ||
        t.isExportDefaultDeclaration(statement)
          ? statement.declaration
          : statement
      if (t.isVariableDeclaration(declaration)) {
        for (const declarator of declaration.declarations) {
          if (!usesUnbound(declarator)) continue
          for (const name of collectIdentifiersFromPattern(declarator.id)) {
            fixed.add(name)
          }
        }
      } else if (
        (t.isFunctionDeclaration(declaration) ||
          t.isClassDeclaration(declaration)) &&
        declaration.id &&
        usesUnbound(declaration)
      ) {
        fixed.add(declaration.id.name)
      }
    }
  }

  const closure = (
    roots: Iterable<string>,
    edges: (name: string) => Iterable<string>,
  ) => {
    const used = new Set<string>()
    const stack = [...roots]
    while (stack.length > 0) {
      const name = stack.pop()!
      if (used.has(name)) continue
      used.add(name)
      for (const dependency of edges(name)) {
        if (!used.has(dependency)) stack.push(dependency)
      }
    }
    return used
  }
  const dependenciesOf = (name: string) => graph.get(name) ?? NONE

  const providerUses = closure(chainGraph.keys(), dependenciesOf)
  // Most handlers only use imports and other server functions.
  if (providerUses.size === chainGraph.size) return undefined

  const restUses = closure(
    restRoots,
    (name) => chainGraph.get(name) ?? dependenciesOf(name),
  )

  const groupsByBinding = new Map<string, Set<number>>()
  for (const name of restUses) {
    if (!chainGraph.has(name)) {
      groupsByBinding.set(name, providerUses.has(name) ? BOTH : REST)
    }
  }
  for (const name of providerUses) {
    if (!chainGraph.has(name) && !restUses.has(name)) {
      groupsByBinding.set(name, PROVIDER)
    }
  }
  const shared = findSharedBindings(ast, groupsByBinding)
  if (shared.size === 0) return undefined

  // Iterating a Set visits what is added during iteration.
  for (const name of shared) {
    for (const dependency of dependenciesOf(name)) shared.add(dependency)
  }
  removeBindingsTransitivelyDependingOn(shared, graph, fixed)
  return shared.size > 0 ? shared : undefined
}
