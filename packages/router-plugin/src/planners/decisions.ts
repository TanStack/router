/**
 * Split decisions of a route module for one planning round, as `main` makes
 * them: which options move to which chunk (spec-main-splitting 1.4), and
 * which `deleteNodes` erases. The router planner computes them once per round: its
 * split part applies them, its HMR part hoists only what stays.
 */
import { unwrapExpression, walk } from '@tanstack/router-utils/compiler'
import { propertyKeyName } from '@tanstack/router-generator'
import { groupingsProblem } from '../core/config'
import { splitRouteIdentNodes } from '../core/constants'
import { ROUTER_PLANNER } from './config'
import { boundValueOf, chainSoleUse, identifierSymbol } from './route'
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

type SplitShape = 'init' | 'shorthand'

export interface SplitDecision {
  /** The route option (`component`, `loader`, …). */
  key: string
  /** `component`, `component~loader`: the chunk's owned query value. */
  groupKey: string
  shape: SplitShape
  /** The region claimed by the chunk (replaced by the lazy wrapper in the route module). */
  region: Range
  /** The value node. */
  valueNode: Node
  /** The key as written, for whole-property placeholders (`component: …`). */
  keyText: string
  /** Whether the placeholder replaces the whole property (shorthand). */
  wholeProperty: boolean
  /** The module binding a shorthand denotes. */
  shorthandSym: SymbolId | null
  /** The chunk's export: the option's name. */
  exportName: string
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

/** The options the router planner splits: the components and the loader, values the router calls later. */
export const SPLITTABLE_KEYS: ReadonlyArray<string> = splitRouteIdentNodes

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
              : route.options.reason === 'shared'
                ? 'also used outside the route call'
                : route.options.reason === 'reassigned'
                  ? 'in a variable that is reassigned'
                  : 'not an object literal'
      const call =
        route.kind === 'root' ? 'createRootRoute' : 'createFileRoute(path)'
      const fix =
        route.options.reason === 'reassigned'
          ? `Declare them with \`const\` and never reassign them (\`const options = { component${deleteNodes.size > 0 ? ', server' : ', …'} }\`).`
          : route.options.reason === 'shared'
            ? `Write them as an object literal in the call (\`${call}({ component${deleteNodes.size > 0 ? ', server' : ', …'} })\`), or use their object nowhere else.`
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

  /** Exported bindings named as a split option's value: not split (`main`'s one warning). */
  const exported: Array<string> = []
  for (const group of groupings) {
    const groupKey = groupKeyOf(group)
    for (const key of new Set(group)) {
      if (!SPLITTABLE_KEYS.includes(key) || deleteNodes.has(key)) {
        continue
      }
      // a plain property (`key: value`, `{ key }`): a method, an accessor, a
      // spread or a computed key stays as written, as on `main`
      const option = route.props.find(
        (p) => p.key === key && (p.kind === 'init' || p.kind === 'shorthand'),
      )
      if (!option || option.value === null) {
        continue
      }
      const value = withoutParens(option.value)
      if (fallsBackToParent(value)) {
        continue
      }
      const valueSym = identifierSymbol(ctx, value)
      if (valueSym !== null && exportedAsOnMain(ctx, valueSym)) {
        // the route file keeps exporting it: splitting it would only move a
        // re-export (`main` leaves it, with a warning)
        exported.push(ctx.symbols.name(valueSym))
        continue
      }
      if (
        unsplittableOnMain(ctx, value) !== null ||
        assignsWhatItImports(ctx, value, valueSym)
      ) {
        continue
      }
      const shorthand = option.kind === 'shorthand'
      // the chunk claims and declares the bare value (so React Refresh
      // registers a function); a cast around it stays in the route module,
      // around the placeholder (`lazyFn(…) as any`)
      const inner = unwrapExpression(value)
      const region = shorthand
        ? { start: option.prop.start, end: option.prop.end }
        : { start: inner.start, end: inner.end }
      // another planner already puts something at exactly this text's place
      // in the route module (Start hoists a server fn written in place): the
      // chunk cannot take it as well, and the option keeps working there
      const claimed = ctx.rewrites.view('env').placeholderAt(region)
      if (claimed) {
        warnings.push({
          severity: 'warning',
          code: 'split-claimed',
          by: ROUTER_PLANNER,
          message: `[tanstack-router] The \`${key}\` option of ${file} is not code-split: its value is ${('owner' in claimed ? claimed.subject : undefined) ?? 'moved elsewhere by the compiler'}, so it cannot move into a chunk as well. Declare it as a module-level \`const\` before the route and pass it by name: \`${option.keyText}: ${key}Fn\`.`,
          range: region,
        })
        continue
      }
      decisions.push({
        key,
        groupKey,
        shape: shorthand ? 'shorthand' : 'init',
        region,
        valueNode: value,
        keyText: option.keyText,
        wholeProperty: shorthand,
        shorthandSym: shorthand ? valueSym : null,
        exportName: key,
      })
    }
  }
  if (exported.length > 0) {
    // `main`'s message
    warnings.push({
      severity: 'warning',
      code: 'exported-not-split',
      by: ROUTER_PLANNER,
      message: [
        `[tanstack-router] These exports from "${file}" will not be code-split and will increase your bundle size:`,
        ...exported.map((name) => `- ${name}`),
        'For the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
      ].join('\n'),
    })
  }
  return { route, decisions, warnings, deleted, shadowing }
}

