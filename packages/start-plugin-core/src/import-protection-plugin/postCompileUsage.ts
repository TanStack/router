import * as t from '@babel/types'
import { parseAst } from '@tanstack/router-utils'

export type UsagePos = { line: number; column0: number }

function collectPatternBindings(
  node: t.Node | null | undefined,
  out: Set<string>,
): void {
  if (!node) return
  if (t.isIdentifier(node)) {
    out.add(node.name)
    return
  }
  if (t.isRestElement(node)) {
    collectPatternBindings(node.argument, out)
    return
  }
  if (t.isAssignmentPattern(node)) {
    collectPatternBindings(node.left, out)
    return
  }
  if (t.isObjectPattern(node)) {
    for (const prop of node.properties) {
      if (t.isRestElement(prop)) {
        collectPatternBindings(prop.argument, out)
      } else if (t.isObjectProperty(prop)) {
        collectPatternBindings(prop.value as t.Node, out)
      }
    }
    return
  }
  if (t.isArrayPattern(node)) {
    for (const el of node.elements) {
      collectPatternBindings(el, out)
    }
    return
  }
}

function isBindingPosition(node: t.Node, parent: t.Node | null): boolean {
  if (!parent) return false
  if (t.isFunctionDeclaration(parent) && parent.id === node) return true
  if (t.isFunctionExpression(parent) && parent.id === node) return true
  if (t.isClassDeclaration(parent) && parent.id === node) return true
  if (t.isClassExpression(parent) && parent.id === node) return true
  if (t.isVariableDeclarator(parent) && parent.id === node) return true
  if (t.isImportSpecifier(parent) && parent.local === node) return true
  if (t.isImportDefaultSpecifier(parent) && parent.local === node) return true
  if (t.isImportNamespaceSpecifier(parent) && parent.local === node) return true
  if (
    t.isObjectProperty(parent) &&
    parent.key === node &&
    !parent.computed &&
    // In `{ foo }`, the identifier is also a value reference and must count as
    // usage. Babel represents this as `shorthand: true`.
    !parent.shorthand
  )
    return true
  if (t.isObjectMethod(parent) && parent.key === node && !parent.computed)
    return true
  if (t.isExportSpecifier(parent) && parent.exported === node) return true
  return false
}

function isPreferredUsage(node: t.Node, parent: t.Node | null): boolean {
  if (!parent) return false
  if (t.isCallExpression(parent) && parent.callee === node) return true
  if (t.isNewExpression(parent) && parent.callee === node) return true
  if (t.isMemberExpression(parent) && parent.object === node) return true
  return false
}

function isScopeNode(node: t.Node): boolean {
  return (
    t.isProgram(node) ||
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isBlockStatement(node) ||
    t.isCatchClause(node)
  )
}

/** `var` hoists to the nearest function or program scope, not block scopes. */
function isFunctionScopeNode(node: t.Node): boolean {
  return (
    t.isProgram(node) ||
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  )
}

function collectScopeBindings(node: t.Node, out: Set<string>): void {
  if (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  ) {
    for (const p of node.params) {
      collectPatternBindings(p, out)
    }
    return
  }

  if (t.isCatchClause(node)) {
    collectPatternBindings(node.param, out)
    return
  }
}

/**
 * Given transformed code, returns the first "meaningful" usage position for an
 * import from `source` that survives compilation.
 *
 * The returned column is 0-based (Babel loc semantics).
 */
