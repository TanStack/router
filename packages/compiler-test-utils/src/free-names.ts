/**
 * The names a module reads free, from Yuku's semantic model: its references
 * that resolve to no binding of the module. Globals count: the caller takes
 * away the globals of where the module runs (`known-globals.ts`). A name in
 * a type position is no read. A name the module probes with `typeof`
 * anywhere is not free: the module reads it knowing it may not exist (e.g.
 * `typeof process !== 'undefined' && process.env` in client code). The
 * rule is the module's: code of several modules (a chunk) is read with
 * `keepProbed`, and each module decides for itself. A read in code that
 * never runs (after a statement that always leaves its block: `return`,
 * `throw`, `break`, `continue`, a `try` that does; in the branch of a
 * constant test, `if (false)`, `!0 || …`) is no read: a minifier drops a
 * function's unused declarations there and may keep their reads (Vue's
 * dev-only `initCustomFormatter` after its `return` in a production
 * build). But a function declared there that code that runs calls runs
 * (`unreachable`), and a `case` test runs before its consequent.
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
    case 'TryStatement':
      // (the block leaves, and so does the handler of what it throws; or
      // the `finally` leaves whatever came before)
      return (
        (exits(node.block) &&
          (node.handler === null || exits(node.handler.body))) ||
        (node.finalizer !== null && exits(node.finalizer))
      )
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
 * leaves its block, or in the branch a constant test never takes. A function
 * declared there runs when code that runs calls it (declarations are
 * hoisted): see `liveDeclarations`.
 *
 * Limits: a hoisted function that code replaces before calling it
 * (`f = other; f()`) still counts as called (a false red in unminified
 * output, which keeps the declaration); a labeled function declaration
 * (`l: function f() {}`, sloppy scripts only) is not seen as one.
 */
function unreachable(node: Node, file: SourceFile) {
  return deadAt(node, file, liveDeclarations(file))
}

/** `unreachable`, with the functions declared in dead code that run (`live`). */
function deadAt(node: Node, file: SourceFile, live: ReadonlySet<Node>) {
  let child = node
  for (
    let parent = file.parentOf(child);
    parent;
    child = parent, parent = file.parentOf(parent)
  ) {
    const statements = statementsOf(parent)
    // (a child outside the statements, a `case` test, runs before them)
    const index = statements ? statements.indexOf(child) : -1
    if (statements && index !== -1) {
      if (
        statements.slice(0, index).some(exits) &&
        !(child.type === 'FunctionDeclaration' && live.has(child))
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

const liveOf = new WeakMap<SourceFile, ReadonlySet<Node>>()

/**
 * The functions declared in code that never runs that run all the same,
 * once per module: a function is live when a reference to it outside
 * itself is in code that runs (with the live ones so far), until no more
 * become live (a cycle of such functions none of them reaches stays dead).
 * A direct `eval` may call any function its code sees: every function
 * declared in a scope around it is live.
 */
function liveDeclarations(file: SourceFile): ReadonlySet<Node> {
  const known = liveOf.get(file)
  if (known) {
    return known
  }
  const live = new Set<Node>()
  liveOf.set(file, live)
  const declared = file.bindings.flatMap((binding) => {
    const fn = binding.declarations
      .map((name) => file.parentOf(name))
      .find((node) => node?.type === 'FunctionDeclaration')
    return fn ? [{ fn, binding }] : []
  })
  const dead = declared.filter(({ fn }) => deadAt(fn, file, live))
  if (dead.length === 0) {
    return live
  }
  for (const reference of file.references) {
    const parent = file.parentOf(reference.node)
    if (
      reference.name === 'eval' &&
      !reference.binding &&
      parent?.type === 'CallExpression' &&
      parent.callee === reference.node
    ) {
      const around = new Set([...reference.scope.ancestors()])
      for (const { fn, binding } of dead) {
        if (around.has(binding.scope)) {
          live.add(fn)
        }
      }
    }
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const { fn, binding } of dead) {
      if (
        !live.has(fn) &&
        binding.references.some(
          ({ node }) =>
            !(fn.start <= node.start && node.end <= fn.end) &&
            !deadAt(node, file, live),
        )
      ) {
        live.add(fn)
        grew = true
      }
    }
  }
  return live
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
