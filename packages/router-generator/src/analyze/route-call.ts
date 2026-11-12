/**
 * The one answer to "is this file a route, and which call makes it" (design
 * 5): the route generator lists a route file as made by the router package's
 * constructor from it (`routerConstructor`), and the router plugin's planner
 * splits a listed file only when it is `ours` with nothing to repair.
 */
import { unwrap } from 'yuku/utils'
import type { CallExpression, Node, SourceFile, VariableDeclarator } from 'yuku'

/** A route file's kind, from its place in the route tree (the generator's scan). */
export type RouteFileKind = 'root' | 'file' | 'lazy'

export type RouteConstructorName =
  | 'createFileRoute'
  | 'createLazyFileRoute'
  | 'createRootRoute'
  | 'createRootRouteWithContext'

const routeConstructors: ReadonlySet<string> = new Set<RouteConstructorName>([
  'createFileRoute',
  'createLazyFileRoute',
  'createRootRoute',
  'createRootRouteWithContext',
])

/** The constructors whose first call takes the route id, and whose result takes the options. */
const curriedConstructors: ReadonlySet<string> = new Set<RouteConstructorName>([
  'createFileRoute',
  'createLazyFileRoute',
  'createRootRouteWithContext',
])

/** The constructors the generator imports when the file calls one it does not import. */
const fileConstructors: ReadonlySet<string> = new Set<RouteConstructorName>([
  'createFileRoute',
  'createLazyFileRoute',
])

/**
 * Why a file's `Route` is not a call of the router package's route
 * constructor (`routeCallOf`'s `foreign`), decided by the bindings the
 * `Route` initialiser uses.
 */
export type ForeignRoute =
  /**
   * Nothing the router package exports makes it: an app's own helper, a
   * re-export, an import, a stored route (R130: nothing to report).
   */
  | { kind: 'other' }
  /** `createFileRoute('/id')` without the call taking the options. */
  | {
      kind: 'no-options'
      constructor: RouteConstructorName
      /** The constructor as called. */
      callee: Node
      /** The call taking the route id. */
      idCall: CallExpression
    }
  /** The constructor is imported as a type only (`import type`). */
  | {
      kind: 'type-only'
      constructor: RouteConstructorName
      callee: Node
      /** The call taking the route id, when there is one. */
      idCall: CallExpression | null
    }
  /** `createRootRoute()(…)` or `createRootRouteWithContext(…)`. */
  | {
      kind: 'root-call'
      constructor: 'createRootRoute' | 'createRootRouteWithContext'
    }
  /**
   * The initialiser uses a route constructor of the router package (itself
   * or through the file's own functions and consts), but is not its call:
   * wrapped, made in a function of the file, stored in another const, or
   * `Route` declared more than once.
   */
  | { kind: 'wrapped' }

export type RouteCall =
  /** The file has no value export named `Route`. */
  | { kind: 'none' }
  /** The file's `Route` is not a call of the router package's route constructor. */
  | { kind: 'foreign'; reason: ForeignRoute }
  | {
      kind: 'ours'
      /** `Route = …` (or the declarator exported as `Route`). */
      declarator: VariableDeclarator
      /** The call taking the route options. */
      call: CallExpression
      /** `createFileRoute('/x')`, the call taking the route id. */
      idCall: CallExpression | null
      /** The constructor as called: an identifier or a namespace member, wrappers dropped. */
      callee: Node
      constructor: RouteConstructorName
      /** The import specifier the callee is bound to; null through a namespace or unbound. */
      specifier: Node | null
      /** The member's property of a namespace callee (`R.createFileRoute`). */
      property: Node | null
      /** The first argument of `call`, as written. */
      options: Node | undefined
      /**
       * What the generator rewrites before the route is the file's own:
       * the missing import (`import`), the options passed to the constructor
       * directly (`curry`), the constructor of another kind of route file
       * (`constructor`, R144), or nothing.
       */
      repair: 'none' | 'import' | 'curry' | 'constructor'
    }

