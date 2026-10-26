/**
 * Split decisions of a route module for one planning round: which options
 * move to which chunk, which stay with a reason (J2.8 warnings), computed
 * once and shared by the `route-split` planner (which applies them) and the
 * `route-hmr` planner (which hoists only what stays).
 */
import { unwrapExpression, walk } from '@tanstack/router-utils/compiler'
import { splitGroupingsSchema } from '../core/config'
import { defaultCodeSplitGroupings } from '../core/constants'
import {
  declaratorOf,
  identifierSymbol,
  isAlreadyLazy,
  isExportedSymbol,
  isFallbackLiteral,
  propertyKeyName,
  propertyRangeWithComma,
  recognizeRoute,
} from './route'
import type { RouteModuleInfo, RouteOption } from './route'
import type { RouterPlannerConfig } from './config'
import type { CodeSplitGroupings } from '../core/constants'
import type {
  Diagnostic,
  PlanContext,
  Range,
  SymbolId,
} from '@tanstack/router-utils/compiler'
import type { Node } from 'yuku'

export type SplitShape = 'init' | 'method' | 'shorthand'

export interface SplitDecision {
  /** The route option (`component`, `loader`, …). */
  key: string
  option: RouteOption
  /** The group this option loads with. */
  group: ReadonlyArray<string>
  /** `component`, `component~loader`: the chunk's owned query value. */
  groupKey: string
  shape: SplitShape
  /** The region claimed by the chunk (replaced by the lazy wrapper in the route module). */
  region: Range
  /** The text the chunk declares its export from (the value, or a method's function). */
  valueRange: Range
  /** The value node (a method's function; an object-form loader's handler). */
  valueNode: Node
  /** The key as written, for whole-property placeholders (`component: …`). */
  keyText: string
  /** Whether the placeholder replaces the whole property (method, shorthand). */
  wholeProperty: boolean
  /** `async function* ` … for methods. */
  methodPrefix: string
  /** The module binding a shorthand denotes. */
  shorthandSym: SymbolId | null
  /** Object-form loader: the chunk exports the handler under `loader`. */
  exportName: string
  /** A loader named by a binding holding `{ handler }`: the chunk exports that member. */
  member: string | null
}

export type NotSplitReason =
  | 'shared-writer'
  | 'multi-writer'
  | 'ordered-effect'
  | 'hydrate-writer'
  | 'env-declared'
  | 'this-reference'
  | 'reassigned'
  | 'loader-object'

export interface NotSplit {
  key: string
  reason: NotSplitReason
  range: Range
  /** The binding named in the warning, when the value is one. */
  name: string | null
}

export interface SplitPlan {
  route: RouteModuleInfo
  groupings: CodeSplitGroupings
  decisions: Array<SplitDecision>
  notSplit: Array<NotSplit>
  warnings: Array<Diagnostic>
  /** Options the splitter deletes in the env output (`deleteNodes`). */
  deleted: Array<RouteOption>
}