/** The value inside its parentheses (Babel, which `main` parses with, keeps none). */
function withoutParens(value: Node): Node {
  let v = value
  while (v.type === 'ParenthesizedExpression') {
    v = v.expression
  }
  return v
}

/** `true`, `false`, `null` or `undefined` as written: the parent's option applies. */
function fallsBackToParent(value: Node): boolean {
  if (value.type === 'Identifier') {
    return value.name === 'undefined'
  }
  return (
    value.type === 'Literal' &&
    (value.value === null || typeof value.value === 'boolean')
  )
}

/**
 * `main`'s `hasExport`: the binding is exported by `export const|let|var`,
 * `export function`, `export default function` or `export default <name>`
 * (not by `export { name }` or `export class`).
 */
function exportedAsOnMain(ctx: PlanContext, sym: SymbolId): boolean {
  const { t1 } = ctx
  for (const u of t1.declaringUnits.get(sym) ?? []) {
    const node = t1.items[t1.units[u]!.item]!.node
    if (
      (node.type === 'ExportNamedDeclaration' &&
        (node.declaration?.type === 'VariableDeclaration' ||
          node.declaration?.type === 'FunctionDeclaration')) ||
      (node.type === 'ExportDefaultDeclaration' &&
        node.declaration.type === 'FunctionDeclaration')
    ) {
      return true
    }
  }
  return t1.items.some(
    (item) =>
      item.node.type === 'ExportDefaultDeclaration' &&
      item.node.declaration.type === 'Identifier' &&
      ctx.analysis.file.referenceOf(item.node.declaration)?.binding ===
        ctx.symbols.binding(sym),
  )
}

/**
 * The option values `main` cannot compile into a chunk (its compile throws,
 * or the chunk exports a name it does not declare), which stay in the route
 * module here, silently: the shapes of `main`'s `compileCodeSplitVirtualRoute`.
 * A value naming a module binding is judged by the binding's declaration
 * (followed once, as `main` does); otherwise by the expression. One place,
 * so the policy (unsplit, or an error) can change in one edit.
 */
export function unsplittableOnMain(
  ctx: PlanContext,
  value: Node,
): string | null {
  if (value.type === 'Identifier') {
    const b = ctx.analysis.file.referenceOf(value)?.binding ?? null
    const sym = b ? ctx.symbols.ofBinding(b) : null
    if (sym === null || !ctx.symbols.isModuleLevel(sym)) {
      return 'unbound'
    }
    // (a type merged with it, `declare namespace Page { type Props }`, is
    // TypeScript's: the value's declaration decides)
    const declaring = (ctx.t1.declaringUnits.get(sym) ?? [])
      .map((u) => ctx.t1.units[u]!)
      .filter((u) => u.kind !== 'type')
    const unit = declaring.length === 1 ? declaring[0] : null
    switch (unit?.node.type) {
      case 'FunctionDeclaration':
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
        return null
      case 'VariableDeclarator':
        return unit.node.id.type === 'ArrayPattern' ? 'array-pattern' : null
      default:
        return unit?.node.type ?? 'unbound'
    }
  }
  switch (value.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ConditionalExpression':
    case 'TSAsExpression':
      return null
    case 'CallExpression':
      // `main` prints the call and parses it again without JSX or TypeScript
      return containsSyntax(value, /^(JSX|TS)/) ? 'call-syntax' : null
    default:
      return value.type
  }
}

/**
 * Whether the core found that the chunk taking this value would assign a
 * binding it imports from another module of the file (a fallback of the
 * previous round at the value, or at the declaration of the binding it
 * names): the option stays in the route module, as the shapes of
 * `unsplittableOnMain` do.
 */
function assignsWhatItImports(
  ctx: PlanContext,
  value: Node,
  valueSym: SymbolId | null,
): boolean {
  const inner = unwrapExpression(value)
  if (ctx.fallbackAt({ start: inner.start, end: inner.end }) !== undefined) {
    return true
  }
  const { t1 } = ctx
  return (
    valueSym !== null &&
    (t1.declaringUnits.get(valueSym) ?? []).some(
      (u) => ctx.fallbackAt(t1.units[u]!.range) !== undefined,
    )
  )
}

function containsSyntax(node: Node, type: RegExp): boolean {
  let found = false
  walk(node, {
    enter: (n, wctx) => {
      if (type.test(n.type)) {
        found = true
        wctx.stop()
      }
    },
  })
  return found
}
