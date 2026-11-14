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
  Unit,
} from '@tanstack/router-utils/compiler'
import type { Node } from 'yuku'

type SplitShape = 'init' | 'shorthand' | 'method'

export interface SplitDecision {
  /** The route option (`component`, `loader`, …). */
  key: string
  /** `component`, `component~loader`: the chunk's owned query value. */
  groupKey: string
  shape: SplitShape
  /**
   * The region claimed by the chunk (replaced by the lazy wrapper in the
   * route module); a method's: its function, from its parameters on.
   */
  region: Range
  /** The value node (a method's function). */
  valueNode: Node
  /** The property (`loader() {…}`, `component: …`). */
  property: Range
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
  /** The module bindings chunks import from the route module (`chunkImportsOnMain`); empty when nothing is split. */
  imported: ReadonlySet<SymbolId>
  /** The names `main` shares (`sharedNamesOnMain`), a subset of `imported`. */
  shared: ReadonlySet<SymbolId>
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

const none: ReadonlySet<SymbolId> = new Set()

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
    return {
      route,
      decisions,
      warnings,
      deleted,
      shadowing,
      imported: none,
      shared: none,
    }
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
    return {
      route,
      decisions,
      warnings,
      deleted,
      shadowing,
      imported: none,
      shared: none,
    }
  }

  /** Exported bindings named as a split option's value: not split (`main`'s one warning). */
  const exported: Array<string> = []
  let exportedAt: Range | undefined
  for (const group of groupings) {
    const groupKey = groupKeyOf(group)
    for (const key of new Set(group)) {
      if (!SPLITTABLE_KEYS.includes(key) || deleteNodes.has(key)) {
        continue
      }
      // a plain property (`key: value`, `{ key }`) or a method, split as
      // the function expression with its body would be (#8623); an
      // accessor, a spread or a computed key stays as written, as on `main`
      const option = route.props.find(
        (p) =>
          p.key === key &&
          (p.kind === 'init' || p.kind === 'shorthand' || p.kind === 'method'),
      )
      if (!option || option.value === null) {
        continue
      }
      const value = withoutParens(option.value)
      if (fallsBackToParent(value)) {
        continue
      }
      if (exportedAsOnMain(ctx, value)) {
        // the route file keeps exporting it: splitting it would only move a
        // re-export (`main` leaves it, with a warning)
        exported.push(value.name)
        exportedAt ??= { start: value.start, end: value.end }
        continue
      }
      const valueSym = identifierSymbol(ctx, value)
      if (
        !splitOnMain(ctx, value) ||
        assignsWhatItImports(ctx, value, valueSym)
      ) {
        continue
      }
      // the chunk claims and declares the bare value (so React Refresh
      // registers a function); a cast around it stays in the route module,
      // around the placeholder (`lazyFn(…) as any`)
      const inner = unwrapExpression(value)
      const own = ownThisOf(ctx, inner)
      if (own !== null) {
        warnings.push({
          severity: 'warning',
          code: 'split-this',
          by: ROUTER_PLANNER,
          message:
            own === 'this'
              ? `[tanstack-router] The \`${key}\` option of ${file} uses \`this\`, so it isn't code-split (splitting can change what \`this\` refers to). Use an arrow function or avoid \`this\` to split it.`
              : `[tanstack-router] The \`${key}\` option of ${file} uses \`super\`, so it isn't code-split (split, it would no longer be a method of the route options). Avoid \`super\` to split it.`,
          range: { start: option.prop.start, end: option.prop.end },
        })
        continue
      }
      const shorthand = option.kind === 'shorthand'
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
        shape: shorthand
          ? 'shorthand'
          : option.kind === 'method'
            ? 'method'
            : 'init',
        region,
        valueNode: value,
        property: { start: option.prop.start, end: option.prop.end },
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
      range: exportedAt,
    })
  }
  return {
    route,
    decisions,
    warnings,
    deleted,
    shadowing,
    ...(decisions.length > 0
      ? chunkImportsOnMain(ctx, route, groupings)
      : { imported: none, shared: none }),
  }
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
 * `main`'s `hasExport(ast, value)`, called by `compileCodeSplitReferenceRoute`
 * on a value that is a bare identifier only (an `as any` around it is split):
 * a top-level `export const|let|var` declares the name (patterns included),
 * `export function name`, `export default function name` or `export default
 * name`. By name, as `main` compares them; not `export { name }`, not
 * `export class`.
 */