/** The constructor a callee is (an identifier or a namespace member), by its binding. */
function constructorOf(
  file: SourceFile,
  callee: Node,
  routerPackage: string,
): {
  name: RouteConstructorName
  specifier: Node | null
  property: Node | null
  /** Bound to `import type` (or `import { type … }`). */
  typeOnly: boolean
} | null {
  if (callee.type === 'Identifier') {
    const binding = file.referenceOf(callee)?.binding ?? null
    if (!binding) {
      // an unbound `createFileRoute`: the import is missing
      return fileConstructors.has(callee.name)
        ? {
            name: callee.name as RouteConstructorName,
            specifier: null,
            property: null,
            typeOnly: false,
          }
        : null
    }
    const imported = binding.import
    return imported &&
      imported.kind === 'named' &&
      imported.specifier === routerPackage &&
      imported.name !== null &&
      routeConstructors.has(imported.name)
      ? {
          name: imported.name as RouteConstructorName,
          specifier: imported.node,
          property: null,
          typeOnly: imported.typeOnly,
        }
      : null
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const object = unwrap(callee.object)
    const property = callee.property
    if (
      object.type !== 'Identifier' ||
      property.type !== 'Identifier' ||
      !routeConstructors.has(property.name)
    ) {
      return null
    }
    const imported = file.referenceOf(object)?.binding?.import
    return imported &&
      imported.kind === 'namespace' &&
      imported.specifier === routerPackage
      ? {
          name: property.name as RouteConstructorName,
          specifier: null,
          property,
          typeOnly: imported.typeOnly,
        }
      : null
  }
  return null
}

function isStringLiteral(node: Node | undefined): boolean {
  return node?.type === 'Literal' && typeof node.value === 'string'
}

const wrappers: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
])

/**
 * Where the file uses a route constructor of the router package: each
 * reference to an import of one (`createFileRoute`, any alias), or to the
 * package's namespace naming one (`R.createFileRoute`, through casts).
 */
function constructorUses(file: SourceFile, routerPackage: string): Array<Node> {
  const uses: Array<Node> = []
  for (const imported of file.imports) {
    if (
      imported.specifier !== routerPackage ||
      !imported.local ||
      !(
        imported.kind === 'namespace' ||
        (imported.kind === 'named' &&
          imported.name !== null &&
          routeConstructors.has(imported.name))
      )
    ) {
      continue
    }
    for (const reference of imported.local.references) {
      if (reference.inTypePosition) {
        continue
      }
      if (imported.kind === 'named') {
        uses.push(reference.node)
        continue
      }
      let node: Node = reference.node
      let parent = file.parentOf(node)
      while (parent && wrappers.has(parent.type)) {
        node = parent
        parent = file.parentOf(node)
      }
      if (
        parent?.type === 'MemberExpression' &&
        !parent.computed &&
        parent.object.start === node.start &&
        parent.property.type === 'Identifier' &&
        routeConstructors.has(parent.property.name)
      ) {
        uses.push(reference.node)
      }
    }
  }
  return uses
}

/**
 * Whether the code of `nodes` uses a route constructor of the router
 * package, directly or through the file's own module-level bindings it
 * reads (a route factory of the file, `function make() { return
 * createFileRoute(…)(…) }`, a stored call, J2.10); an imported helper is
 * not followed (R130).
 */
function usesConstructorIn(
  file: SourceFile,
  nodes: ReadonlyArray<Node>,
  routerPackage: string,
): boolean {
  const uses = constructorUses(file, routerPackage)
  if (uses.length === 0) {
    return false
  }
  const rootScope = file.rootScope.id
  const statementOf = (node: Node) =>
    file.program.body.find((s) => s.start <= node.start && node.end <= s.end)
  const seen = new Set<Node>(nodes)
  const queue = [...nodes]
  for (let n = queue.pop(); n; n = queue.pop()) {
    const range = n
    if (uses.some((u) => u.start >= range.start && u.end <= range.end)) {
      return true
    }
    for (const reference of file.references) {
      const binding = reference.binding
      if (
        !binding ||
        binding.import ||
        binding.scope.id !== rootScope ||
        reference.inTypePosition
      ) {
        continue
      }
      const at = reference.node
      if (at.start < range.start || at.end > range.end) {
        continue
      }
      for (const declaration of binding.declarations) {
        const statement = statementOf(declaration)
        if (statement && !seen.has(statement)) {
          seen.add(statement)
          queue.push(statement)
        }
      }
    }
  }
  return false
}

/**
 * How a route file of `expected.kind` makes its `Route`: the call of the
 * router package's route constructor bound to its `Route` export, found by
 * the callee's binding through any TypeScript wrapper or parentheses
 * (SPEC G15), with what the generator still has to repair; or why it is not
 * one.
 */
