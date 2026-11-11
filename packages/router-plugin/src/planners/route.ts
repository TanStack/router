/**
 * Route recognition and option resolution of the router planner: the route
 * call of a file the generator lists (`routeCallOf`, the generator's own
 * answer, with the entry's kind; its id from the entry), the options object
 * (inline, in a module-level constant, through TypeScript wrappers) and
 * every property of it with its kind and source ranges. Computed once per
 * planning round.
 */
import { unwrapExpression } from '@tanstack/router-utils/compiler'
import { propertyKeyName, routeCallOf } from '@tanstack/router-generator'
import { GROUPINGS_SHAPE, groupingsProblem } from '../core/config'
import { ROUTER_PLANNER } from './config'
import type {
  ClassifiedRef,
  Diagnostic,
  PlanContext,
  SymbolId,
  Unit,
} from '@tanstack/router-utils/compiler'
import type { Node } from 'yuku'
import type { CodeSplitGroupings } from '../core/constants'
import type { RouterPlannerConfig } from './config'

type RouteKind = 'file' | 'root' | 'lazy'

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

function declaratorOf(
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
 * anything else) otherwise. `syms`: the consts walked, in order (the last
 * one's initialiser is `node`, when it is one).
 */
export function boundValueOf(
  ctx: PlanContext,
  value: Node,
): { node: Node; syms: Array<SymbolId> } {
  let node = unwrapExpression(value)
  const syms: Array<SymbolId> = []
  while (node.type === 'Identifier') {
    const b = ctx.analysis.file.referenceOf(node)?.binding ?? null
    const sym = b ? ctx.symbols.ofBinding(b) : null
    if (sym === null || syms.includes(sym)) {
      break
    }
    const decl = declaratorOf(ctx, sym)
    if (decl) {
      syms.push(sym)
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
      return { node: unit.node, syms }
    }
    break
  }
  return { node, syms }
}

/** Whether a const a value was named through is written to in the env output (`boundValueOf`'s `syms`). */
export function chainWritten(
  ctx: PlanContext,
  syms: ReadonlyArray<SymbolId>,
): boolean {
  const live = liveInEnv(ctx)
  return syms.some((sym) => ctx.t1.mutation.isMutated(sym, live))
}

/** Whether each const a value was named through has that one use, unexported (`boundValueOf`'s `syms`). */
export function chainSoleUse(
  ctx: PlanContext,
  syms: ReadonlyArray<SymbolId>,
): boolean {
  return syms.every(
    (sym) =>
      ctx.t1.refs.refsOf(sym).length === 1 && !isExportedSymbol(ctx, sym),
  )
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
  const { node } = boundValueOf(ctx, value)
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
    // (a route made by the app's own helper gets nothing: R130)
    if (call.kind === 'foreign' && call.usesConstructor) {
      reportUnrecognizedRoute(ctx)
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
    // the object literal, or the one a chain of consts names (I4)
    const { node, syms } = boundValueOf(ctx, argument)
    const last = syms.at(-1)
    if (node.type === 'ObjectExpression') {
      if (last === undefined) {
        options = { kind: 'object', node }
      } else if (chainWritten(ctx, syms)) {
        options = { kind: 'opaque', reason: 'written' }
      } else {
        options = { kind: 'object', node }
        optionsUnit = onlyValueUnit(ctx, last)!
      }
    } else if (node.type === 'Identifier') {
      const b = file.referenceOf(node)?.binding ?? null
      options = {
        kind: 'opaque',
        reason:
          b && symbols.isImport(symbols.ofBinding(b)) ? 'imported' : 'other',
      }
    } else if (node.type === 'CallExpression') {
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
    options,
    optionsUnit,
    props,
    fileGroupings,
    warnings,
    routeId: entry.routeId,
  }
}

/**
 * J2.10: the route of a listed file importing a route constructor is not
 * the one call the compiler reads: it is not split or hot-updated, and
 * under `deleteNodes` its server options stay.
 */
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
  const deleted = ctx.config.deleteNodes.map((k) => `\`${k}\``).join(', ')
  ctx.diagnostic({
    severity: 'warning',
    message: `[tanstack-router] The route of ${ctx.displayPath} is not created by a route factory call bound to its \`Route\` export, so it is not code-split or hot-updated${deleted ? `, and ${deleted} in its options are not removed, so any server code in them ships to the client` : ''}. Write it as \`export const Route = createFileRoute(path)({ … })\` (\`createRootRoute({ … })\` in the root route).`,
    range: declarator
      ? { start: declarator.start, end: declarator.end }
      : routeExport?.range,
    by: ROUTER_PLANNER,
    code: 'route-unrecognized',
  })
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