export const SPLITTABLE_KEYS: ReadonlyArray<string> = [
  'loader',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

export const COMPONENT_KEYS: ReadonlyArray<string> = [
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

const planMemo = new WeakMap<object, SplitPlan | null>()

/** The split plan of this planning round, or null when the module has no recognised route. */
export function splitPlanOf(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
): SplitPlan | null {
  if (planMemo.has(ctx.rewrites)) {
    return planMemo.get(ctx.rewrites)!
  }
  const r = recognizeRoute(ctx)
  const plan = r.route ? computeSplitPlan(ctx, cfg, r.route) : null
  planMemo.set(ctx.rewrites, plan)
  return plan
}

function groupKeyOf(group: ReadonlyArray<string>): string {
  return [...new Set(group)].sort().join('~')
}

function effectiveGroupings(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
  route: RouteModuleInfo,
): CodeSplitGroupings {
  const file = ctx.identity.path
  if (route.fileGroupings) {
    const res = splitGroupingsSchema.safeParse(route.fileGroupings)
    if (!res.success) {
      const message = res.error.issues.map((e) => e.message).join('. ')
      throw new Error(
        `The groupings for the route "${file}" are invalid.\n${message}`,
      )
    }
    return route.fileGroupings
  }
  if (cfg.splitBehavior && route.routeId !== null) {
    const fromPlugin = cfg.splitBehavior({ routeId: route.routeId })
    if (fromPlugin) {
      const res = splitGroupingsSchema.safeParse(fromPlugin)
      if (!res.success) {
        const message = res.error.issues.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings returned when using \`splitBehavior\` for the route "${file}" are invalid.\n${message}`,
        )
      }
      return fromPlugin
    }
  }
  return cfg.defaultGroupings.length > 0
    ? cfg.defaultGroupings
    : defaultCodeSplitGroupings
}

function methodPrefixOf(fn: Node): string {
  if (fn.type !== 'FunctionExpression') {
    return ''
  }
  return `${fn.async ? 'async ' : ''}function${fn.generator ? '*' : ''} `
}

/** The `handler` property of an object-form loader. */
function handlerPropertyOf(object: Node): Node | null {
  if (object.type !== 'ObjectExpression') {
    return null
  }
  const handler = (object.properties as Array<Node>).find(
    (p) =>
      p.type === 'Property' &&
      !p.computed &&
      p.kind === 'init' &&
      propertyKeyName(p) === 'handler',
  )
  return handler && handler.type === 'Property' ? handler : null
}

/** The `handler` property of an object-form loader as the option to split. */
function handlerOption(
  ctx: PlanContext,
  object: Node,
  handler: Node & { type: 'Property' },
): RouteOption {
  const code = ctx.analysis.source.code
  return {
    key: 'handler',
    kind: handler.method ? 'method' : handler.shorthand ? 'shorthand' : 'init',
    prop: handler,
    value: handler.value,
    propertyRange: propertyRangeWithComma(object, handler, code),
    keyText: code.slice(handler.key.start, handler.key.end),
  }
}

/** The option of a splittable key, or the `handler` of an object-form loader. */
function splitTarget(
  ctx: PlanContext,
  option: RouteOption,
):
  | {
      shape: SplitShape
      region: Range
      valueRange: Range
      value: Node
      keyText: string
      wholeProperty: boolean
      methodPrefix: string
      exportName: string
      container: Node | null
      prop: RouteOption
      member: string | null
    }
  | { refused: NotSplitReason }
  | null {
  if (option.value === null) {
    return null
  }
  let prop = option
  let container: Node | null = null
  let member: string | null = null
  if (
    option.key === 'loader' &&
    (option.kind === 'init' || option.kind === 'shorthand')
  ) {
    // `loader: handlers` / `{ loader }` naming a module const `{ handler }`:
    // the chunk exports its handler (the router calls `loader.handler`;
    // `lazyFn` calls what the chunk exports)
    const sym = identifierSymbol(ctx, option.value)
    const decl = sym !== null ? declaratorOf(ctx, sym) : null
    const init = decl ? unwrapExpression(decl.init) : null
    const handler =
      init && init.type === 'ObjectExpression' ? handlerPropertyOf(init) : null
    if (init?.type === 'ObjectExpression' && handler?.type === 'Property') {
      if (init.properties.length === 1) {
        member = 'handler'
      } else if (ctx.t1.refs.refsOf(sym!).length === 1) {
        // the object holds other options (`staleReloadMode`) the router
        // reads from the route module: the handler is split inside the
        // object, which stays as the route's loader
        container = init
        prop = handlerOption(ctx, init, handler)
      } else {
        return { refused: 'loader-object' }
      }
    }
  }
  if (option.key === 'loader' && option.kind === 'init') {
    const v = unwrapExpression(option.value)
    if (v.type === 'ObjectExpression') {
      const handler = handlerPropertyOf(v)
      if (!handler || handler.type !== 'Property') {
        return null
      }
      container = v
      prop = handlerOption(ctx, v, handler)
    }
  }
  const value = prop.value!
  switch (prop.kind) {
    case 'init': {
      // the chunk declares the bare value (casts and parentheses dropped, so
      // React Refresh registers a function); the placeholder replaces it all
      const inner = unwrapExpression(value)
      return {
        shape: 'init',
        region: { start: value.start, end: value.end },
        valueRange: { start: inner.start, end: inner.end },
        value,
        keyText: prop.keyText,
        wholeProperty: false,
        methodPrefix: '',
        exportName: option.key!,
        container,
        prop,
        member,
      }
    }
    case 'method':
      return {
        shape: 'method',
        region: { start: prop.prop.start, end: prop.prop.end },
        valueRange: { start: value.start, end: value.end },
        value,
        keyText: prop.keyText,
        wholeProperty: true,
        methodPrefix: methodPrefixOf(value),
        exportName: option.key!,
        container,
        prop,
        member: null,
      }
    case 'shorthand':
      return {
        shape: 'shorthand',
        region: { start: prop.prop.start, end: prop.prop.end },
        valueRange: { start: value.start, end: value.end },
        value,
        keyText: prop.keyText,
        wholeProperty: true,
        methodPrefix: '',
        exportName: option.key!,
        container,
        prop,
        member,
      }
    default:
      return null
  }
}

/**
 * Whether a spread or computed route option provably holds none of
 * `deleteNodes`: a spread of a module object literal of static keys that
 * nothing else references, or a computed key naming a module string const.
 */
function hidesNoDeletedOption(
  ctx: PlanContext,
  option: RouteOption,
  deleteNodes: ReadonlySet<string>,
): boolean {
  const ref =
    option.kind === 'spread'
      ? option.value
      : (option.prop as { key?: Node }).key
  const sym = ref ? identifierSymbol(ctx, ref) : null
  const decl = sym !== null ? declaratorOf(ctx, sym) : null
  if (!decl) {
    return false
  }
  const init = unwrapExpression(decl.init)
  if (option.kind !== 'spread') {
    return (
      init.type === 'Literal' &&
      typeof init.value === 'string' &&
      !deleteNodes.has(init.value)
    )
  }
  if (
    init.type !== 'ObjectExpression' ||
    ctx.t1.refs.refsOf(sym!).length !== 1 ||
    isExportedSymbol(ctx, sym!)
  ) {
    return false
  }
  return (init.properties as Array<Node>).every((p) => {
    const key = p.type === 'Property' && !p.computed ? propertyKeyName(p) : null
    return key !== null && !deleteNodes.has(key)
  })
}

function computeSplitPlan(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
  route: RouteModuleInfo,
): SplitPlan {
  const warnings: Array<Diagnostic> = [...route.warnings]
  const file = ctx.identity.path
  const decisions: Array<SplitDecision> = []
  const notSplit: Array<NotSplit> = []
  const deleted: Array<RouteOption> = []
  const deleteNodes = new Set(cfg.deleteNodes)
  // root routes are never split: their components render on every page or on
  // error and not-found responses, where a lazy chunk only adds a round trip
  // (and the manifest preloads it on every page anyway)
  const splitting = cfg.split && ctx.env.routerSplit && route.kind === 'file'
  const groupings = splitting ? effectiveGroupings(ctx, cfg, route) : []

  if (route.options.kind === 'opaque') {
    if (splitting || deleteNodes.size > 0) {
      const how =
        route.options.reason === 'imported'
          ? 'imported from another module'
          : route.options.reason === 'call'
            ? 'returned by a call'
            : 'not an object literal'
      const consequences: Array<string> = []
      if (splitting) {
        consequences.push('the route is not code-split')
      }
      if (deleteNodes.size > 0) {
        consequences.push(
          `the options ${[...deleteNodes].map((k) => `\`${k}\``).join(', ')} cannot be removed from this build`,
        )
      }
      // with deleteNodes the build is refused: it would ship the options
      // silently otherwise (J2.8, J2.14)
      warnings.push({
        severity: deleteNodes.size > 0 ? 'error' : 'warning',
        code: 'options-opaque',
        by: 'route-split',
        message: `[tanstack-router] The route options of "${file}" are ${how}, so ${consequences.join(' and ')}.${deleteNodes.size > 0 ? ' Write the route options as an object literal in the route file.' : ''}`,
        range: {
          start: route.optionsCall.start,
          end: route.optionsCall.end,
        },
      })
    }
    return {
      route,
      groupings,
      decisions,
      notSplit,
      warnings,
      deleted,
    }
  }

  for (const option of route.props) {
    if (
      option.kind === 'spread' ||
      (option.kind === 'computed' && option.key === null)
    ) {
      if (
        deleteNodes.size > 0 &&
        !hidesNoDeletedOption(ctx, option, deleteNodes)
      ) {
        warnings.push({
          severity: 'error',
          code: 'delete-nodes-dynamic',
          by: 'route-split',
          message: `[tanstack-router] "${file}" spreads or computes route options, so the options ${[...deleteNodes].map((k) => `\`${k}\``).join(', ')} cannot be removed from this build. Write them as literal properties of the route options.`,
          range: option.propertyRange,
        })
      }
      continue
    }
    if (option.key !== null && deleteNodes.has(option.key)) {
      deleted.push(option)
    }
  }

  if (!splitting) {
    return {
      route,
      groupings,
      decisions,
      notSplit,
      warnings,
      deleted,
    }
  }

  for (const group of groupings) {
    const groupKey = groupKeyOf(group)
    for (const key of new Set(group)) {
      if (!SPLITTABLE_KEYS.includes(key) || deleteNodes.has(key)) {
        continue
      }
      const option = route.props.find(
        (p) =>
          p.key === key &&
          p.kind !== 'spread' &&
          p.kind !== 'computed' &&
          p.kind !== 'accessor',
      )
      if (!option || option.value === null) {
        continue
      }
      const target = splitTarget(ctx, option)
      if (!target) {
        continue
      }
      if ('refused' in target) {
        notSplit.push({
          key,
          reason: target.refused,
          range: { start: option.value.start, end: option.value.end },
          name: null,
        })
        continue
      }
      if (isFallbackLiteral(target.value) || isAlreadyLazy(ctx, target.value)) {
        continue
      }
      if (readsOwnThis(unwrapExpression(target.value))) {
        // #8688: the router calls a method or function-expression callback as
        // a method of the options object; a split chunk's detached call would
        // change its `this` (J2.8: informed, never broken)
        notSplit.push({
          key,
          reason: 'this-reference',
          range: target.region,
          name: null,
        })
        continue
      }
      const shorthandSym =
        target.shape === 'shorthand'
          ? identifierSymbol(ctx, target.value)
          : null
      const valueSym = identifierSymbol(ctx, target.value)
      if (
        valueSym !== null &&
        ctx.symbols.isModuleLevel(valueSym) &&
        ctx.t1.refs.writesOf(valueSym).length > 0
      ) {
        // the options object holds the binding's value at route creation; a
        // chunk re-exporting the live binding would render its latest value
        notSplit.push({
          key,
          reason: 'reassigned',
          range: target.region,
          name: ctx.symbols.name(valueSym),
        })
        continue
      }
      // the core reports a fallback at the option value, or at the
      // declaration of the binding the value names (its writes, its effects)
      const fallback =
        ctx.fallbacks.find((f) => sameRange(f.range, target.region)) ??
        (valueSym !== null
          ? ctx.fallbacks.find((f) =>
              declaringRanges(ctx, valueSym).some((r) => sameRange(r, f.range)),
            )
          : undefined)
      if (fallback) {
        notSplit.push({
          key,
          reason: fallback.reason,
          range: target.region,
          name: valueSym !== null ? ctx.symbols.name(valueSym) : null,
        })
        continue
      }
      const decision: SplitDecision = {
        key,
        option,
        group,
        groupKey,
        shape: target.shape,
        region: target.region,
        valueRange: target.valueRange,
        valueNode: target.value,
        keyText: target.keyText,
        wholeProperty: target.wholeProperty,
        methodPrefix: target.methodPrefix,
        shorthandSym,
        exportName: target.exportName,
        member: target.member,
      }
      decisions.push(decision)
    }
  }

  // J2.8: what stays, once per (file, reason)
  for (const n of notSplit) {
    warnings.push({
      severity: 'warning',
      code: `not-split:${n.reason}`,
      by: 'route-split',
      message: `[tanstack-router] The \`${n.key}\` option of "${file}" is not code-split: ${describeReason(n.reason)}`,
      range: n.range,
    })
  }
  return {
    route,
    groupings,
    decisions,
    notSplit,
    warnings,
    deleted,
  }
}