function exportedAsOnMain(
  ctx: PlanContext,
  value: Node,
): value is Node & { name: string } {
  if (value.type !== 'Identifier') {
    return false
  }
  const { name } = value
  return ctx.t1.items.some(({ node }) => {
    if (node.type === 'ExportNamedDeclaration') {
      const d = node.declaration
      return (
        (d?.type === 'VariableDeclaration' &&
          (d.declarations as Array<Node>).some(
            (decl) =>
              decl.type === 'VariableDeclarator' &&
              patternNames(decl.id).includes(name),
          )) ||
        (d?.type === 'FunctionDeclaration' && d.id?.name === name)
      )
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      return (
        (d.type === 'Identifier' && d.name === name) ||
        (d.type === 'FunctionDeclaration' && d.id?.name === name)
      )
    }
    return false
  })
}

/** The names a binding pattern declares (`collectIdentifiersFromPattern`). */
function patternNames(id: Node): Array<string> {
  switch (id.type) {
    case 'Identifier':
      return [id.name]
    case 'ObjectPattern':
      return (id.properties as Array<Node>).flatMap((p) =>
        p.type === 'RestElement'
          ? patternNames(p.argument)
          : p.type === 'Property'
            ? patternNames(p.value)
            : [],
      )
    case 'ArrayPattern':
      return (id.elements as Array<Node | null>).flatMap((e) =>
        e === null ? [] : patternNames(e),
      )
    case 'RestElement':
      return patternNames(id.argument)
    case 'AssignmentPattern':
      return patternNames(id.left)
    default:
      return []
  }
}

/**
 * Whether `main` gives the chunk this value: the cases of
 * `compileCodeSplitVirtualRoute`'s switch on `splitNode`, which compiles
 * them; on every other case it throws (or exports a name the chunk does
 * not declare), so the option stays in the route module here, silently.
 * One place, so the policy (unsplit, or an error) can change in one edit.
 */
export function splitOnMain(ctx: PlanContext, value: Node): boolean {
  // `while (t.isIdentifier(splitNode)) splitNode = binding?.path.node`:
  // the declaration Babel binds the module-level name to (one step)
  const node = value.type === 'Identifier' ? babelBinding(ctx, value) : value
  // the cases, in `main`'s order: `t.isFunctionDeclaration` (kept under its
  // name), `t.isFunctionExpression || t.isArrowFunctionExpression`,
  // `t.isImportSpecifier || t.isImportDefaultSpecifier`,
  // `t.isVariableDeclarator` (an identifier or an object pattern),
  // `t.isCallExpression` (printed and parsed again without the JSX and
  // TypeScript syntax plugins), `t.isConditionalExpression`,
  // `t.isTSAsExpression`
  switch (node?.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ConditionalExpression':
    case 'TSAsExpression':
      return true
    case 'VariableDeclarator':
      return node.id.type === 'Identifier' || node.id.type === 'ObjectPattern'
    case 'CallExpression':
      return !containsSyntax(node, /^(JSX|TS)/)
    default:
      return false
  }
}

/**
 * Whether a function value (a function expression, a method's function)
 * uses its own `this` or `super` (#8688): splitting can change what they
 * refer to (a split chunk's lazy wrapper calls the function its own way;
 * `super` needs the options object as its home), so the option stays in
 * the route module, and route HMR does not hoist such a method out of it.
 * Its own, as the language scopes them: in its parameters and body and in
 * the arrow functions there, not in a nested non-arrow function or method,
 * a class field's initialiser or a static block (which bind their own); a
 * class's `extends`, computed keys and decorators are evaluated in the
 * enclosing function and count. `<this.Foo />` is a `this` (a JSX member
 * expression's object `JSXIdentifier`, as in Babel); `typeof this` in a type
 * is no use. An arrow function value has the module's `this` wherever it
 * is: null.
 */
