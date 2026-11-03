import { AST_NODE_TYPES } from '@typescript-eslint/utils'
import { getRouterCalls } from './router-calls'
import type { TSESLint, TSESTree } from '@typescript-eslint/utils'

/**
 * Route factories whose options object is passed to a second call:
 * `createFileRoute('/path')({ ... })`, `createRootRouteWithContext<C>()({ ... })`.
 */
export const createRouteFunctionsIndirect = [
  'createFileRoute',
  'createRootRouteWithContext',
] as const

/**
 * Route factories whose options object is the first argument:
 * `createRoute({ ... })`, `createRootRoute({ ... })`.
 */
export const createRouteFunctionsDirect = [
  'createRootRoute',
  'createRoute',
] as const

export type CreateRouteFunction =
  | (typeof createRouteFunctionsDirect)[number]
  | (typeof createRouteFunctionsIndirect)[number]

const createRouteFunctionSet = new Set<CreateRouteFunction>([
  ...createRouteFunctionsDirect,
  ...createRouteFunctionsIndirect,
])
const createRouteFunctionsIndirectSet = new Set<string>(
  createRouteFunctionsIndirect,
)

export interface RouteOptionsCall {
  /** The factory, by the name its router package exports it under. */
  factory: CreateRouteFunction
  /** The object literal holding the route options. */
  options: TSESTree.ObjectExpression
}

/**
 * The route options object literal of every route factory call in the file,
 * with the factory resolved through its import (see `getRouterCalls`).
 *
 * A call is skipped when the options are not an inline object literal
 * (TypeScript wrappers such as `satisfies`, `as const`, `<X>` and `!` around
 * the literal are looked through), or, for the indirect factories, when the
 * factory call is not immediately invoked again.
 */
export function getRouteOptionsCalls(
  sourceCode: Readonly<TSESLint.SourceCode>,
  program: TSESTree.Program,
): Array<RouteOptionsCall> {
  const result: Array<RouteOptionsCall> = []
  for (const { name, call } of getRouterCalls(
    sourceCode,
    program,
    createRouteFunctionSet,
  )) {
    let args = call.arguments
    if (createRouteFunctionsIndirectSet.has(name)) {
      if (
        call.parent.type !== AST_NODE_TYPES.CallExpression ||
        call.parent.callee !== call
      ) {
        continue
      }
      args = call.parent.arguments
    }
    const argument = args[0]
    if (argument === undefined) {
      continue
    }
    // `({ ... } satisfies X)`, `({ ... } as const)`, `<X>{ ... }`, `({ ... })!`
    const options = unwrapTSExpression(argument)
    if (options.type === AST_NODE_TYPES.ObjectExpression) {
      result.push({ factory: name, options })
    }
  }
  return result
}

/** Route options that accept the lifecycle object form `{ handler, ... }`. */
const lifecycleProperties = ['context', 'beforeLoad', 'loader'] as const

export type LifecycleProperty = (typeof lifecycleProperties)[number]

const lifecyclePropertySet = new Set<string>(lifecycleProperties)

function isLifecycleProperty(name: string): name is LifecycleProperty {
  return lifecyclePropertySet.has(name)
}

export interface LifecycleObject {
  lifecycle: LifecycleProperty
  object: TSESTree.ObjectExpression
}

/**
 * The lifecycles written in the object form, `loader: { handler, ... }`, in
 * the given route options. A TypeScript wrapper around the lifecycle object
 * is looked through.
 */
export function getLifecycleObjects(
  options: TSESTree.ObjectExpression,
): Array<LifecycleObject> {
  const result: Array<LifecycleObject> = []
  for (const property of options.properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue
    }
    const lifecycle = getStaticPropertyName(property)
    if (lifecycle === null || !isLifecycleProperty(lifecycle)) {
      continue
    }
    const object = unwrapTSExpression(property.value)
    if (object.type === AST_NODE_TYPES.ObjectExpression) {
      result.push({ lifecycle, object })
    }
  }
  return result
}

/**
 * The static key of an object literal member, or `null` when it has none:
 * spreads (a spread is never a key, whatever its argument is called),
 * computed keys and numeric keys.
 */
export function getStaticPropertyName(
  property: TSESTree.ObjectLiteralElement,
): string | null {
  if (property.type === AST_NODE_TYPES.SpreadElement || property.computed) {
    return null
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name
  }
  // a non-computed key that is not an identifier is a string or number literal
  if (typeof property.key.value === 'string') {
    return property.key.value
  }
  return null
}

/**
 * Strips `as` / `satisfies` / `<T>` type assertion / non-null wrappers so the
 * underlying expression (an object literal or a function) can be inspected.
 *
 * Parentheses need no handling: ESTree has no node for them, so
 * typescript-estree already yields the inner expression for `({ ... })`.
 */
export function unwrapTSExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression
  }
  return current
}
