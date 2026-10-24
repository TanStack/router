/**
 * Split decisions of a route module for one planning round: which options
 * move to which chunk, which stay with a reason (J2.8 warnings), computed
 * once and shared by the `route-split` planner (which applies them) and the
 * `route-hmr` planner (which hoists only what stays).
 */
import { splitGroupingsSchema } from '../core/config'
import { defaultCodeSplitGroupings } from '../core/constants'
import {
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  propertyKeyName,
  propertyRangeWithComma,
  recognizeRoute,
  unwrapTs,
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
}

export type NotSplitReason =
  | 'shared-writer'
  | 'multi-writer'
  | 'ordered-effect'
  | 'hydrate-writer'

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
  /** Component options defined on the route, by key, and whether each is split (R42). */
  componentOptions: Map<string, SplitDecision | null>
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

/** The option of a splittable key, or the `handler` of an object-form loader. */
function splitTarget(
  ctx: PlanContext,
  option: RouteOption,
): {
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
} | null {
  if (option.value === null) {
    return null
  }
  let prop = option
  let container: Node | null = null
  if (option.key === 'loader' && option.kind === 'init') {
    const v = unwrapTs(option.value)
    if (v.type === 'ObjectExpression') {
      const code = ctx.analysis.source.code
      const handler = (v.properties as Array<Node>).find(
        (p) =>
          p.type === 'Property' &&
          !p.computed &&
          p.kind === 'init' &&
          propertyKeyName(p) === 'handler',
      )
      if (!handler || handler.type !== 'Property') {
        return null
      }
      container = v
      prop = {
        key: 'handler',
        kind: handler.method
          ? 'method'
          : handler.shorthand
            ? 'shorthand'
            : 'init',
        prop: handler,
        value: handler.value,
        propertyRange: propertyRangeWithComma(v, handler),
        keyText: code.slice(handler.key.start, handler.key.end),
      }
    }
  }
  const value = prop.value!
  switch (prop.kind) {
    case 'init': {
      // the chunk declares the bare value (casts and parentheses dropped, so
      // React Refresh registers a function); the placeholder replaces it all
      const inner = unwrapTs(value)
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
      }
    default:
      return null
  }
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
  const componentOptions = new Map<string, SplitDecision | null>()
  const deleteNodes = new Set(cfg.deleteNodes)
  const splitting = cfg.split && ctx.env.routerSplit && route.kind !== 'lazy'
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
      warnings.push({
        severity: 'warning',
        code: 'options-opaque',
        by: 'route-split',
        message: `[tanstack-router] The route options of "${file}" are ${how}, so ${consequences.join(' and ')}.`,
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
      componentOptions,
    }
  }

  for (const option of route.props) {
    if (
      option.kind === 'spread' ||
      (option.kind === 'computed' && option.key === null)
    ) {
      if (deleteNodes.size > 0) {
        warnings.push({
          severity: 'warning',
          code: 'delete-nodes-dynamic',
          by: 'route-split',
          message: `[tanstack-router] "${file}" spreads or computes route options, so the options ${[...deleteNodes].map((k) => `\`${k}\``).join(', ')} may remain in this build.`,
          range: option.propertyRange,
        })
      }
      continue
    }
    if (option.key !== null && deleteNodes.has(option.key)) {
      deleted.push(option)
    }
  }

  for (const key of COMPONENT_KEYS) {
    if (route.props.some((p) => p.key === key && p.kind !== 'spread')) {
      componentOptions.set(key, null)
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
      componentOptions,
    }
  }

  for (const group of groupings) {
    const groupKey = groupKeyOf(group)
    for (const key of new Set(group)) {
      if (!SPLITTABLE_KEYS.includes(key) || deleteNodes.has(key)) {
        continue
      }
      if (route.kind === 'root' && key === 'component') {
        continue // §5.10: the root component always renders
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
      if (isFallbackLiteral(target.value) || isAlreadyLazy(ctx, target.value)) {
        continue
      }
      const fallback = ctx.fallbacks.find(
        (f) =>
          f.range.start === target.region.start &&
          f.range.end === target.region.end,
      )
      const shorthandSym =
        target.shape === 'shorthand'
          ? identifierSymbol(ctx, target.value)
          : null
      const valueSym = identifierSymbol(ctx, target.value)
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
      }
      decisions.push(decision)
      if (componentOptions.has(key)) {
        componentOptions.set(key, decision)
      }
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
    componentOptions,
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
  }
}
