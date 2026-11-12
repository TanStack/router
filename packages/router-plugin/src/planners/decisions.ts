/**
 * Split decisions of a route module for one planning round: which options
 * move to which chunk, which stay with a reason (J2.8 warnings), and which
 * `deleteNodes` erases. The router planner computes them once per round: its
 * split part applies them, its HMR part hoists only what stays.
 */
import { isExpressionWrapper, walk } from '@tanstack/router-utils/compiler'
import { propertyKeyName } from '@tanstack/router-generator'
import { groupingsProblem } from '../core/config'
import { splitRouteIdentNodes } from '../core/constants'
import { ROUTER_PLANNER } from './config'
import {
  boundValueOf,
  chainSoleUse,
  chainWritten,
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  liveInEnv,
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
  | 'loader-unread'
  | 'loader-handler-replaceable'

interface NotSplit {
  key: string
  reason: NotSplitReason
  range: Range
  /** The module binding a writer fallback writes (`ordered-effect`: writes or reads). */
  binding?: string
  /** `ordered-effect`: the option writes `binding`, which other code uses (`used`) or which stays in the route module (`kept`). */
  writes?: 'used' | 'kept'
  /** `writes: 'kept'`: marking `binding`'s initialiser `/* @__PURE__ *\/` frees the option. */
  annotate?: true
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
  if (cfg.splitBehavior) {
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

/**
 * The `handler` property of an object-form loader (the last one written;
 * none when that is an accessor), or `'replaceable'` when what follows it
 * (a spread, a computed key) may give the object another handler.
 */
function handlerPropertyOf(
  object: ObjectExpression,
): Property | 'replaceable' | null {
  let handler: Property | 'replaceable' | null = null
  for (const p of object.properties) {
    if (
      p.type === 'Property' &&
      !p.computed &&
      propertyKeyName(p) === 'handler'
    ) {
      handler = p.kind === 'init' ? p : null
    } else if (handler !== null && (p.type !== 'Property' || p.computed)) {
      handler = 'replaceable'
    }
  }
  return handler
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

/** Whether `node` is a function the compiler reads (an arrow, a function expression or declaration). */
function isFunction(node: Node): boolean {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  )
}

/** The bare value inside the wrappers around `value`, or, for a sequence, its innermost parentheses. */
function claimedValueOf(value: Node): Node {
  let parens: Node | null = null
  let n = value
  while (isExpressionWrapper(n)) {
    if (n.type === 'ParenthesizedExpression') {
      parens = n
    }
    n = n.expression
  }
  return n.type === 'SequenceExpression' && parens !== null ? parens : n
}

/** The option of a splittable key, or the `handler` of an object-form loader. */
function splitTarget(
  ctx: PlanContext,
  routerPackage: string,
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
    // what the value is through a chain of consts: a function splits; an
    // object-form loader splits its handler
    const { node: init, syms } = boundValueOf(ctx, option.value)
    if (init.type !== 'ObjectExpression' && !isFunction(init)) {
      // an import, a call, …: a function, or an object-form loader whose
      // options (`staleReloadMode`) the router reads from the route module
      // before a chunk could load. A value the router never calls (a lazy
      // wrapper, `undefined`) stays, nothing reported
      return isFallbackLiteral(init) || isAlreadyLazy(ctx, routerPackage, init)
        ? null
        : { refused: 'loader-unread' }
    }
    if (init.type === 'ObjectExpression') {
      const handler = handlerPropertyOf(init)
      if (handler === null) {
        // no `handler` the text shows (`{ ...base }`): stays in the route
        // module, nothing reported
        return null
      }
      if (handler === 'replaceable') {
        return { refused: 'loader-handler-replaceable' }
      }
      if (syms.length === 0) {
        // `loader: { handler, … }`: the handler is split inside the object
        prop = handlerOption(ctx, handler)
      } else if (init.properties.length === 1 && !chainWritten(ctx, syms)) {
        // a module const `{ handler }`: the chunk exports its handler (the
        // router calls `loader.handler`; `lazyFn` calls what the chunk
        // exports)
        member = 'handler'
      } else if (chainSoleUse(ctx, syms)) {
        // the object holds other options (`staleReloadMode`) the router
        // reads from the route module: the handler is split inside the
        // object, which stays as the route's loader
        prop = handlerOption(ctx, handler)
      } else {
        return { refused: 'loader-object' }
      }
    }
  }
  const value = prop.value!
  switch (prop.kind) {
    case 'init': {
      // the chunk claims and declares the bare value (so React Refresh
      // registers a function); a cast around it stays in the route module,
      // around the placeholder (`lazyFn(…) as any`): a claim's owner copies
      // the whole claimed text, so every edit inside it reaches the chunk. A
      // sequence keeps its innermost parentheses: without them the chunk's
      // `const X = a, b` would declare, not evaluate it
      const inner = claimedValueOf(value)
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
  if (!ref) {
    return false
  }
  // a module const, or a chain of consts naming one (I4)
  const { node: init, syms } = boundValueOf(ctx, ref)
  if (syms.length === 0) {
    return false
  }
  if (option.kind !== 'spread') {
    return (
      init.type === 'Literal' &&
      typeof init.value === 'string' &&
      !deleteNodes.has(init.value)
    )
  }
  if (init.type !== 'ObjectExpression' || !chainSoleUse(ctx, syms)) {
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
              : route.options.reason === 'reassigned'
                ? 'in a variable that is reassigned'
                : 'not an object literal'
      const call =
        route.kind === 'root' ? 'createRootRoute' : 'createFileRoute(path)'
      const fix =
        route.options.reason === 'reassigned'
          ? `Declare them with \`const\` and never reassign them (\`const options = { component${deleteNodes.size > 0 ? ', server' : ', …'} }\`).`
          : deleteNodes.size > 0
            ? `Write the route options as an object literal in the route file, with what to split or remove as its properties (\`${call}({ component, server })\`).`
            : `Write them as an object literal in the call (\`${call}({ component, … })\`).`
      warnings.push({
        severity: 'warning',
        code: 'options-opaque',
        by: ROUTER_PLANNER,
        message:
          deleteNodes.size > 0
            ? `[tanstack-router] The route options of ${file} are ${how}, so the compiler cannot read them: they are not code-split, and ${deletedNames()} in them are not removed, so any server code in them ships to the client. ${fix}`
            : `[tanstack-router] The route options of ${file} are ${how}, so the compiler cannot read them and the route is not code-split. ${fix}`,
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
      const target = splitTarget(ctx, route.routerPackage, option)
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
      if (
        isFallbackLiteral(target.value) ||
        isAlreadyLazy(ctx, route.routerPackage, target.value)
      ) {
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
      // another planner already puts something at exactly this text's place
      // in the route module (Start hoists a server fn written in place): the
      // chunk cannot take it as well
      const claimed = ctx.rewrites.view('env').placeholderAt(target.region)
      if (claimed) {
        warnings.push({
          severity: 'error',
          code: 'split-claimed',
          by: ROUTER_PLANNER,
          message: `[tanstack-router] The \`${key}\` option of ${file} is split into its own chunk, but its value is ${('owner' in claimed ? claimed.subject : undefined) ?? 'moved elsewhere by the compiler'}, so it cannot move into the chunk as well. Declare it as a module-level \`const\` before the route and pass it by name: \`${target.keyText}: ${key}Fn\`.`,
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
          ...(fallback.writes !== undefined && { writes: fallback.writes }),
          ...(fallback.annotate && { annotate: true }),
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
      message: `[tanstack-router] The \`${n.key}\` option of ${file} is not code-split: ${describeReason(n.reason, n.key, n.binding, n.writes, n.annotate)}`,
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
  writes?: 'used' | 'kept',
  annotate?: true,
): string {
  const written = binding === undefined ? 'a module binding' : `\`${binding}\``
  const inObject = `\`state.${binding ?? 'count'}\``
  switch (reason) {
    case 'shared-writer':
      return `it writes ${written}, which the route module also uses, and a split chunk cannot write a binding of another module. Keep that state in an object (${inObject}) or in its own module.`
    case 'multi-writer':
      return `it writes ${written}, which another split option also writes, and a split chunk cannot write a binding of another module. Keep that state in an object (${inObject}) or in its own module.`
    case 'ordered-effect':
      if (writes === 'used') {
        // (when it loads, or in a function its call runs, which may run at
        // any time: other code of the module would see the write at another
        // time)
        return `it writes ${written}, which other code also uses, so a split would change when that code sees the write. Use ${written} only inside the option's functions.`
      }
      if (writes === 'kept') {
        // the binding stays in the route module (its initialiser's effects,
        // or code there needs it): the chunk would write it after that
        // module's code ran
        return annotate
          ? `it writes ${written}, which stays in the route module because its initialiser has side effects, so a split would run the write later than written. Mark that initialiser \`/* @__PURE__ */\` if it has none.`
          : `it writes ${written}, which stays in the route module, so a split would run the write later than written. Declare and use ${written} only inside the option's functions.`
      }
      return `it uses ${written} when the module loads, and other code of the module changes it later or reads it after the option, so a split would change what one of them sees. Use ${written} only inside the option's functions, or move what writes it out of the option, before the route.`
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
    case 'loader-unread':
      return 'the compiler cannot tell whether its value is a function or an object-form loader (`{ handler, staleReloadMode }`), whose options the router reads from the route module before a split chunk could load. Write the loader in the route options (`loader: { handler, … }` for an object), or call a function from one written there: `loader: (ctx) => myLoader(ctx)`.'
    case 'loader-handler-replaceable':
      return 'what is written after `handler` in its object (a spread, a computed key) may replace the handler, so the compiler cannot tell what the router calls. Put the spread before `handler`: `loader: { ...options, handler }`.'
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
  const { node: value } = boundValueOf(ctx, target.value)
  const handler =
    target.member !== null && value.type === 'ObjectExpression'
      ? handlerPropertyOf(value)
      : null
  return handler !== null && handler !== 'replaceable'
    ? boundValueOf(ctx, handler.value).node
    : value
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
  return (t1.declaringUnits.get(sym) ?? []).map((u) => t1.units[u]!.range)
}
