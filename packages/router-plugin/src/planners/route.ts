/**
 * Route recognition and option resolution of the router planner: the route
 * call of a file the generator lists (`routeCallOf`, the generator's own
 * answer, with the entry's kind; its id from the entry), the options object
 * (inline, in a module-level constant, through TypeScript wrappers) and
 * every property of it with its kind and source ranges. Computed once per
 * planning round.
 */
import {
  isExpressionWrapper,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import { propertyKeyName, routeCallOf } from '@tanstack/router-generator'
import { GROUPINGS_SHAPE, groupingsProblem } from '../core/config'
import { ROUTER_PLANNER } from './config'
import type {
  ClassifiedRef,
  Diagnostic,
  ModuleAnalysis,
  PlanContext,
  Range,
  SymbolId,
  Unit,
} from '@tanstack/router-utils/compiler'
import type { Node } from 'yuku'
import type { RouteCall } from '@tanstack/router-generator'
import type { CodeSplitGroupings } from '../core/constants'
import type { RouterPlannerConfig } from './config'

type RouteKind = 'file' | 'root' | 'lazy'

type RouteFactory =
  | 'createFileRoute'
  | 'createRootRoute'
  | 'createRootRouteWithContext'
  | 'createLazyFileRoute'

/** The factories whose first call takes the route path, and the call it returns the options. */
const CURRIED_FACTORIES: ReadonlySet<string> = new Set<RouteFactory>([
  'createFileRoute',
  'createRootRouteWithContext',
  'createLazyFileRoute',
])
const FACTORIES: ReadonlySet<string> = new Set<RouteFactory>([
  'createFileRoute',
  'createRootRoute',
  'createRootRouteWithContext',
  'createLazyFileRoute',
])

/** Packages whose `createFileRoute` & co. are the router's. */
const ROUTER_PACKAGE_RE = /^@tanstack\/(react|solid|vue)-router(\/|$)/

type OptionKind =
  | 'init'
  | 'method'
  | 'shorthand'
  | 'accessor'
  | 'spread'
  | 'computed'

export interface RouteOption {
  /** The property name (`component`, `loader`, …); null for spreads and unknown computed keys. */
  key: string | null
  kind: OptionKind
  /** The `Property` / `SpreadElement` node. */
  prop: Node
  /** The value node (the function of a method, the identifier of a shorthand). */
  value: Node | null
  /** The source text of the key as written (`component`, `'component'`). */
  keyText: string
}

type OptionsResolution =
  | { kind: 'object'; node: Node }
  | { kind: 'opaque'; reason: 'imported' | 'call' | 'written' | 'other' }
  /** `createRootRoute()`: no options to split or remove */
  | { kind: 'none' }

export interface RouteModuleInfo {
  /** The file's kind in the route tree (the registry entry's). */
  kind: RouteKind
  /** The router package of the configuration's framework. */
  routerPackage: string
  /** The local binding exported as `Route`. */
  routeSym: SymbolId
  /** The declarator unit of that binding. */
  routeUnit: Unit
  /** The call receiving the options. */
  optionsCall: Node
  /** How many references the factory's import has. */
  factoryReferences: number
  options: OptionsResolution
  /** The unit holding the options object (the route declarator or a module-level constant). */
  optionsUnit: Unit
  props: Array<RouteOption>
  /** `codeSplitGroupings` written in the file (validated by the caller). */
  fileGroupings: CodeSplitGroupings | null
  /** Non-fatal findings of recognition (reported once per file by the host). */
  warnings: Array<Diagnostic>
  /** The id of the route in the current tree (the registry entry's). */
  routeId: string
}

/** The router planner's phase A result: the route registry entry. */
export interface RouteEntryFacts {
  routeId: string
  /** The file's kind in the route tree (`GetRoutesByFileMapResultValue.kind`). */
  kind: RouteKind
  /** `Route` is the router package's constructor call (`GetRoutesByFileMapResultValue.routerConstructor`; absent: not vouched for). */
  routerConstructor?: boolean
}

function describeOptions(ctx: PlanContext, options: Node): Array<RouteOption> {
  const code = ctx.analysis.source.code
  const out: Array<RouteOption> = []
  if (options.type !== 'ObjectExpression') {
    return out
  }
  for (const prop of options.properties as Array<Node>) {
    if (prop.type === 'SpreadElement') {
      out.push({
        key: null,
        kind: 'spread',
        prop,
        value: prop.argument,
        keyText: '',
      })
      continue
    }
    if (prop.type !== 'Property') {
      continue
    }
    const key = propertyKeyName(prop)
    const keyText = code.slice(prop.key.start, prop.key.end)
    let kind: OptionKind
    if (prop.computed) {
      kind = 'computed'
    } else if (prop.kind === 'get' || prop.kind === 'set') {
      kind = 'accessor'
    } else if (prop.method) {
      kind = 'method'
    } else if (prop.shorthand) {
      kind = 'shorthand'
    } else {
      kind = 'init'
    }
    out.push({ key, kind, prop, value: prop.value, keyText })
  }
  return out
}

/**
 * The one unit declaring a binding's value. A namespace of the same name holding
 * only types declares none: TypeScript erases it, and it stays in the env module.
 */
function onlyValueUnit(ctx: PlanContext, sym: SymbolId): Unit | undefined {
  const values = ctx.t1.declaringUnits
    .get(sym)
    ?.map((id) => ctx.t1.units[id]!)
    .filter((unit) => unit.kind !== 'type')
  return values?.length === 1 ? values[0] : undefined
}

export function declaratorOf(
  ctx: PlanContext,
  sym: SymbolId,
): { unit: Unit; init: Node } | null {
  const { t1, symbols } = ctx
  if (!symbols.isModuleLevel(sym) || symbols.isImport(sym)) {
    return null
  }
  const unit = onlyValueUnit(ctx, sym)
  if (
    !unit ||
    unit.kind !== 'declaration' ||
    unit.node.type !== 'VariableDeclarator' ||
    unit.node.init === null ||
    unit.node.id.type !== 'Identifier'
  ) {
    return null
  }
  if (t1.mutation.isReassigned(sym, liveInEnv(ctx))) {
    return null
  }
  return { unit, init: unit.node.init }
}

/**
 * What a value denotes through the module's bindings, wrappers dropped: the
 * initialiser of the `const` it names (`declaratorOf`), followed through
 * each `const` naming another (`const b = a as any`), or the function
 * declaration it names; the value itself (an identifier when it names
 * anything else) otherwise.
 */
export function boundValueOf(ctx: PlanContext, value: Node): Node {
  let node = unwrapExpression(value)
  const seen = new Set<SymbolId>()
  while (node.type === 'Identifier') {
    const b = ctx.analysis.file.referenceOf(node)?.binding ?? null
    const sym = b ? ctx.symbols.ofBinding(b) : null
    if (sym === null || seen.has(sym)) {
      break
    }
    seen.add(sym)
    const decl = declaratorOf(ctx, sym)
    if (decl) {
      node = unwrapExpression(decl.init)
      continue
    }
    const unit = ctx.symbols.isModuleLevel(sym)
      ? onlyValueUnit(ctx, sym)
      : undefined
    if (
      unit?.node.type === 'FunctionDeclaration' &&
      !ctx.t1.mutation.isReassigned(sym, liveInEnv(ctx))
    ) {
      return unit.node
    }
    break
  }
  return node
}

/** The mutation model as the env output sees it (a write inside code the environment erases imposes nothing). */
export function liveInEnv(ctx: PlanContext): (ref: ClassifiedRef) => boolean {
  return ctx.liveness('env').live
}

/**
 * The `codeSplitGroupings` the route file writes (an array literal, or a
 * local `const` holding one, `boundValueOf`), or what keeps the compiler
 * from reading it.
 */
function readGroupings(
  ctx: PlanContext,
  value: Node,
): CodeSplitGroupings | { problem: string } {
  const shape = `must be ${GROUPINGS_SHAPE}`
  const node = boundValueOf(ctx, value)
  if (node.type === 'Identifier') {
    return {
      problem:
        'must be written in the route file, as an array literal or a local `const`: the compiler cannot read an imported or computed value',
    }
  }
  if (node.type !== 'ArrayExpression') {
    return { problem: shape }
  }
  const groups: CodeSplitGroupings = []
  for (const group of node.elements) {
    if (!group || group.type !== 'ArrayExpression') {
      return { problem: shape }
    }
    const keys: Array<string> = []
    for (const item of group.elements) {
      const el = item ? unwrapExpression(item) : null
      if (!el || el.type !== 'Literal' || typeof el.value !== 'string') {
        return {
          problem: "must name each option as a string literal (`'component'`)",
        }
      }
      keys.push(el.value)
    }
    groups.push(keys as CodeSplitGroupings[number])
  }
  const problem = groupingsProblem(groups)
  return problem === null ? groups : { problem }
}

/** The router package of a configuration's framework (`@tanstack/react-router`). */
export function routerPackageOf(cfg: RouterPlannerConfig): string {
  return `@tanstack/${cfg.framework}-router`
}

/**
 * The route of a module the generator lists (`entry`): the call bound to its
 * `Route` export, as the generator reads it (`routeCallOf`, with the entry's
 * kind). A module whose `Route` is not that call, or one the generator still
 * repairs, is left alone (reported when it imports a route constructor:
 * J2.10).
 */
export function recognizeRoute(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
  entry: RouteEntryFacts,
): RouteModuleInfo | null {
  const { analysis, t1, symbols } = ctx
  const file = analysis.file
  const routerPackage = routerPackageOf(ctx.config)
  const fileName = ctx.displayPath
  const call = routeCallOf(file, { routerPackage, kind: entry.kind })
  if (call.kind !== 'ours') {
    if (call.kind === 'foreign') {
      reportForeignRoute(ctx, call)
    }
    return null
  }
  if (call.repair !== 'none') {
    // the generator rewrites it next (one generation later in dev)
    return null
  }
  const warnings: Array<Diagnostic> = []
  const declared = file.bindingOf(call.declarator.id)
  const routeSym = declared ? symbols.ofBinding(declared) : null
  const routeUnit = routeSym !== null ? onlyValueUnit(ctx, routeSym) : undefined
  if (routeSym === null || routeUnit?.node !== call.declarator) {
    // (a namespace of values merged with `Route`: two units declare it)
    reportUnrecognizedRoute(ctx)
    return null
  }
  const outer = call.call
  // J2.11: a second constructor call in the module
  const calleeObject =
    call.callee.type === 'MemberExpression'
      ? unwrapExpression(call.callee.object as Node)
      : call.callee
  const calleeBinding = file.referenceOf(calleeObject)?.binding ?? null
  const factoryRefs = calleeBinding
    ? t1.refs.refsOf(symbols.ofBinding(calleeBinding))
    : []
  const calls = factoryRefs.filter(
    (r) => r.ctx === 'callee' && r.kind === 'value',
  )
  if (calls.length > 1) {
    const other = calls.find((c) => c.range.start !== call.callee.start)
    warnings.push({
      severity: 'warning',
      message: `[tanstack-router] ${fileName} calls ${call.constructor} more than once; only the call bound to its \`Route\` export is code-split and hot-updated.`,
      range: other?.range,
      by: ROUTER_PLANNER,
      code: 'route-several-calls',
    })
  }
  const argument = outer.arguments[0]
  let options: OptionsResolution
  let optionsUnit: Unit = routeUnit
  if (!argument) {
    options = { kind: 'none' }
  } else {
    const arg = unwrapExpression(argument)
    if (arg.type === 'ObjectExpression') {
      options = { kind: 'object', node: arg }
    } else if (arg.type === 'Identifier') {
      const b = file.referenceOf(arg)?.binding ?? null
      const sym = b ? symbols.ofBinding(b) : null
      const decl = sym !== null ? declaratorOf(ctx, sym) : null
      const init = decl ? unwrapExpression(decl.init) : null
      if (decl && init && init.type === 'ObjectExpression') {
        if (t1.mutation.isMutated(sym!, liveInEnv(ctx))) {
          options = { kind: 'opaque', reason: 'written' }
        } else {
          options = { kind: 'object', node: init }
          optionsUnit = decl.unit
        }
      } else if (sym !== null && symbols.isImport(sym)) {
        options = { kind: 'opaque', reason: 'imported' }
      } else {
        options = { kind: 'opaque', reason: 'other' }
      }
    } else if (arg.type === 'CallExpression') {
      options = { kind: 'opaque', reason: 'call' }
    } else {
      options = { kind: 'opaque', reason: 'other' }
    }
  }
  const props =
    options.kind === 'object' ? describeOptions(ctx, options.node) : []
  let fileGroupings: CodeSplitGroupings | null = null
  const groupingsProp = props.find(
    (p) =>
      p.key === 'codeSplitGroupings' && p.value !== null && p.kind !== 'spread',
  )
  if (groupingsProp && groupingsProp.value) {
    const read = readGroupings(ctx, groupingsProp.value)
    if ('problem' in read) {
      // the module fails, positioned at the value (J2.8: what the user wrote
      // cannot be honoured, so nothing is guessed)
      warnings.push({
        severity: 'error',
        message: `[tanstack-router] The \`codeSplitGroupings\` of ${fileName} ${read.problem}.`,
        range: {
          start: groupingsProp.value.start,
          end: groupingsProp.value.end,
        },
        by: ROUTER_PLANNER,
        code: 'groupings-invalid',
      })
    } else {
      fileGroupings = read
    }
  }
  return {
    kind: entry.kind,
    routerPackage,
    routeSym,
    routeUnit,
    optionsCall: outer,
    factoryReferences: factoryRefs.length,
    options,
    optionsUnit,
    props,
    fileGroupings,
    warnings,
    routeId: entry.routeId,
  }
}

/**
 * A listed route file whose `Route` is not the router package's route
 * call: an app helper re-exporting a constructor under its name
 * (`foreignFactory`), or a file using the router's constructor otherwise
 * (J2.10).
 */
function reportForeignRoute(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
  call: Extract<RouteCall, { kind: 'foreign' }>,
): void {
  const { analysis } = ctx
  if (call.call) {
    const callee = unwrapExpression(call.call.callee as Node)
    const factoryNode =
      callee.type === 'CallExpression'
        ? unwrapExpression(callee.callee as Node)
        : callee
    const foreign = foreignFactory(analysis, factoryNode)
    if (foreign) {
      ctx.diagnostic(
        foreignFactoryDiagnostic(ctx.config, ctx.displayPath, foreign, {
          start: factoryNode.start,
          end: factoryNode.end,
        }),
      )
      return
    }
  }
  if (call.usesConstructor) {
    reportUnrecognizedRoute(ctx)
  }
}

/** J2.10: the route of a listed file importing a route constructor is not the one call the compiler reads. */
function reportUnrecognizedRoute(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
): void {
  const { analysis } = ctx
  const routeExport = analysis.exports.find(
    (e) => e.kind === 'local' && e.name === 'Route' && !e.typeOnly,
  )
  const routeUnit =
    routeExport?.kind === 'local' && routeExport.local !== null
      ? onlyValueUnit(ctx, routeExport.local)
      : undefined
  const declarator =
    routeUnit?.kind === 'declaration' &&
    routeUnit.node.type === 'VariableDeclarator'
      ? routeUnit.node
      : null
  ctx.diagnostic({
    severity: 'warning',
    message: `[tanstack-router] The route of ${ctx.displayPath} is not created by a route factory call bound to its \`Route\` export, so it is not code-split or hot-updated. Write it as \`export const Route = createFileRoute(path)({ … })\` (\`createRootRoute({ … })\` in the root route).`,
    range: declarator
      ? { start: declarator.start, end: declarator.end }
      : routeExport?.range,
    by: ROUTER_PLANNER,
    code: 'route-unrecognized',
  })
}

/**
 * A callee named like a route factory whose import is not a router
 * package's (an app module re-exporting the router's `createFileRoute`): it
 * is not recognised (only the router's own export is, by its binding), so
 * the route is reported instead of passing silently.
 */
function foreignFactory(
  analysis: ModuleAnalysis,
  node: Node,
): { name: string; specifier: string } | null {
  const file = analysis.file
  if (node.type === 'Identifier') {
    const imp = file.referenceOf(node)?.binding?.import ?? null
    if (!imp || imp.kind !== 'named' || ROUTER_PACKAGE_RE.test(imp.specifier)) {
      return null
    }
    const name = FACTORIES.has(node.name) ? node.name : imp.name
    return name !== null && FACTORIES.has(name)
      ? { name, specifier: imp.specifier }
      : null
  }
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    FACTORIES.has(node.property.name)
  ) {
    const obj = unwrapExpression(node.object as Node)
    const imp =
      obj.type === 'Identifier'
        ? (file.referenceOf(obj)?.binding?.import ?? null)
        : null
    return imp?.kind === 'namespace' && !ROUTER_PACKAGE_RE.test(imp.specifier)
      ? { name: node.property.name, specifier: imp.specifier }
      : null
  }
  return null
}

