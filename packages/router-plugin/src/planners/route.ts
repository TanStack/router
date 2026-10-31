/**
 * Route recognition and option resolution of the router planner: the
 * binding exported as `Route`, its factory call (recognised by the callee's
 * import binding, never by spelling: G15), the options object (inline, in a
 * module-level constant, through TypeScript wrappers) and every property of
 * it with its kind and source ranges. Computed once per planning round.
 */
import {
  isExpressionWrapper,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
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
import type { CodeSplitGroupings } from '../core/constants'
import type { RouterPlannerConfig } from './config'

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
export const ROUTER_PACKAGE_RE = /^@tanstack\/(react|solid|vue)-router(\/|$)/

/**
 * The router's exports whose call is pure when its arguments are, per
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
  /** The source text of the key as written (`component`, `'component'`). */
  keyText: string
}

export type OptionsResolution =
  | { kind: 'object'; node: Node }
  | { kind: 'opaque'; reason: 'imported' | 'call' | 'other' }
  /** `createRootRoute()`: no options to split or remove */
  | { kind: 'none' }

export interface RouteModuleInfo {
  kind: RouteKind
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
  | { route: null; warnings: Array<Diagnostic> }

/** The router planner's phase A result: the route registry entry. */
export interface RouteEntryFacts {
  routeId: string
}

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

/** The mutation model as the env output sees it (a write inside code the environment erases imposes nothing). */
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
 * package. `entry` is the file's route registry entry (its route id).
 */
export function recognizeRoute(
  ctx: PlanContext,
  entry: RouteEntryFacts | null,
): RouteRecognition {
  const { analysis, t1, symbols, identity } = ctx
  const file = analysis.file
  const warnings: Array<Diagnostic> = []
  const exp = analysis.exports.find(
    (e) => e.kind === 'local' && e.name === 'Route' && !e.typeOnly,
  )
  if (!exp || exp.kind !== 'local' || exp.local === null) {
    return { route: null, warnings }
  }
  const routeSym = exp.local
  const unitIds = t1.declaringUnits.get(routeSym)
  const routeUnit =
    unitIds && unitIds.length === 1 ? t1.units[unitIds[0]!] : undefined
  const warn = (message: string, range?: Range, code?: string) => {
    warnings.push({
      severity: 'warning',
      message,
      range,
      by: ROUTER_PLANNER,
      code,
    })
  }
  const fileName = identity.path
  if (
    !routeUnit ||
    routeUnit.kind !== 'declaration' ||
    routeUnit.node.type !== 'VariableDeclarator' ||
    routeUnit.node.init === null
  ) {
    return { route: null, warnings }
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
    return { route: null, warnings }
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
    const foreign = foreignFactory(analysis, factoryNode)
    if (foreign) {
      warnings.push(
        foreignFactoryDiagnostic(
          ctx.config as RouterPlannerConfig,
          fileName,
          foreign,
          { start: factoryNode.start, end: factoryNode.end },
        ),
      )
    } else if (importsFactory(analysis)) {
      warn(
        `[tanstack-router] The route of "${fileName}" is not created by a route factory call bound to its \`Route\` export, so it is not code-split or hot-updated.`,
        { start: routeUnit.node.start, end: routeUnit.node.end },
        'route-unrecognized',
      )
    }
    return { route: null, warnings }
  }
  const needsCurry =
    factory.name === 'createFileRoute' ||
    factory.name === 'createRootRouteWithContext' ||
    factory.name === 'createLazyFileRoute'
  if (needsCurry !== curried) {
    return { route: null, warnings }
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
      options = { kind: 'object', node: arg }
    } else if (arg.type === 'Identifier') {
      const b = file.referenceOf(arg)?.binding ?? null
      const sym = b ? symbols.ofBinding(b) : null
      const decl = sym !== null ? declaratorOf(ctx, sym) : null
      const init = decl ? unwrapExpression(decl.init) : null
      if (decl && init && init.type === 'ObjectExpression') {
        options = { kind: 'object', node: init }
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
  return {
    route: {
      kind,
      routerPackage: factory.specifier,
      routeSym,
      routeUnit,
      optionsCall: outer,
      options,
      optionsUnit,
      props,
      fileGroupings,
      warnings,
      routeId: entry?.routeId ?? null,
    },
    warnings,
  }
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
    message: `[tanstack-router] The route of "${fileName}" calls \`${foreign.name}\` imported from "${foreign.specifier}", not from ${pkg}, so it is not code-split or hot-updated${deleted ? ` and the options ${deleted} cannot be removed from this build` : ''}: only the router's own \`${foreign.name}\` is recognised. Import it from the router: \`import { ${foreign.name} } from '${pkg}'\`.`,
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
  own: Node | null,
): Array<Diagnostic> {
  if (cfg.deleteNodes.length === 0) {
    return []
  }
  const file = ctx.analysis.file
  const out: Array<Diagnostic> = []
  /** The call `node` is the callee of, through wrappers. */
  const called = (node: Node): Node | null => {
    let outer = node
    let p = file.parentOf(outer)
    while (p && isExpressionWrapper(p)) {
      outer = p
      p = file.parentOf(outer)
    }
    return p?.type === 'CallExpression' && p.callee === outer ? p : null
  }
  const judge = (call: Node | null) => {
    if (call?.type !== 'CallExpression' || call === own) {
      return
    }
    const options = call.arguments[0] && unwrapExpression(call.arguments[0])
    const deleted =
      options?.type === 'ObjectExpression'
        ? options.properties.flatMap((prop) => {
            const key = propertyKeyName(prop)
            return key !== null && cfg.deleteNodes.includes(key) ? [key] : []
          })
        : []
    if (deleted.length > 0) {
      out.push({
        severity: 'error',
        code: 'route-unowned-options',
        by: ROUTER_PLANNER,
        message: `[tanstack-router] "${ctx.identity.path}" holds \`${deleted.join('`, `')}\` in a route factory call that is not the one bound to its \`Route\` export, so they cannot be removed from this build. The generator takes one \`Route\` export per file: make this call that export, or move it to its own route file.`,
        range: { start: call.start, end: call.end },
      })
    }
  }
  /** The calls of a factory read at `node`: `factory(path)(options)`, `factory(options)`, a stored `factory(path)`. */
  const judgeCalls = (node: Node) => {
    const first = called(node)
    const second = first && called(first)
    judge(second ?? first)
    const p = first && file.parentOf(first)
    if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') {
      for (const ref of file.bindingOf(p.id)?.references ?? []) {
        judge(called(ref.node))
      }
    }
  }
  for (const imp of ctx.analysis.imports) {
    if (!ROUTER_PACKAGE_RE.test(imp.specifier)) {
      continue
    }
    for (const spec of imp.specifiers) {
      const named = FACTORIES.has(spec.imported)
      if (spec.local < 0 || !(named || spec.imported === '*')) {
        continue
      }
      for (const ref of file.bindings[spec.local]?.references ?? []) {
        const member = named ? ref.node : file.parentOf(ref.node)
        if (
          named ||
          (member?.type === 'MemberExpression' &&
            member.property.type === 'Identifier' &&
            FACTORIES.has(member.property.name))
        ) {
          judgeCalls(member!)
        }
      }
    }
  }
  return out
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

/** The route-registry dependency fingerprint of a file: its route id (the entry's only fact). */
export function routeEntryDigest(entry: RouteEntryFacts | null): string | null {
  return entry ? entry.routeId : null
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
