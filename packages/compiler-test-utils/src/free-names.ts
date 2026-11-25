/**
 * The names a module reads free, from Yuku's semantic model: its references
 * that resolve to no binding of the module. Globals count: the caller takes
 * away the globals of where the module runs (`known-globals.ts`). A name in
 * a type position is no read. A name the module probes with `typeof`
 * anywhere is not free: the module reads it knowing it may not exist (e.g.
 * `typeof process !== 'undefined' && process.env` in client code). The
 * rule is the module's: code of several modules (a chunk) is read with
 * `keepProbed`, and each module decides for itself. A read in code that
 * never runs (after an unconditional `return`, `throw`, `break` or
 * `continue` of its block; in the branch of a constant test, `if (false)`,
 * `!0 || …`) is no read: a minifier drops a function's unused declarations
 * there and may keep their reads (Vue's dev-only `initCustomFormatter` after
 * its `return` in a production build).
 */
import { parse } from 'yuku'
import type { Node, Scope, SourceFile } from 'yuku'

export interface ModuleNames {
  /** The parser's errors, with the early errors that need scopes (a redeclaration, an export of an undeclared name). */
  errors: Array<string>
  /** Names the module reads without a binding. */
  free: Set<string>
  /** Names of which some read resolves to a binding of the module. */
  bound: Set<string>
  /**
   * Names of which some read resolves to a binding of the module's top
   * scope (an import, a top-level declaration): the bindings a bundler
   * places in the chunk's scope.
   */
  topLevel: Set<string>
  /** Names the module probes with `typeof` (not in `free`, without `keepProbed`). */
  probed: Set<string>
}

/**
 * Reads `code` as the language `path` implies (default JavaScript). With
 * `keepProbed`, `free` keeps the names read outside `typeof` that are also
 * probed with it.
 */
export function readNames(
  code: string,
  path = 'module.js',
  options: { keepProbed?: boolean } = {},
): ModuleNames {
  const file = parse(code, {
    path,
    analyze: true,
    semanticErrors: true,
    preserveParens: false,
  })
  const free = new Set<string>()
  const bound = new Set<string>()
  const topLevel = new Set<string>()
  /** Names the module probes with `typeof`: it reads them knowing they may not exist. */
  const probed = new Set<string>()
  for (const reference of file.references) {
    if (reference.inTypePosition) {
      continue
    }
    if (reference.binding) {
      bound.add(reference.name)
      if (reference.binding.scope.id === file.rootScope.id) {
        topLevel.add(reference.name)
      }
      continue
    }
    if (unreachable(reference.node, file)) {
      continue
    }
    const parent = file.parentOf(reference.node)
    if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') {
      probed.add(reference.name)
    } else if (
      !(reference.name === 'arguments' && inArgumentsScope(reference.scope))
    ) {
      free.add(reference.name)
    }
  }
  if (!options.keepProbed) {
    probed.forEach((name) => free.delete(name))
  }
  return {
    errors: file.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => diagnostic.message),
    free,
    bound,
    topLevel,
    probed,
  }
}

/** The statements of a node that holds a list of them. */
function statementsOf(node: Node): ReadonlyArray<Node> | undefined {
  switch (node.type) {
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock':
      return node.body as ReadonlyArray<Node>
    case 'SwitchCase':
      return node.consequent as ReadonlyArray<Node>
    default:
      return undefined
  }
}

/** The truth of a constant test (`false`, `0`, `!0`, `void 0`), if it is one. */
function constantTruth(node: Node): boolean | undefined {
  if (node.type === 'Literal') {
    return Boolean((node as { value: unknown }).value) || 'regex' in node
  }
  if (node.type === 'UnaryExpression') {
    if (node.operator === 'void') {
      return false
    }
    if (node.operator === '!') {
      const truth = constantTruth(node.argument)
      return truth === undefined ? undefined : !truth
    }
  }
  return undefined
}

/** Whether a statement always leaves its block (`return`, `throw`, …). */
function exits(node: Node): boolean {
  switch (node.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return true
    case 'BlockStatement':
      return node.body.some(exits)
    case 'IfStatement': {
      const truth = constantTruth(node.test)
      return truth === true
        ? exits(node.consequent)
        : truth === false
          ? node.alternate !== null && exits(node.alternate)
          : exits(node.consequent) &&
            node.alternate !== null &&
            exits(node.alternate)
    }
    default:
      return false
  }
}

/**
 * Whether `node` is in code that never runs: after a statement that always
 * leaves its block (but in a function declared there that code before it
 * calls: declarations are hoisted), or in the branch a constant test never
 * takes.
 */
function unreachable(node: Node, file: SourceFile) {
  let child = node
  for (
    let parent = file.parentOf(child);
    parent;
    child = parent, parent = file.parentOf(parent)
  ) {
    const statements = statementsOf(parent)
    if (statements) {
      const exit = statements.slice(0, statements.indexOf(child)).find(exits)
      if (
        exit &&
        !(
          child.type === 'FunctionDeclaration' &&
          calledBefore(child, exit, file)
        )
      ) {
        return true
      }
    } else if (
      parent.type === 'IfStatement' ||
      parent.type === 'ConditionalExpression'
    ) {
      const truth = constantTruth(parent.test)
      if (
        (child === parent.consequent && truth === false) ||
        (child === parent.alternate && truth === true)
      ) {
        return true
      }
    } else if (parent.type === 'LogicalExpression' && child === parent.right) {
      const truth = constantTruth(parent.left)
      if (
        (parent.operator === '&&' && truth === false) ||
        (parent.operator === '||' && truth === true)
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * Whether a function declared after `exit` is used elsewhere than after it
 * or in itself: hoisted, it runs when that code calls it.
 */
function calledBefore(fn: Node, exit: Node, file: SourceFile) {
  const id = (fn as { id: Node | null }).id
  const binding = id && file.bindingOf(id)
  return (
    binding?.references.some(
      ({ node }) =>
        node.start < exit.end &&
        !(fn.start <= node.start && node.end <= fn.end),
    ) ?? true
  )
}

/**
 * Whether `arguments` read in `scope` is a function's implicit `arguments`:
 * Yuku's binder resolves it to no binding when the first barrier around it
 * is a non-arrow function (`isArgumentsBarrier`, src/parser/semantic/binder.zig).
 */
function inArgumentsScope(scope: Scope) {
  for (const ancestor of scope.ancestors()) {
    if (ancestor.kind === 'staticBlock') {
      return false
    }
    if (
      ancestor.kind === 'function' &&
      (ancestor.node.type === 'FunctionDeclaration' ||
        ancestor.node.type === 'FunctionExpression')
    ) {
      return true
    }
  }
  return false
}