/**
 * The report of a route whose factory comes from another module
 * (`foreignFactory`): a warning, an error where `deleteNodes` must remove
 * options (Start's client: its server options would ship otherwise).
 */
function foreignFactoryDiagnostic(
  cfg: RouterPlannerConfig,
  fileName: string,
  foreign: { name: string; specifier: string },
  range: Range,
): Diagnostic {
  const pkg = `@tanstack/${cfg.framework}-router`
  const deleted = cfg.deleteNodes.map((k) => `\`${k}\``).join(', ')
  return {
    severity: cfg.deleteNodes.length > 0 ? 'error' : 'warning',
    code: 'route-factory-foreign',
    by: ROUTER_PLANNER,
    message: `[tanstack-router] The route of ${fileName} calls \`${foreign.name}\` imported from "${foreign.specifier}", not from ${pkg}, so it is not code-split or hot-updated${deleted ? `, and the options ${deleted} are not removed from the client code` : ''}: only the router's own \`${foreign.name}\` is recognised. Import it from the router: \`import { ${foreign.name} } from '${pkg}'\`.`,
    range,
  }
}

/**
 * A route factory call other than the route's own (a second call, a wrapped
 * or a stored factory) holding an option `deleteNodes` must remove: only the
 * route's own call has it removed, so it is an error at the call. The
 * generator takes one `Route` export per file, so such a call is no route.
 */
