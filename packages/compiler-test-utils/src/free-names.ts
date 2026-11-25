/**
 * The names a module reads free, from Yuku's semantic model: its references
 * that resolve to no binding of the module. Globals count: the caller takes
 * away the globals of where the module runs (`known-globals.ts`). A name in
 * a type position is no read. A name the module probes with `typeof`
 * anywhere is not free: the module reads it knowing it may not exist (e.g.
 * `typeof process !== 'undefined' && process.env` in client code). The
 * rule is the module's: code of several modules (a chunk) is read with
 * `keepProbed`, and each module decides for itself.
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
  /**
   * Names of `free` with a read the code runs when it loads: outside every
   * function, but for the functions run then (`deferred`).
   */
  freeAtTop: Set<string>
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
  const freeAtTop = new Set<string>()
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
    const parent = file.parentOf(reference.node)
    if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') {
      probed.add(reference.name)
    } else if (
      !(reference.name === 'arguments' && inArgumentsScope(reference.scope))
    ) {
      free.add(reference.name)
      if (!deferred(reference.scope, file)) {
        freeAtTop.add(reference.name)
      }
    }
  }
  if (!options.keepProbed) {
    probed.forEach((name) => {
      free.delete(name)
      freeAtTop.delete(name)
    })
  }
  return {
    errors: file.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => diagnostic.message),
    free,
    bound,
    topLevel,
    freeAtTop,
    probed,
  }
}

/**
 * Whether code of `scope` runs only when a function it is in is called
 * later: not when the code loads. Run then: a class's static blocks, a
 * function called where it is written (`(() => {…})()`, `!function () {…}()`,
 * `(function () {…}).call(this)`), and the module factories of a webpack or
 * Rspack chunk (the function values of an object whose keys are all module
 * ids, number or string literals: each runs its module's top level).
 */
function deferred(scope: Scope, file: SourceFile) {
  for (const ancestor of scope.ancestors()) {
    if (ancestor.kind === 'function' && !runsAtLoad(ancestor.node, file)) {
      return true
    }
  }
  return false
}

const functionTypes = new Set(['FunctionExpression', 'ArrowFunctionExpression'])

function runsAtLoad(fn: Node, file: SourceFile) {
  const parent = file.parentOf(fn)
  if (parent?.type === 'CallExpression') {
    return parent.callee === fn
  }
  if (
    parent?.type === 'MemberExpression' &&
    parent.object === fn &&
    parent.property.type === 'Identifier' &&
    (parent.property.name === 'call' || parent.property.name === 'apply')
  ) {
    const call = file.parentOf(parent)
    return call?.type === 'CallExpression' && call.callee === parent
  }
  if (parent?.type === 'Property' && parent.value === fn) {
    const object = file.parentOf(parent)
    return (
      object?.type === 'ObjectExpression' &&
      object.properties.every(
        (property) =>
          property.type === 'Property' &&
          !property.computed &&
          property.key.type === 'Literal' &&
          (typeof property.key.value === 'number' ||
            typeof property.key.value === 'string') &&
          functionTypes.has(property.value.type),
      )
    )
  }
  return false
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
