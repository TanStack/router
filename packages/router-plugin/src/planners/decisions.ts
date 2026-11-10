/**
 * Split decisions of a route module for one planning round: which options
 * move to which chunk, which stay with a reason (J2.8 warnings), and which
 * `deleteNodes` erases. The router planner computes them once per round: its
 * split part applies them, its HMR part hoists only what stays.
 */
import { unwrapExpression, walk } from '@tanstack/router-utils/compiler'
import { groupingsProblem } from '../core/config'
import { splitRouteIdentNodes } from '../core/constants'
import { ROUTER_PLANNER } from './config'
import {
  boundValueOf,
  declaratorOf,
  identifierSymbol,
  isAlreadyLazy,
  isExportedSymbol,
  isFallbackLiteral,
  liveInEnv,
  propertyKeyName,
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

type SplitShape = 'init' | 'method' | 'shorthand'

export interface SplitDecision {
  /** The route option (`component`, `loader`, …). */
  key: string
  /** `component`, `component~loader`: the chunk's owned query value. */
  groupKey: string
  shape: SplitShape
  /** The region claimed by the chunk (replaced by the lazy wrapper in the route module). */
  region: Range
  /**
   * The text the chunk declares its export from: the region itself, or a
   * method's function (the chunk writes the key's modifiers, `methodPrefix`;
   * a non-computed key holds no other planner's edit).
   */
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

type NotSplitReason =
  | 'shared-writer'
  | 'multi-writer'
  | 'ordered-effect'
  | 'hydrate-writer'
  | 'env-declared'
  | 'exhausted'
  | 'this-reference'
  | 'reassigned'
  | 'loader-object'

interface NotSplit {
  key: string
  reason: NotSplitReason
  range: Range
  /** The module binding a writer fallback writes. */
  binding?: string
}

export interface SplitPlan {
  route: RouteModuleInfo
  decisions: Array<SplitDecision>
  warnings: Array<Diagnostic>
  /** Options the splitter deletes in the env output (`deleteNodes`). */
  deleted: Array<RouteOption>
  /**
   * The deleted options written after a spread or a computed key that may
   * hold them: they stay as `undefined`, or removing them would let that value win.
   */
  shadowing: ReadonlySet<RouteOption>
}

const SPLITTABLE_KEYS: ReadonlyArray<string> = splitRouteIdentNodes

/** The splittable options that are components (every one but `loader`). */
export const COMPONENT_KEYS: ReadonlyArray<string> = SPLITTABLE_KEYS.filter(
  (key) => key !== 'loader',
)

function groupKeyOf(group: ReadonlyArray<string>): string {
  return [...new Set(group)].sort().join('~')
}

function effectiveGroupings(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
  route: RouteModuleInfo,
  warnings: Array<Diagnostic>,
): CodeSplitGroupings {
  // (the route file's own groupings are checked where they are read)
  if (route.fileGroupings) {
    return route.fileGroupings
  }
  if (cfg.splitBehavior && route.routeId !== null) {
    const fromPlugin = cfg.splitBehavior({ routeId: route.routeId })
    if (fromPlugin) {
      const problem = groupingsProblem(fromPlugin)
      if (problem !== null) {
        warnings.push({
          severity: 'error',
          message: `[tanstack-router] The groupings \`codeSplittingOptions.splitBehavior\` returns for ${ctx.displayPath} (route ${JSON.stringify(route.routeId)}): ${problem}.`,
          by: ROUTER_PLANNER,
          code: 'groupings-invalid',
        })
        return cfg.defaultGroupings
      }
      return fromPlugin
    }
  }
  // `[]` splits nothing unless `splitBehavior` or the route says so (as
  // before this compiler: `defaultBehavior || default`)
  return cfg.defaultGroupings
}

/** The `function` keyword (with `async` and `*`) a method's function needs as a function expression. */
export function methodPrefixOf(fn: Node): string {
  if (fn.type !== 'FunctionExpression') {
    return ''
  }
  return `${fn.async ? 'async ' : ''}function${fn.generator ? '*' : ''} `
}

type ObjectExpression = Extract<Node, { type: 'ObjectExpression' }>
type Property = Extract<Node, { type: 'Property' }>

/** The `handler` property of an object-form loader. */
function handlerPropertyOf(object: ObjectExpression): Property | null {
  for (const p of object.properties) {
    if (
      p.type === 'Property' &&
      !p.computed &&
      p.kind === 'init' &&
      propertyKeyName(p) === 'handler'
    ) {
      return p
    }
  }
  return null
}

/** The `handler` property of an object-form loader as the option to split. */
function handlerOption(ctx: PlanContext, handler: Property): RouteOption {
  const code = ctx.analysis.source.code
  return {
    key: 'handler',
    kind: handler.method ? 'method' : handler.shorthand ? 'shorthand' : 'init',
    prop: handler,
    value: handler.value,
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
      member: string | null
    }
  | { refused: NotSplitReason }
  | null {
  if (option.value === null) {
    return null
  }
  let prop = option
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
    if (init?.type === 'ObjectExpression' && handler) {
      if (init.properties.length === 1) {
        member = 'handler'
      } else if (ctx.t1.refs.refsOf(sym!).length === 1) {
        // the object holds other options (`staleReloadMode`) the router
        // reads from the route module: the handler is split inside the
        // object, which stays as the route's loader
        prop = handlerOption(ctx, handler)
      } else {
        return { refused: 'loader-object' }
      }
    }
  }
  if (option.key === 'loader' && option.kind === 'init') {
    const v = unwrapExpression(option.value)
    if (v.type === 'ObjectExpression') {
      const handler = handlerPropertyOf(v)
      if (!handler) {
        return null
      }
      prop = handlerOption(ctx, handler)
    }
  }
  const value = prop.value!
  switch (prop.kind) {
    case 'init': {
      // the chunk claims and declares the bare value (so React Refresh
      // registers a function); a cast around it stays in the route module,
      // around the placeholder (`lazyFn(…) as any`): a claim's owner copies
      // the whole claimed text, so every edit inside it reaches the chunk
      const inner = unwrapExpression(value)
      const range = { start: inner.start, end: inner.end }
      return {
        shape: 'init',
        region: range,
        valueRange: range,
        value,
        keyText: prop.keyText,
        wholeProperty: false,
        methodPrefix: '',
        exportName: option.key!,
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

/** The split plan of a recognised route in this planning round. */
export function splitPlanOf(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
  route: RouteModuleInfo,
): SplitPlan {
  const warnings: Array<Diagnostic> = [...route.warnings]
  const file = ctx.displayPath
  const decisions: Array<SplitDecision> = []
  const notSplit: Array<NotSplit> = []
  const deleted: Array<RouteOption> = []
  const shadowing = new Set<RouteOption>()
  const deleteNodes = new Set(cfg.deleteNodes)
  // root routes are never split: their components render on every page or on
  // error and not-found responses, where a lazy chunk only adds a round trip
  // (and the manifest preloads it on every page anyway)
  const splitting = cfg.split && route.kind === 'file'
  const groupings = splitting
    ? effectiveGroupings(ctx, cfg, route, warnings)
    : []

  const deletedNames = () => [...deleteNodes].map((k) => `\`${k}\``).join(', ')

  if (route.options.kind === 'opaque') {
    if (!cfg.clientReportsUnread && (splitting || deleteNodes.size > 0)) {
      const how =
        route.options.reason === 'imported'
          ? 'imported from another module'
          : route.options.reason === 'call'
            ? 'returned by a call'
            : route.options.reason === 'written'
              ? 'written to after their declaration'
              : 'not an object literal'
      warnings.push({
        severity: 'warning',
        code: 'options-opaque',
        by: ROUTER_PLANNER,
        message:
          deleteNodes.size > 0
            ? `[tanstack-router] The route options of ${file} are ${how}, so the compiler cannot read them: they are not code-split, and ${deletedNames()} in them are not removed, so any server code in them ships to the client. Write the route options as an object literal in the route file, with what to split or remove as its properties (\`${route.kind === 'root' ? 'createRootRoute' : 'createFileRoute(path)'}({ component, server })\`).`
            : `[tanstack-router] The route options of ${file} are ${how}, so the compiler cannot read them and the route is not code-split. Write them as an object literal in the call (\`${route.kind === 'root' ? 'createRootRoute' : 'createFileRoute(path)'}({ component, … })\`).`,
        range: {
          start: route.optionsCall.start,
          end: route.optionsCall.end,
        },
      })
    }
    return { route, decisions, warnings, deleted, shadowing }
  }

  let afterUnread = false
  for (const option of route.props) {
    if (
      option.kind === 'spread' ||
      (option.kind === 'computed' && option.key === null)
    ) {
      if (
        deleteNodes.size > 0 &&
        !hidesNoDeletedOption(ctx, option, deleteNodes)
      ) {
        // what the compiler cannot read builds, and is the user's responsibility (J2.8)
        afterUnread = true
        warnings.push({
          severity: 'warning',
          code: 'options-unread',
          by: ROUTER_PLANNER,
          message:
            option.kind === 'spread'
              ? `[tanstack-router] ${file} spreads route options: what the spread holds is not code-split, and ${deletedNames()} in it are not removed, so any server code in it ships to the client. Move what to split or remove out of the spread, as properties of this object; this warning stays while the spread does.`
              : `[tanstack-router] ${file} computes a route option's key: that option is not code-split, and it is not removed if it names ${deletedNames()}, so any server code in it ships to the client. Write the key literally.`,
          range: { start: option.prop.start, end: option.prop.end },
        })
      }
      continue
    }
    if (option.key !== null && deleteNodes.has(option.key)) {
      deleted.push(option)
      if (afterUnread) {
        shadowing.add(option)
      }
    }
  }

  if (!splitting) {
    return { route, decisions, warnings, deleted, shadowing }
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
        })
        continue
      }
      if (isFallbackLiteral(target.value) || isAlreadyLazy(ctx, target.value)) {
        continue
      }
      if (readsOwnThis(ctx, calledFunctionOf(ctx, target))) {
        // #8688: the router calls a method or function-expression callback as
        // a method of the options object; a split chunk's detached call would
        // change its `this` (J2.8: informed, never broken), wherever the
        // function is declared
        notSplit.push({
          key,
          reason: 'this-reference',
          range: target.region,
        })
        continue
      }
      // another planner already moves exactly this text (Start hoists a
      // server fn written in place): the chunk cannot take it as well
      const claimed = ctx.rewrites.claimOn(target.region)
      if (claimed) {
        warnings.push({
          severity: 'error',
          code: 'split-claimed',
          by: ROUTER_PLANNER,
          message: `[tanstack-router] The \`${key}\` option of ${file} is split into its own chunk, but its value is ${claimed.subject ?? 'moved elsewhere by the compiler'}, so it cannot move into the chunk as well. Declare it as a module-level \`const\` before the route and pass it by name: \`${target.keyText}: ${key}Fn\`.`,
          range: target.region,
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
        ctx.t1.mutation.isReassigned(valueSym, liveInEnv(ctx))
      ) {
        // the options object holds the binding's value at route creation; a
        // chunk re-exporting the live binding would render its latest value
        notSplit.push({
          key,
          reason: 'reassigned',
          range: target.region,
        })
        continue
      }
      // the core reports a fallback at the option value, or at the
      // declaration of the binding the value names (its writes, its effects)
      const fallback =
        ctx.fallbackAt(target.region) ??
        (valueSym !== null
          ? declaringRanges(ctx, valueSym)
              .map((r) => ctx.fallbackAt(r))
              .find((f) => f !== undefined)
          : undefined)
      if (fallback) {
        notSplit.push({
          key,
          reason: fallback.reason,
          range: target.region,
          ...(fallback.binding !== undefined && { binding: fallback.binding }),
        })
        continue
      }
      const decision: SplitDecision = {
        key,
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
      by: ROUTER_PLANNER,
      message: `[tanstack-router] The \`${n.key}\` option of ${file} is not code-split: ${describeReason(n.reason, n.key, n.binding)}`,
      range: n.range,
    })
  }
  return {
    route,
    decisions,
    warnings,
    deleted,
    shadowing,
  }
}

function describeReason(
  reason: NotSplitReason,
  key: string,
  binding?: string,
): string {
  const written = binding === undefined ? 'a module binding' : `\`${binding}\``
  const inObject = `\`state.${binding ?? 'count'}\``
  switch (reason) {
    case 'shared-writer':
      return `it writes ${written}, which the route module also uses, and a split chunk cannot write a binding of another module. Keep that state in an object (${inObject}) or in its own module.`
    case 'multi-writer':
      return `it writes ${written}, which another split option also writes, and a split chunk cannot write a binding of another module. Keep that state in an object (${inObject}) or in its own module.`
    case 'ordered-effect':
      return 'it reads a module binding that top-level code changes after it. Read that binding inside the option, or move both to their own module.'
    case 'hydrate-writer':
      return 'it writes a binding a hydration boundary also uses. Keep that state in an object or in its own module.'
    case 'env-declared':
      return 'its value is created by a statement the route module keeps (a call or a destructuring, or one writing an exported binding), so a split chunk could only import it. Declare the value on its own (`function Component() { … }`) to have it split.'
    case 'exhausted':
      return 'the compiler could not settle which options of this route can be split; nothing of it is split.'
    case 'this-reference':
      return `it reads \`this\`, which a split chunk cannot keep: the router calls it without one (\`this\` is \`undefined\`), and only code calling \`Route.options.${key}()\` passes the route options. Write it without \`this\`, for example as an arrow function.`
    case 'reassigned':
      return 'its value names a binding that is reassigned, and the route keeps the value it had when it was created; a split chunk would load the latest value. Assign the binding once.'
    case 'loader-object':
      return 'its value names an object with options next to `handler` that other code also reads, and only the handler of an object-form loader nothing else reads is code-split. Write the object inline in the route options (`loader: { handler, … }`), or keep what other code reads out of it.'
  }
}

/**
 * The function the router calls for a split target: what its value names
 * (`boundValueOf`), or the `handler` of the loader object it names.
 */
function calledFunctionOf(
  ctx: PlanContext,
  target: { value: Node; member: string | null },
): Node {
  const value = boundValueOf(ctx, target.value)
  const handler =
    target.member !== null && value.type === 'ObjectExpression'
      ? handlerPropertyOf(value)
      : null
  return handler ? boundValueOf(ctx, handler.value) : value
}

/**
 * Whether a function expression's or declaration's own body (or parameters)
 * reads `this`, not that of a nested function, class or object method inside
 * it (#8688). Arrow functions have the module's `this` wherever they evaluate.
 */
function readsOwnThis(ctx: PlanContext, fn: Node): boolean {
  if (
    (fn.type !== 'FunctionExpression' && fn.type !== 'FunctionDeclaration') ||
    // (most named functions are components: no walk of a body without the word)
    !ctx.analysis.source.code.slice(fn.start, fn.end).includes('this')
  ) {
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