export function unownedRouteOptions(
  ctx: PlanContext,
  cfg: RouterPlannerConfig,
  route: RouteModuleInfo | null,
): Array<Diagnostic> {
  if (cfg.deleteNodes.length === 0) {
    return []
  }
  const factories: ModuleAnalysis['imports'][number]['specifiers'] = []
  for (const imp of ctx.analysis.imports) {
    for (const spec of imp.specifiers) {
      if (
        spec.local >= 0 &&
        (spec.imported === '*' || FACTORIES.has(spec.imported)) &&
        ROUTER_PACKAGE_RE.test(imp.specifier)
      ) {
        factories.push(spec)
      }
    }
  }
  // the usual route file holds one call, its own
  if (route && factories.length === 1 && route.factoryReferences === 1) {
    return []
  }
  const file = ctx.analysis.file
  const out: Array<Diagnostic> = []
  /** The expression `node` is, through wrappers, and its parent. */
  const outermost = (node: Node) => {
    let outer = node
    let p = file.parentOf(outer)
    while (p && isExpressionWrapper(p)) {
      outer = p
      p = file.parentOf(outer)
    }
    return { outer, p }
  }
  /** The call `node` is the callee of. */
  const called = (node: Node): Node | null => {
    const { outer, p } = outermost(node)
    return p?.type === 'CallExpression' && p.callee === outer ? p : null
  }
  /** The references of the variable `node` initialises. */
  const readsOf = (node: Node) => {
    const { p } = outermost(node)
    return p?.type === 'VariableDeclarator' && p.id.type === 'Identifier'
      ? (file.bindingOf(p.id)?.references ?? [])
      : []
  }
  /** `takesOptions`: the call's first argument is the options, not a route path. */
  const judge = (call: Node | null, takesOptions: boolean) => {
    if (call?.type !== 'CallExpression' || call === route?.optionsCall) {
      return
    }
    let options = call.arguments[0] && unwrapExpression(call.arguments[0])
    if (options?.type === 'Identifier') {
      const b = file.referenceOf(options)?.binding
      const decl = b && declaratorOf(ctx, ctx.symbols.ofBinding(b))
      options = decl ? unwrapExpression(decl.init) : options
    }
    const deleted: Array<string> = []
    let unread = false
    if (options?.type === 'ObjectExpression') {
      for (const prop of options.properties) {
        const key = propertyKeyName(prop)
        if (key === null) {
          unread = true
        } else if (cfg.deleteNodes.includes(key)) {
          deleted.push(key)
        }
      }
    } else {
      unread = options !== undefined
    }
    if (deleted.length > 0) {
      out.push({
        severity: 'error',
        code: 'route-unowned-options',
        by: ROUTER_PLANNER,
        message: `[tanstack-router] ${ctx.displayPath} holds \`${deleted.join('`, `')}\` in a route factory call that is not bound directly to its \`Route\` export (\`export const Route = createFileRoute(path)(options)\`), so ${deleted.length === 1 ? 'it is' : 'they are'} not removed from the client code. The generator takes one \`Route\` export per file: write this call in that form, or move it to its own route file.`,
        range: { start: call.start, end: call.end },
      })
    } else if (unread && takesOptions) {
      out.push({
        severity: 'warning',
        code: 'route-unowned-unread',
        by: ROUTER_PLANNER,
        message: `[tanstack-router] ${ctx.displayPath} has a route factory call that is not bound directly to its \`Route\` export, with options the compiler cannot read: any \`${cfg.deleteNodes.join('`, `')}\` in them are not removed, so any server code in them ships to the client. Write what to remove as properties of an object literal, in a call of the form \`export const Route = createFileRoute(path)({ ... })\`, or move it to its own route file.`,
        range: { start: call.start, end: call.end },
      })
    }
  }
  const aliases = new Set<Node>()
  /** The calls of a factory read at `node`: `factory(path)(options)`, `factory(options)`, a stored `factory(path)`, the factory under another name. */
  const judgeCalls = (node: Node, curried: boolean) => {
    const first = called(node)
    if (!first) {
      for (const ref of readsOf(node)) {
        if (!aliases.has(ref.node)) {
          aliases.add(ref.node)
          judgeCalls(ref.node, curried)
        }
      }
      return
    }
    const second = called(first)
    judge(second ?? first, !curried || second !== null)
    if (!second && curried) {
      for (const ref of readsOf(first)) {
        judge(called(ref.node), true)
      }
    }
  }
  for (const spec of factories) {
    const named = spec.imported !== '*'
    for (const ref of file.bindings[spec.local]?.references ?? []) {
      const member = named ? ref.node : file.parentOf(ref.node)
      const name = named
        ? spec.imported
        : member?.type === 'MemberExpression' &&
            member.property.type === 'Identifier'
          ? member.property.name
          : null
      if (name !== null && FACTORIES.has(name)) {
        judgeCalls(member!, CURRIED_FACTORIES.has(name))
      }
    }
  }
  return out
}

