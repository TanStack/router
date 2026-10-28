/**
 * Route recognition and option resolution shared by the `route-split` and
 * `route-hmr` planners: the
 * binding exported as `Route`, its factory call (recognised by the callee's
 * import binding, never by spelling: G15), the options object (inline, in a
 * module-level constant, through TypeScript wrappers) and every property of
 * it with its kind and source ranges. Computed once per planning round and
 * shared by both planners through a memo keyed by the round's rewrite set.
 */
import { digestOf, unwrapExpression } from '@tanstack/router-utils/compiler'
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
import type { CodeSplitGroupings } from '../core/constants'

export type RouteKind = 'file' | 'root' | 'lazy'

export type RouteFactory =
  | 'createFileRoute'
  | 'createRootRoute'
  | 'createRootRouteWithContext'
  | 'createLazyFileRoute'

const FACTORIES: ReadonlySet<string> = new Set<RouteFactory>([
  'createFileRoute',
  'createRootRoute',
  'createRootRouteWithContext',
  'createLazyFileRoute',
])

/** Packages whose `createFileRoute` & co. are the router's. */
export const ROUTER_PACKAGE_RE =
  /^@tanstack\/(react|solid|vue)-(router|start)(\/|$)/

/**
 * The router's exports whose call is pure when its arguments are (R79), per
 * framework package: each was read in every framework and constructs and
 * returns a value (an identity, a closure, a `RouteApi`, a component), reads
 * no global or module state, registers nothing and never throws. The core
 * recognises them by import binding from these packages (renamed, or a
 * namespace member; app re-exports are not followed:
 * `RecognizerTable.pureCalls`). Not pure: `redirect` and `notFound` (they
 * mutate their argument and throw when asked to), `createSerializationAdapter`
 * (throws on an invalid key in development), `createRouter`; the route
 * factories are recognised as route units (their routes are the route tree's).
 */
const PURE_EXPORTS = [
  'getRouteApi',
  'linkOptions',
  'createLink',
  'createRouteMask',
  'lazyRouteComponent',
  'lazyFn',
  'retainSearchParams',
  'stripSearchParams',
  'parseSearchWith',
  'stringifySearchWith',
]

let pureCalls: Record<string, ReadonlySet<string>> | null = null

/** `RecognizerTable.pureCalls` of the router packages (one table for every host). */
export function routerPureCalls(): Record<string, ReadonlySet<string>> {
  pureCalls ??= {
    '@tanstack/react-router': new Set([...PURE_EXPORTS, 'createRouterConfig']),
    '@tanstack/solid-router': new Set(PURE_EXPORTS),
    '@tanstack/vue-router': new Set([...PURE_EXPORTS, 'createRouterConfig']),
  }
  return pureCalls
}

export type OptionKind =
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
  /** The property including its separating comma (for deletion). */
  propertyRange: Range
  /** The source text of the key as written (`component`, `'component'`). */
  keyText: string
}

export type OptionsResolution =
  | { kind: 'object'; node: Node; unit: Unit }
  | { kind: 'opaque'; reason: 'imported' | 'call' | 'other' }
  /** `createRootRoute()`: no options to split or remove */
  | { kind: 'none' }

export interface RouteModuleInfo {
  kind: RouteKind
  factory: RouteFactory
  /** The router package the factory was imported from. */
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
  /** The id of the route in the current tree (from the generator). */
  routeId: string | null
}

export type RouteRecognition =
  | { route: RouteModuleInfo; warnings: Array<Diagnostic> }
  | {
      route: null
      reason: 'no-route-export' | 'unrecognized'
      warnings: Array<Diagnostic>
    }

/** Phase A result of both router planners: the route registry entry. */
export interface RouteEntryFacts {
  routeId: string
}

const infoMemo = new WeakMap<object, RouteRecognition>()

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

/** The range of a property including its separating comma, so deleting it leaves a well-formed object. */
export function propertyRangeWithComma(
  options: Node,
  prop: Node,
  code?: string,
): Range {
  if (options.type !== 'ObjectExpression') {
    return { start: prop.start, end: prop.end }
  }
  const props = options.properties as Array<Node>
  const idx = props.indexOf(prop)
  const next = props[idx + 1]
  if (next) {
    return { start: prop.start, end: next.start }
  }
  const prev = props[idx - 1]
  if (prev) {
    return { start: prev.end, end: prop.end }
  }
  // the only property: its trailing comma goes with it (`{ server: {…}, }`
  // erased to `{ , }` is a syntax error)
  let end = prop.end
  if (code !== undefined) {
    let i = end
    while (i < options.end && /\s/.test(code[i]!)) {
      i++
    }
    if (code[i] === ',') {
      end = i + 1
    }
  }
  return { start: prop.start, end }
}

