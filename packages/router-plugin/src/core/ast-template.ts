import { b } from 'yuku-ast'
import {
  generatedReferenceOf,
  linkGeneratedReference,
} from '@tanstack/router-utils'
import type { AnyRoute } from '@tanstack/router-core'
import type {
  Expression,
  Node,
  ProgramStatement,
  Statement,
} from '@yuku-toolchain/types'

/**
 * Code the plugin inserts into route modules, written as TypeScript. The
 * package build and Vitest compile every `astTemplate` call into the
 * `yuku-ast` builder calls that create its tree (`ast-templates-plugin.ts`),
 * so a route transform never parses it:
 *
 * ```ts
 * const routeIdOrFallback = astTemplate(
 *   { routeId: hole.literal<string | undefined>() },
 *   ({ routeId }) => routeId ?? Route.id,
 * )
 * routeIdOrFallback({ routeId: '/posts' }) // `"/posts" ?? Route.id`
 * ```
 *
 * - A block body builds statements, an expression body an expression.
 * - The parameter destructures the holes the first argument declares. In the
 *   template a hole has the type of the runtime value it stands for, and the
 *   builder takes what `hole` documents.
 * - Any other free name belongs to the route module: declare it in the
 *   template module (`declare const Route: AnyRoute`), and write `importMeta`
 *   for `import.meta`.
 * - Types are stripped. Parentheses and comments are kept as written, except
 *   `prettier-ignore` and `eslint-disable` comments.
 */
export function astTemplate<
  THoles extends Record<string, Hole> = {},
  TResult = void,
>(
  _holes: THoles,
  _template: (holes: TemplateValues<THoles>) => TResult,
): TemplateBuilder<THoles, TResult> {
  throw new Error(
    'astTemplate calls are compiled by ast-templates-plugin.ts, which runs for the router-plugin build and tests',
  )
}

export const hole = {
  /** An expression, such as a `b.*` tree or another template's result. */
  expression: <TValue>() =>
    placeholder as Hole<'expression', TValue, Expression>,
  /** The name of a binding or a global of the route module. */
  identifier: <TValue>() => placeholder as Hole<'identifier', TValue, string>,
  /** Strings, numbers, booleans, `null`, `undefined` or arrays of them. */
  literal: <TValue extends LiteralValue>() =>
    placeholder as Hole<'literal', TValue, TValue>,
  /** Statements, inserted where the template calls the hole as a statement. */
  statements: () =>
    placeholder as Hole<'statements', () => void, Array<Statement>>,
  /**
   * The name of a binding the template declares under the hole's name, such
   * as a unique program identifier. `exported` exports its declaration from
   * the route module.
   */
  binding: <TExported extends boolean = false>(_options?: {
    exported: TExported
  }) =>
    placeholder as Hole<
      TExported extends true ? 'exported' : 'binding',
      never,
      string
    >,
}

/** `import.meta` in a template, typed with the bundlers' HMR APIs. */
export declare const importMeta: {
  /** Vite */
  readonly hot?: HotContext
  /** Webpack and Rspack */
  readonly webpackHot?: HotContext
}

// The global `ImportMeta` would type `import.meta.hot` in every module of the
// plugin, hence `importMeta`.
export interface HotContext {
  data?: RouteHotData
  accept: (callback?: (newModule?: { Route?: AnyRoute }) => void) => void
  dispose: (callback: (data: RouteHotData) => void) => void
}

/** What the route HMR code keeps in `hot.data` across updates. */
export interface RouteHotData {
  'tsr-route-id'?: string
  'tsr-route-update-handled'?: AnyRoute
  [splitComponent: `tsr-split-component:${string}`]: unknown
}

type LiteralValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<LiteralValue>

interface Hole<
  TKind extends string = string,
  TValue = unknown,
  TArgument = unknown,
> {
  readonly kind: TKind
  /** Its type in the template */
  readonly value: TValue
  /** What the builder takes */
  readonly argument: TArgument
}

type TemplateValues<THoles extends Record<string, Hole>> = {
  [K in keyof THoles as THoles[K]['kind'] extends 'binding' | 'exported'
    ? never
    : K]: THoles[K]['value']
}

type TemplateArguments<THoles extends Record<string, Hole>> = {
  [K in keyof THoles]: THoles[K]['argument']
}

type TemplateBuilder<THoles extends Record<string, Hole>, TResult> = (
  ...holes: keyof THoles extends never ? [] : [holes: TemplateArguments<THoles>]
) => 0 extends 1 & TResult
  ? Expression
  : [TResult] extends [void]
    ? 'exported' extends THoles[keyof THoles]['kind']
      ? Array<ProgramStatement>
      : Array<Statement>
    : Expression

const placeholder = undefined as never

// The compiled templates call the helpers below.

/** A reference to a global or a binding of the route module. */
export function reference(name: string) {
  return linkGeneratedReference(b.Identifier({ name }), name)
}

/** The literal a `hole.literal` value stands for. */
export function literal(value: LiteralValue): Expression {
  if (value === undefined) {
    return reference('undefined')
  }
  if (Array.isArray(value)) {
    return b.ArrayExpression({ elements: value.map(literal) })
  }
  return b.Literal({
    value: value as string,
    raw: JSON.stringify(value),
  })
}

/** Another use of an expression hole: a copy of its tree. */
export function copy(expression: Expression): Expression {
  return copyValue(expression) as Expression
}

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyValue)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  const node = value as Node
  const result = {} as Node
  for (const key in node) {
    ;(result as unknown as Record<string, unknown>)[key] = copyValue(
      node[key as keyof Node],
    )
  }
  // Like the hole, the copy references what `reference` or a parse linked
  const reference = generatedReferenceOf(node)
  return reference === undefined
    ? result
    : linkGeneratedReference(result, reference)
}