/** The router's id of a registry entry (`/__root` is `__root__` on the router). */
export function routerRouteId(routeId: string): string {
  return routeId === '/__root' ? '__root__' : routeId
}

/** The route-registry dependency fingerprint of a file: its route id, its kind and whether the router's constructor made its Route. */
export function routeEntryDigest(entry: RouteEntryFacts | null): string | null {
  return entry
    ? `${entry.routeId}\u0000${entry.kind}\u0000${entry.routerConstructor ? 'router' : 'foreign'}`
    : null
}

/** Whether `value` means "fall back to the parent" (`undefined`, `null`, a boolean): kept as written. */
export function isFallbackLiteral(value: Node): boolean {
  const v = unwrapExpression(value)
  if (v.type === 'Identifier') {
    return v.name === 'undefined'
  }
  return (
    v.type === 'Literal' && (v.value === null || typeof v.value === 'boolean')
  )
}

/** Whether `value` is already a lazy wrapper of the router (`lazyRouteComponent(...)`, `lazyFn(...)`), left alone (OQ13). */
export function isAlreadyLazy(
  ctx: PlanContext,
  routerPackage: string,
  value: Node,
): boolean {
  const v = unwrapExpression(value)
  if (v.type !== 'CallExpression') {
    return false
  }
  const callee = unwrapExpression(v.callee as Node)
  if (callee.type !== 'Identifier') {
    return false
  }
  const b = ctx.analysis.file.referenceOf(callee)?.binding ?? null
  const imp = b?.import ?? null
  return (
    imp !== null &&
    imp.kind === 'named' &&
    (imp.name === 'lazyRouteComponent' || imp.name === 'lazyFn') &&
    imp.specifier === routerPackage
  )
}