function describeOptions(ctx: PlanContext, options: Node): Array<RouteOption> {
  const code = ctx.analysis.source.code
  const out: Array<RouteOption> = []
  if (options.type !== 'ObjectExpression') {
    return out
  }
  for (const prop of options.properties as Array<Node>) {
    const propertyRange = propertyRangeWithComma(options, prop, code)
    if (prop.type === 'SpreadElement') {
      out.push({
        key: null,
        kind: 'spread',
        prop,
        value: prop.argument,
        propertyRange,
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
    out.push({ key, kind, prop, value: prop.value, propertyRange, keyText })
  }
  return out
}

/** The module-level declaration unit of a symbol, when it is a plain declarator with an initialiser. */
export function declaratorOf(
  ctx: PlanContext,
  sym: SymbolId,
): { unit: Unit; init: Node } | null {
  const { t1, symbols } = ctx
  if (!symbols.isModuleLevel(sym) || symbols.isImport(sym)) {
    return null
  }
  const units = t1.declaringUnits.get(sym)
  if (!units || units.length !== 1) {
    return null
  }
  const unit = t1.units[units[0]!]!
  if (
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

/** R1: the mutation model as the env output sees it (a write inside code the environment erases imposes nothing). */
export function liveInEnv(ctx: PlanContext): (ref: ClassifiedRef) => boolean {
  return ctx.liveness('env').live
}

function readGroupings(
  ctx: PlanContext,
  value: Node,
  fail: (message: string) => never,
): CodeSplitGroupings {
  let node = unwrapExpression(value)
  if (node.type === 'Identifier') {
    const b = ctx.analysis.file.referenceOf(node)?.binding ?? null
    const decl = b ? declaratorOf(ctx, ctx.symbols.ofBinding(b)) : null
    if (!decl) {
      return fail(
        'You must provide an array of arrays for the codeSplitGroupings.',
      )
    }
    node = unwrapExpression(decl.init)
  }
  if (node.type !== 'ArrayExpression') {
    return fail(
      'You must provide an array of arrays for the codeSplitGroupings.',
    )
  }
  return node.elements.map((group) => {
    if (!group || group.type !== 'ArrayExpression') {
      return fail('You must provide arrays with codeSplitGroupings options.')
    }
    return group.elements.map((item) => {
      const el = item ? unwrapExpression(item) : null
      if (!el || el.type !== 'Literal' || typeof el.value !== 'string') {
        return fail(
          'You must provide a string literal for the codeSplitGroupings',
        )
      }
      return el.value
    }) as CodeSplitGroupings[number]
  })
}

/**
 * Recognises the route of a module: the call bound to the binding exported
 * as `Route` whose callee is an import of a route factory from a router
 * package. Memoised per planning round.
 */
export function recognizeRoute(ctx: PlanContext): RouteRecognition {
  const hit = infoMemo.get(ctx.rewrites)
  if (hit) {
    return hit
  }
  const r = recognize(ctx)
  infoMemo.set(ctx.rewrites, r)
  return r
}

function recognize(ctx: PlanContext): RouteRecognition {
  const { analysis, t1, symbols, identity } = ctx
  const file = analysis.file
  const warnings: Array<Diagnostic> = []
  const exp = analysis.exports.find(
    (e) => e.kind === 'local' && e.name === 'Route' && !e.typeOnly,
  )
  if (!exp || exp.kind !== 'local' || exp.local === null) {
    return { route: null, reason: 'no-route-export', warnings }
  }
  const routeSym = exp.local
  const unitIds = t1.declaringUnits.get(routeSym)
  const routeUnit =
    unitIds && unitIds.length === 1 ? t1.units[unitIds[0]!] : undefined
  const warn = (message: string, range?: Range, code?: string) => {
    warnings.push({ severity: 'warning', message, range, by: 'route', code })
  }
  const fileName = identity.path
  if (
    !routeUnit ||
    routeUnit.kind !== 'declaration' ||
    routeUnit.node.type !== 'VariableDeclarator' ||
    routeUnit.node.init === null
  ) {
    return { route: null, reason: 'unrecognized', warnings }
  }
  const outer = unwrapExpression(routeUnit.node.init)
  if (outer.type !== 'CallExpression') {
    if (importsFactory(analysis)) {
      warn(
        `[tanstack-router] The route of "${fileName}" is not created by a route factory call bound to its \`Route\` export, so it is not code-split or hot-updated.`,
        { start: routeUnit.node.start, end: routeUnit.node.end },
        'route-unrecognized',
      )
    }
    return { route: null, reason: 'unrecognized', warnings }
  }
  const callee = unwrapExpression(outer.callee)
  let factoryNode: Node
  let curried: boolean
  if (callee.type === 'CallExpression') {
    factoryNode = unwrapExpression(callee.callee)
    curried = true
  } else {
    factoryNode = callee
    curried = false
  }
  const factory = resolveFactory(analysis, factoryNode, symbols)
  if (!factory) {
    if (importsFactory(analysis)) {
      warn(
        `[tanstack-router] The route of "${fileName}" is not created by a route factory call bound to its \`Route\` export, so it is not code-split or hot-updated.`,
        { start: routeUnit.node.start, end: routeUnit.node.end },
        'route-unrecognized',
      )
    }
    return { route: null, reason: 'unrecognized', warnings }
  }
  const needsCurry =
    factory.name === 'createFileRoute' ||
    factory.name === 'createRootRouteWithContext' ||
    factory.name === 'createLazyFileRoute'
  if (needsCurry !== curried) {
    return { route: null, reason: 'unrecognized', warnings }
  }
  const kind: RouteKind =
    factory.name === 'createLazyFileRoute'
      ? 'lazy'
      : factory.name === 'createFileRoute'
        ? 'file'
        : 'root'
  // J2.11: a second factory call in the module
  const calls = t1.refs
    .refsOf(factory.sym)
    .filter((r) => r.ctx === 'callee' && r.kind === 'value')
  if (calls.length > 1) {
    const other = calls.find((c) => c.range.start !== factoryNode.start)
    warn(
      `[tanstack-router] "${fileName}" calls ${factory.name} more than once; only the call bound to its \`Route\` export is code-split and hot-updated.`,
      other?.range,
      'route-several-calls',
    )
  }
  const argument = outer.arguments[0]
  let options: OptionsResolution
  let optionsUnit: Unit = routeUnit
  if (!argument) {
    options = { kind: 'none' }
  } else {
    const arg = unwrapExpression(argument)
    if (arg.type === 'ObjectExpression') {
      options = { kind: 'object', node: arg, unit: routeUnit }
    } else if (arg.type === 'Identifier') {
      const b = file.referenceOf(arg)?.binding ?? null
      const sym = b ? symbols.ofBinding(b) : null
      const decl = sym !== null ? declaratorOf(ctx, sym) : null
      const init = decl ? unwrapExpression(decl.init) : null
      if (decl && init && init.type === 'ObjectExpression') {
        options = { kind: 'object', node: init, unit: decl.unit }
        optionsUnit = decl.unit
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
    fileGroupings = readGroupings(ctx, groupingsProp.value, (message) => {
      throw new Error(
        `The groupings for the route "${fileName}" are invalid.\n${message}`,
      )
    })
  }
  const prefetched =
    (ctx.prefetched.get('route-split') as RouteEntryFacts | undefined) ??
    (ctx.prefetched.get('route-hmr') as RouteEntryFacts | undefined)
  return {
    route: {
      kind,
      factory: factory.name,
      routerPackage: factory.specifier,
      routeSym,
      routeUnit,
      optionsCall: outer,
      options,
      optionsUnit,
      props,
      fileGroupings,
      warnings,
      routeId: prefetched?.routeId ?? null,
    },
    warnings,
  }
}

function importsFactory(analysis: ModuleAnalysis): boolean {
  return analysis.imports.some(
    (i) =>
      ROUTER_PACKAGE_RE.test(i.specifier) &&
      (i.specifiers.some((s) => FACTORIES.has(s.imported)) ||
        i.specifiers.some((s) => s.imported === '*')),
  )
}

/** The factory an identifier or namespace member denotes, by import binding (G15). */
function resolveFactory(
  analysis: ModuleAnalysis,
  node: Node,
  symbols: PlanContext['symbols'],
): { name: RouteFactory; sym: SymbolId; specifier: string } | null {
  const file = analysis.file
  if (node.type === 'Identifier') {
    const b = file.referenceOf(node)?.binding ?? null
    const imp = b?.import ?? null
    if (!b || !imp || imp.kind !== 'named' || imp.name === null) {
      return null
    }
    if (!FACTORIES.has(imp.name) || !ROUTER_PACKAGE_RE.test(imp.specifier)) {
      return null
    }
    return {
      name: imp.name as RouteFactory,
      sym: symbols.ofBinding(b),
      specifier: imp.specifier,
    }
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    const obj = unwrapExpression(node.object as Node)
    const prop = node.property
    if (obj.type !== 'Identifier' || prop.type !== 'Identifier') {
      return null
    }
    const b = file.referenceOf(obj)?.binding ?? null
    const imp = b?.import ?? null
    if (!b || !imp || imp.kind !== 'namespace') {
      return null
    }
    if (!FACTORIES.has(prop.name) || !ROUTER_PACKAGE_RE.test(imp.specifier)) {
      return null
    }
    return {
      name: prop.name as RouteFactory,
      sym: symbols.ofBinding(b),
      specifier: imp.specifier,
    }
  }
  return null
}

/** The router's id of a registry entry (`/__root` is `__root__` on the router). */
export function routerRouteId(routeId: string): string {
  return routeId === '/__root' ? '__root__' : routeId
}

/** Digest of a registry entry, for the route-registry dependency fingerprint. */
export function routeEntryDigest(entry: RouteEntryFacts | null): string | null {
  return entry ? digestOf({ routeId: entry.routeId }) : null
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
export function isAlreadyLazy(ctx: PlanContext, value: Node): boolean {
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
    ROUTER_PACKAGE_RE.test(imp.specifier)
  )
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