export function findPostCompileUsagePos(
  code: string,
  source: string,
): UsagePos | undefined {
  const ast = parseAst({ code })

  // 1) Determine local names bound from this specifier
  const imported = new Set<string>()
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === source) {
      if (node.importKind === 'type') continue
      for (const s of node.specifiers) {
        if (t.isImportSpecifier(s) && s.importKind === 'type') continue
        imported.add(s.local.name)
      }
    }
  }
  if (imported.size === 0) return undefined

  let preferred: UsagePos | undefined
  let anyUsage: UsagePos | undefined

  // Scope stack (module scope at index 0).
  // Each entry tracks bindings and whether it is a function/program scope
  // (needed for `var` hoisting).
  interface ScopeEntry {
    bindings: Set<string>
    isFnScope: boolean
  }
  const scopes: Array<ScopeEntry> = [
    { bindings: new Set(), isFnScope: true },
  ]

  function isShadowed(name: string): boolean {
    // Check inner scopes only
    for (let i = scopes.length - 1; i >= 1; i--) {
      if (scopes[i]!.bindings.has(name)) return true
    }
    return false
  }

  function record(node: t.Node, kind: 'preferred' | 'any') {
    const loc = node.loc?.start
    if (!loc) return
    const pos: UsagePos = { line: loc.line, column0: loc.column }
    if (kind === 'preferred') {
      preferred ||= pos
    } else {
      anyUsage ||= pos
    }
  }

  function pushScope(node: t.Node): void {
    const bindings = new Set<string>()
    collectScopeBindings(node, bindings)
    scopes.push({ bindings, isFnScope: isFunctionScopeNode(node) })
  }

  function popScope(): void {
    scopes.pop()
  }

  /** Find the nearest function/program scope entry in the stack. */
  function nearestFnScope(): ScopeEntry {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]!.isFnScope) return scopes[i]!
    }
    // Should never happen (index 0 is always a function scope).
    return scopes[0]!
  }

  // The walker accepts AST nodes, arrays (from node children like
  // `body`, `params`, etc.), or null/undefined for optional children.
  type Walkable =
    | t.Node
    | ReadonlyArray<t.Node | null | undefined>
    | null
    | undefined

  function walk(node: Walkable, parent: t.Node | null) {
    if (!node) return
    if (preferred && anyUsage) return

    if (Array.isArray(node)) {
      for (const n of node) walk(n, parent)
      return
    }

    // After the array check + early return, node is guaranteed to be t.Node.
    // TypeScript doesn't narrow ReadonlyArray from the union, so we assert.
    const astNode = node as t.Node

    // Skip import declarations entirely
    if (t.isImportDeclaration(astNode)) return

    const enterScope = isScopeNode(astNode)
    if (enterScope) {
      pushScope(astNode)
    }

    // Add lexical bindings for variable declarations and class/function decls.
    // Note: function/class *declaration* identifiers bind in the parent scope,
    // so we register them before walking children.
    if (t.isFunctionDeclaration(astNode) && astNode.id) {
      scopes[scopes.length - 2]?.bindings.add(astNode.id.name)
    }
    if (t.isClassDeclaration(astNode) && astNode.id) {
      scopes[scopes.length - 2]?.bindings.add(astNode.id.name)
    }
    if (t.isVariableDeclarator(astNode)) {
      // `var` hoists to the nearest function/program scope, not block scope.
      const isVar =
        t.isVariableDeclaration(parent) && parent.kind === 'var'
      const target = isVar
        ? nearestFnScope().bindings
        : scopes[scopes.length - 1]!.bindings
      collectPatternBindings(astNode.id, target)
    }

    if (t.isIdentifier(astNode) && imported.has(astNode.name)) {
      if (!isBindingPosition(astNode, parent) && !isShadowed(astNode.name)) {
        if (isPreferredUsage(astNode, parent)) {
          record(astNode, 'preferred')
        } else {
          record(astNode, 'any')
        }
      }
    }

    // Iterate child properties of this AST node. We use a Record cast since
    // Babel node types don't expose an index signature, but we need to walk
    // all child properties generically.
    const record_ = astNode as unknown as Record<string, unknown>
    for (const key of Object.keys(record_)) {
      const value = record_[key]
      if (!value) continue
      if (key === 'loc' || key === 'start' || key === 'end') continue
      if (key === 'parent') continue
      if (typeof value === 'string' || typeof value === 'number') continue
      walk(value as Walkable, astNode)
      if (preferred && anyUsage) break
    }

    if (enterScope) {
      popScope()
    }
  }

  walk(ast.program, null)
  return preferred ?? anyUsage
}