/**
 * Whether React Refresh registers a `const` the compiler declares with
 * `init` as a component family, as its transform decides
 * (`findInnerComponents` of react-refresh/babel; oxc and SWC follow it, on
 * code without casts or parentheses, around a call's argument too): a
 * function (not one returning a function), or a call of a higher-order
 * component (`memo(() => …)`, `withAuth(Page)`, `memo(Page as any)`).
 * Route HMR hoists an inline component option into such a `const` when it
 * registers (a family keeps its state across edits); a conditional, a
 * member or another call is no family and stays inline (an edit remounts
 * it).
 */
export function refreshRegisters(init: Node): boolean {
  const v = unwrapExpression(init)
  switch (v.type) {
    case 'ArrowFunctionExpression':
      return v.body.type !== 'ArrowFunctionExpression'
    case 'FunctionExpression':
      return true
    case 'CallExpression': {
      const callee = v.callee
      const [arg] = v.arguments
      if (
        arg === undefined ||
        !(
          callee.type === 'MemberExpression' ||
          (callee.type === 'Identifier' &&
            !callee.name.startsWith('require') &&
            !callee.name.startsWith('import'))
        )
      ) {
        return false
      }
      const first = unwrapExpression(arg)
      return first.type === 'Identifier'
        ? /^[A-Z]/.test(first.name)
        : refreshRegisters(first)
    }
    default:
      return false
  }
}