export function ownThisOf(ctx: PlanContext, fn: Node): 'this' | 'super' | null {
  if (
    fn.type !== 'FunctionExpression' ||
    !/\b(?:this|super)\b/.test(ctx.analysis.source.code.slice(fn.start, fn.end))
  ) {
    return null
  }
  let found: 'this' | 'super' | null = null
  walk(fn, {
    enter: (n, wctx) => {
      if (n === fn) {
        return
      }
      const parent = wctx.parent
      if (
        n.type === 'FunctionExpression' ||
        n.type === 'FunctionDeclaration' ||
        n.type === 'StaticBlock' ||
        n.type === 'TSTypeQuery' ||
        (wctx.key === 'value' &&
          (parent?.type === 'PropertyDefinition' ||
            parent?.type === 'AccessorProperty'))
      ) {
        wctx.skip()
      } else if (
        n.type === 'ThisExpression' ||
        n.type === 'Super' ||
        (n.type === 'JSXIdentifier' &&
          n.name === 'this' &&
          wctx.key === 'object' &&
          parent?.type === 'JSXMemberExpression')
      ) {
        found = n.type === 'Super' ? 'super' : 'this'
        wctx.stop()
      }
    },
  })
  return found
}

/**
 * The node Babel's program scope binds `id`'s name to
 * (`programPath.scope.getBinding(name).path.node`), or null: the first
 * module-level declaration of the name in source order that Babel registers
 * as a binding. A function's overload signatures, `declare function`,
 * `enum` and `namespace` are none (an overloaded function is bound to its
 * implementation); types are none.
 */
function babelBinding(ctx: PlanContext, id: Node): Node | null {
  const b = ctx.analysis.file.referenceOf(id)?.binding ?? null
  const sym = b ? ctx.symbols.ofBinding(b) : null
  if (sym === null || !ctx.symbols.isModuleLevel(sym)) {
    return null
  }
  const units = (ctx.t1.declaringUnits.get(sym) ?? [])
    .map((u) => ctx.t1.units[u]!)
    .filter(
      (u) =>
        u.kind !== 'type' &&
        [
          'FunctionDeclaration',
          'ClassDeclaration',
          'VariableDeclarator',
          'ImportSpecifier',
          'ImportDefaultSpecifier',
          'ImportNamespaceSpecifier',
        ].includes(u.node.type),
    )
    .sort((a, b) => a.range.start - b.range.start)
  return units[0]?.node ?? null
}

/**
 * The module bindings a chunk imports from the route file on `main`; it
 * copies whatever else it reads (spec-main-splitting 1.6-1.8): the route
 * binding, what `export const|let|var` declares (`compileCodeSplitVirtualRoute`
 * turns those statements into imports), and the shared names
 * (`computeSharedBindings`: `main` moves them to `?tsr-shared=1`; the route
 * module holds them here, one instance either way).
 */
export function chunkImportsOnMain(
  ctx: PlanContext,
  route: RouteModuleInfo,
  groupings: CodeSplitGroupings,
): { imported: Set<SymbolId>; shared: Set<SymbolId> } {
  const shared = sharedNamesOnMain(ctx, route, groupings)
  const imported = new Set(shared)
  imported.add(route.routeSym)
  for (const unit of ctx.t1.units) {
    const item = ctx.t1.items[unit.item]!.node
    if (
      unit.kind !== 'type' &&
      item.type === 'ExportNamedDeclaration' &&
      item.declaration?.type === 'VariableDeclaration'
    ) {
      for (const s of unit.declares) {
        imported.add(s)
      }
    }
  }
  return { imported, shared }
}

/**
 * `main`'s `computeSharedBindings`: the module-level `const|let|var`,
 * function and class bindings (not imports, not the route binding) that
 * the values of route options under two or more group numbers read,
 * transitively through these declarations (an option in no group is group
 * -1, kept or deleted alike); a destructuring declarator whose names are
 * read under two or more group numbers between them, or one of whose names
 * is shared, has all its names shared; a name whose declaration reads the
 * route binding, transitively, is not.
 */
