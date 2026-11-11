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

export type RouteCall =
  /** The file has no value export named `Route`. */
  | { kind: 'none' }
  /**
   * The file's `Route` is not a call of the router package's route
   * constructor (an app's own helper, a re-export, a stored or wrapped
   * call...). `usesConstructor`: the file imports a route constructor (or
   * the package's namespace) from the router package as a value. `call`:
   * the call initialising `Route`, when it is one.
   */
  | {
      kind: 'foreign'
      usesConstructor: boolean
      call: CallExpression | null
    }
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
          }
        : null
    }
    const imported = binding.import
    return imported &&
      imported.kind === 'named' &&
      !imported.typeOnly &&
      imported.specifier === routerPackage &&
      imported.name !== null &&
      routeConstructors.has(imported.name)
      ? {
          name: imported.name as RouteConstructorName,
          specifier: imported.node,
          property: null,
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
      !imported.typeOnly &&
      imported.specifier === routerPackage
      ? {
          name: property.name as RouteConstructorName,
          specifier: null,
          property,
        }
      : null
  }
  return null
}

function isStringLiteral(node: Node | undefined): boolean {
  return node?.type === 'Literal' && typeof node.value === 'string'
}

/** Whether the file imports a route constructor, or the namespace, of the router package as a value. */
function usesConstructor(file: SourceFile, routerPackage: string) {
  return file.imports.some(
    (i) =>
      !i.typeOnly &&
      i.specifier === routerPackage &&
      (i.kind === 'namespace' ||
        (i.kind === 'named' &&
          i.name !== null &&
          routeConstructors.has(i.name))),
  )
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
  const foreign = (call: CallExpression | null): RouteCall => ({
    kind: 'foreign',
    usesConstructor: usesConstructor(file, expected.routerPackage),
    call,
  })
  const declaredName =
    routeExport.kind === 'named' ? routeExport.local?.declarations[0] : null
  const declarator = declaredName ? file.parentOf(declaredName) : null
  if (
    !declarator ||
    declarator.type !== 'VariableDeclarator' ||
    declarator.id !== declaredName
  ) {
    // re-exported, imported, destructured, a function...
    return foreign(null)
  }
  const init = declarator.init ? unwrap(declarator.init) : null
  if (init?.type !== 'CallExpression') {
    return foreign(null)
  }

  // `createFileRoute('/id')(options)`, `createRootRoute(options)`, or the
  // malformed `createFileRoute(options)`
  const outer = init
  const innerCallee = unwrap(outer.callee)
  let found: ReturnType<typeof constructorOf> = null
  let idCall: CallExpression | null = null
  let callee: Node = innerCallee
  if (innerCallee.type === 'CallExpression') {
    callee = unwrap(innerCallee.callee)
    found = constructorOf(file, callee, expected.routerPackage)
    idCall = innerCallee
  } else if (!isStringLiteral(outer.arguments[0])) {
    // (`createFileRoute('/id')` alone: no options call)
    found = constructorOf(file, callee, expected.routerPackage)
  }
  if (!found) {
    return foreign(outer)
  }
  const curried = idCall !== null
  const name = found.name
  let repair: 'none' | 'import' | 'curry' | 'constructor'
  if (expected.kind === 'root') {
    if (name === 'createRootRoute' || name === 'createRootRouteWithContext') {
      // (`createRootRoute()(…)` and `createRootRouteWithContext(…)` make no route)
      if (curried !== curriedConstructors.has(name)) {
        return foreign(outer)
      }
      repair = 'none'
    } else {
      repair = 'constructor'
    }
  } else if (
    name === 'createRootRoute' ||
    name === 'createRootRouteWithContext'
  ) {
    if (curried !== curriedConstructors.has(name)) {
      return foreign(outer)
    }
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