export function routeCallOf(
  file: SourceFile,
  expected: { routerPackage: string; kind: RouteFileKind },
): RouteCall {
  const routeExport = file.exports.find(
    (e) => e.name === 'Route' && !e.typeOnly,
  )
  if (!routeExport) {
    return { kind: 'none' }
  }
  // the one declarator of the binding (a type, interface or type namespace
  // of the same name declares no value)
  const declarators: Array<VariableDeclarator> = []
  for (const name of routeExport.kind === 'named'
    ? (routeExport.local?.declarations ?? [])
    : []) {
    const parent = file.parentOf(name)
    if (parent?.type === 'VariableDeclarator' && parent.id === name) {
      declarators.push(parent)
    }
  }
  const foreign = (reason: ForeignRoute): RouteCall => ({
    kind: 'foreign',
    reason,
  })
  /** Not the constructor's call: wrapped, made or stored in the file when the initialiser uses a constructor, else not the router's. */
  const notTheCall = () =>
    foreign({
      kind: usesConstructorIn(file, declarators, expected.routerPackage)
        ? 'wrapped'
        : 'other',
    })
  const declarator = declarators.length === 1 ? declarators[0]! : null
  if (!declarator) {
    // re-exported, imported, destructured, a function, declared twice...
    return notTheCall()
  }
  const init = declarator.init ? unwrap(declarator.init) : null
  if (init?.type !== 'CallExpression') {
    return notTheCall()
  }

  // `createFileRoute('/id')(options)`, `createRootRoute(options)`, or the
  // malformed `createFileRoute(options)` and `createFileRoute('/id')`
  const outer = init
  const innerCallee = unwrap(outer.callee)
  const curried = innerCallee.type === 'CallExpression'
  const idCall = curried ? innerCallee : null
  const callee = curried ? unwrap(innerCallee.callee) : innerCallee
  const found = constructorOf(file, callee, expected.routerPackage)
  if (!found) {
    return notTheCall()
  }
  const name = found.name
  // (a string as the only call's argument is an id: no options call)
  const idOnly = !curried && isStringLiteral(outer.arguments[0])
  if (found.typeOnly) {
    return foreign({
      kind: 'type-only',
      constructor: name,
      callee,
      idCall: idCall ?? (idOnly ? outer : null),
    })
  }
  if (name === 'createRootRoute' || name === 'createRootRouteWithContext') {
    if (curried !== curriedConstructors.has(name) || idOnly) {
      return foreign({ kind: 'root-call', constructor: name })
    }
  } else if (idOnly) {
    return foreign({
      kind: 'no-options',
      constructor: name,
      callee,
      idCall: outer,
    })
  }
  let repair: 'none' | 'import' | 'curry' | 'constructor'
  if (expected.kind === 'root') {
    repair =
      name === 'createRootRoute' || name === 'createRootRouteWithContext'
        ? 'none'
        : 'constructor'
  } else if (
    name === 'createRootRoute' ||
    name === 'createRootRouteWithContext'
  ) {
    repair = 'constructor'
  } else if (!curried) {
    repair = 'curry'
  } else if (
    name !==
    (expected.kind === 'lazy' ? 'createLazyFileRoute' : 'createFileRoute')
  ) {
    repair = 'constructor'
  } else {
    repair = 'none'
  }
  if (
    repair === 'none' &&
    found.specifier === null &&
    found.property === null
  ) {
    repair = 'import'
  }
  return {
    kind: 'ours',
    declarator,
    call: outer,
    idCall,
    callee,
    constructor: name,
    specifier: found.specifier,
    property: found.property,
    options: outer.arguments[0],
    repair,
  }
}

/** The name of an object property's key (`a`, `'a'`, `1`, `['a']`), or null when computed otherwise. */
export function propertyKeyName(prop: Node): string | null {
  if (prop.type !== 'Property') {
    return null
  }
  const key = prop.key
  if (prop.computed) {
    if (key.type === 'Literal' && typeof key.value === 'string') {
      return key.value
    }
    return null
  }
  if (key.type === 'Identifier') {
    return key.name
  }
  if (key.type === 'Literal') {
    return typeof key.value === 'string' || typeof key.value === 'number'
      ? String(key.value)
      : null
  }
  return null
}