function sharedNamesOnMain(
  ctx: PlanContext,
  route: RouteModuleInfo,
  groupings: CodeSplitGroupings,
): Set<SymbolId> {
  const { t1 } = ctx
  const shared = new Set<SymbolId>()
  // `collectLocalBindingsFromStatement`, `localModuleLevelBindings.delete('Route')`
  const declarators = new Map<SymbolId, Array<Unit>>()
  for (const unit of t1.units) {
    if (
      unit.kind !== 'type' &&
      (unit.node.type === 'VariableDeclarator' ||
        unit.node.type === 'FunctionDeclaration' ||
        unit.node.type === 'ClassDeclaration')
    ) {
      for (const s of unit.declares) {
        if (s !== route.routeSym) {
          declarators.set(s, [...(declarators.get(s) ?? []), unit])
        }
      }
    }
  }
  if (declarators.size === 0) {
    return shared
  }
  // plain properties (`t.isObjectProperty`) and methods (read as the
  // function expression they split as, #8623), `codeSplitGroupings` skipped
  const props = route.props.filter(
    (p) =>
      (p.kind === 'init' || p.kind === 'shorthand' || p.kind === 'method') &&
      p.key !== null &&
      p.key !== 'codeSplitGroupings' &&
      p.value !== null,
  )
  const groupOf = (key: string) =>
    groupings.findIndex((group) => (group as Array<string>).includes(key))
  {
    const splitGroups = new Set<number>()
    let nonSplit = false
    for (const p of props) {
      const v = p.value!
      if (v.type === 'Identifier' && v.name === 'undefined') {
        continue
      }
      const g = groupOf(p.key!)
      if (g === -1) {
        nonSplit = true
      } else {
        splitGroups.add(g)
      }
    }
    if (!nonSplit && splitGroups.size < 2) {
      return shared
    }
  }
  /**
   * The names `main` collects in a range (`collectModuleLevelRefsFromNode`,
   * Babel's `t.isReferenced`): an assignment's target (`x = …`, `x += …`,
   * `[x] = …`) is none; an update (`x++`) and a member write's object are.
   */
  const { file } = ctx.analysis
  const namesIn = (range: Range): Array<SymbolId> =>
    t1.refs
      .refsIn(range)
      .filter(
        (r) =>
          r.kind !== 'write' ||
          file.parentOf(file.nodeAt(r.range.start)!)?.type ===
            'UpdateExpression',
      )
      .map((r) => r.sym)
  /** `buildDependencyGraph`: what each declaration reads (with the route binding: `fullDepGraph`). */
  const readsOf = (s: SymbolId): Array<SymbolId> =>
    (declarators.get(s) ?? []).flatMap((u) =>
      namesIn(u.range).filter(
        (r) => r !== s && (declarators.has(r) || r === route.routeSym),
      ),
    )
  const closure = (from: Iterable<SymbolId>): Set<SymbolId> => {
    const seen = new Set<SymbolId>()
    const work = [...from]
    while (work.length > 0) {
      const s = work.pop()!
      if (!seen.has(s)) {
        seen.add(s)
        work.push(...readsOf(s))
      }
    }
    return seen
  }
  const groupsOf = new Map<SymbolId, Set<number>>()
  for (const p of props) {
    const g = groupOf(p.key!)
    const direct = namesIn({ start: p.value!.start, end: p.value!.end }).filter(
      (s) => declarators.has(s),
    )
    for (const s of closure(direct)) {
      if (declarators.has(s)) {
        groupsOf.set(s, (groupsOf.get(s) ?? new Set()).add(g))
      }
    }
  }
  for (const [s, groups] of groupsOf) {
    if (groups.size >= 2) {
      shared.add(s)
    }
  }
  // `expandSharedDestructuredDeclarators`, `expandDestructuredDeclarations`
  for (const unit of t1.units) {
    if (
      unit.node.type !== 'VariableDeclarator' ||
      unit.node.id.type === 'Identifier'
    ) {
      continue
    }
    const groups = new Set(
      unit.declares.flatMap((s) => [...(groupsOf.get(s) ?? [])]),
    )
    if (groups.size >= 2 || unit.declares.some((s) => shared.has(s))) {
      for (const s of unit.declares) {
        shared.add(s)
      }
    }
  }
  // `removeBindingsTransitivelyDependingOn(shared, fullDepGraph, ['Route'])`
  for (const s of [...shared]) {
    if (closure(readsOf(s)).has(route.routeSym)) {
      shared.delete(s)
    }
  }
  return shared
}

/**
 * Whether the core found that the chunk taking this value would assign a
 * binding it imports from another module of the file (a fallback of the
 * previous round at the value, or at the declaration of the binding it
 * names: a shared `let`, an `export let`, where `main`'s build fails): the
 * option stays in the route module, as the values `splitOnMain` refuses do.
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