/**
 * What a component option's identity is for Solid's and Vue's refresh
 * runtimes, recorded per evaluation for the route HMR runtime (`unsplit`):
 * an import is the module's export (`<specifier>#<imported name>`, a
 * same-named import from another module is another component), a module
 * binding its name.
 */
export function bindingIdentity(ctx: PlanContext, sym: SymbolId): string {
  if (ctx.symbols.isImport(sym)) {
    for (const imp of ctx.analysis.imports) {
      const s = imp.specifiers.find((x) => x.local === sym)
      if (s) {
        return `${imp.specifier}#${s.imported}`
      }
    }
  }
  return ctx.symbols.name(sym)
}

/** The module-level symbol an identifier value denotes, or null. */
export function identifierSymbol(
  ctx: PlanContext,
  value: Node,
): SymbolId | null {
  const v = unwrapExpression(value)
  if (v.type !== 'Identifier') {
    return null
  }
  const b = ctx.analysis.file.referenceOf(v)?.binding ?? null
  if (!b) {
    return null
  }
  const sym = ctx.symbols.ofBinding(b)
  if (ctx.symbols.kind(sym) === 'ambient' || !ctx.symbols.isModuleLevel(sym)) {
    return null
  }
  return sym
}

/** Whether a module-level symbol is exported (directly, by a list, as default). */
export function isExportedSymbol(ctx: PlanContext, sym: SymbolId): boolean {
  return ctx.analysis.exports.some(
    (e) => e.kind === 'local' && e.local === sym && !e.typeOnly,
  )
}

export function pascal(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}