function describeReason(reason: NotSplitReason): string {
  switch (reason) {
    case 'shared-writer':
      return 'it writes a module binding the route module also reads.'
    case 'multi-writer':
      return 'it writes a module binding another split option also writes.'
    case 'ordered-effect':
      return 'it reads a module binding that top-level code mutates after it.'
    case 'hydrate-writer':
      return 'it writes a binding captured by a hydration boundary.'
    case 'env-declared':
      return 'its value stays in the route module (declared by a top-level call or destructuring, or one with an exported binding it writes); a split chunk could only import it.'
    case 'this-reference':
      return 'it reads `this`, the route options object it is called on, which a split chunk would not see. Write it as an arrow function or read the route instead.'
    case 'reassigned':
      return 'its value names a binding that is reassigned, and the route keeps the value it had when it was created; a split chunk would load the latest value. Assign the binding once.'
    case 'loader-object':
      return 'its value names an object with options next to `handler` that other code also reads; only the handler of an object-form loader is code-split, in an object nothing else reads.'
  }
}

/**
 * Whether a function expression's own body (or parameters) reads `this`,
 * not that of a nested function, class or object method inside it (#8688).
 * Arrow functions have the module's `this` wherever they evaluate.
 */
function readsOwnThis(fn: Node): boolean {
  if (fn.type !== 'FunctionExpression') {
    return false
  }
  let found = false
  walk(fn, {
    enter: (n, wctx) => {
      if (found) {
        wctx.stop()
        return
      }
      if (n === fn) {
        return
      }
      if (
        n.type === 'FunctionExpression' ||
        n.type === 'FunctionDeclaration' ||
        n.type === 'ClassBody'
      ) {
        wctx.skip()
        return
      }
      if (n.type === 'ThisExpression') {
        found = true
        wctx.stop()
      }
    },
  })
  return found
}

/** The ranges of the module-level units declaring a symbol. */
function declaringRanges(ctx: PlanContext, sym: SymbolId): Array<Range> {
  const { t1 } = ctx
  return (t1.declaringUnits.get(sym) ?? []).map(
    (u) => t1.regions.get(t1.units[u]!.region).range,
  )
}

function sameRange(a: Range, b: Range): boolean {
  return a.start === b.start && a.end === b.end
}
