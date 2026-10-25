/**
 * The `<Hydrate>` deferred-hydration planner (J5; DESIGN §3.11, §3.17; R9,
 * R10, R14, R37, R38, R39) on the shared compiler core.
 *
 * A boundary is a JSX element whose tag is the `Hydrate` import of a Start
 * package, by binding (a named or renamed import, or `<NS.Hydrate>` on a
 * namespace import). Its id is computed from the pristine source (the base36
 * offset of its `<` and a hash of the root-relative path), so every env and
 * every output of one build agree whatever other planners erase (R10).
 *
 * - Every env inserts ` h="<id>"` into the opening tag of each boundary the
 *   client extracts (anything but a literal `split={false}` with children to
 *   extract), so the server's and the client's hydration ids match.
 * - Server envs strip a statically visible `fallback` (an erased region:
 *   the core removes what only the fallback read).
 * - The client env claims the children for a fixed-home generated unit, the
 *   chunk component of `<file>?tss-hydrate=<id>`; the original occurrence
 *   renders `<TsrHydrate<n> a={a}/>` and a `/* @__PURE__ *\/` lazy const,
 *   placed by needers, loads the chunk. Captures are computed innermost
 *   first and include the reads of nested placeholders, so a Solid chunk
 *   forwards them through its substitution environment.
 */
import { hash } from 'node:crypto'
import { relative } from 'node:path'
import {
  cleanOrphanedDeclarations,
  isPureExpression,
  siblingSpecifier,
} from '@tanstack/router-utils/compiler'
import type {
  ClassifiedRef,
  Diagnostic,
  Frag,
  GateContext,
  ModuleAnalysis,
  OutputId,
  PlanContext,
  Planner,
  Range,
  RefTarget,
  SymRef,
  SymbolId,
  Tier1,
} from '@tanstack/router-utils/compiler'

type Node = NonNullable<ReturnType<Tier1['nodeAt']>>
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>
type JSXElement = NodeOf<'JSXElement'>
type JSXOpeningElement = NodeOf<'JSXOpeningElement'>
type ObjectExpression = NodeOf<'ObjectExpression'>

export type HydrateFramework = 'react' | 'solid'

export interface HydratePlannerConfig {
  /** Project root: boundary ids hash the path relative to it. */
  root: string
  /** Packages whose `Hydrate` export is a boundary, with their framework. */
  packages?: Readonly<Record<string, HydrateFramework>>
  /** The package `lazyRouteComponent` is imported from, per framework. */
  routerPackages?: Readonly<Partial<Record<HydrateFramework, string>>>
  /**
   * Server compiles report the rejections the client reports (J5.5: every
   * compile that would extract the boundary fails alike). Default true.
   */
  rejectEverywhere?: boolean
  /**
   * React development: the chunk component carries the route-HMR identity
   * marker (`$$tsrRefreshId`, R41), so an update of a boundary's chunk is
   * kept by React Refresh instead of swapped. Default false.
   */
  refreshMarkers?: boolean
}

/** Facts a plan records for its boundaries (plain data). */
export interface HydratePlanFacts {
  boundaries: Array<{
    /** The hydration id prefix both envs render (`h`). */
    id: string
    /** The chunk's derived canonical id when this env extracts the boundary. */
    chunk: string | null
  }>
}

export const HYDRATE_PLANNER = 'hydrate'

/** The query key of chunk ids: the manifest builders find Hydrate chunks by it. */
export const HYDRATE_QUERY_KEY = 'tss-hydrate'

const DEFAULT_PACKAGES: Readonly<Record<string, HydrateFramework>> = {
  '@tanstack/react-start': 'react',
  '@tanstack/solid-start': 'solid',
}

const HOOK_RE = /^use[A-Z0-9]/
/** Props React (and Solid, for `ref`) keep for themselves, or that the chunk component must not receive. */
const RESERVED_PROPS = new Set(['key', 'ref', 'children'])

interface ResolvedConfig {
  root: string
  packages: Readonly<Record<string, HydrateFramework>>
  routerPackage: (fw: HydrateFramework) => string
  rejectEverywhere: boolean
  refreshMarkers: boolean
}

function resolveConfig(config: unknown): ResolvedConfig {
  const c = (config ?? {}) as Partial<HydratePlannerConfig>
  if (typeof c.root !== 'string') {
    throw new Error(
      `the ${HYDRATE_PLANNER} planner needs \`root\` in its config (config.perPlanner.${HYDRATE_PLANNER})`,
    )
  }
  return {
    root: c.root,
    packages: c.packages ?? DEFAULT_PACKAGES,
    routerPackage: (fw) => c.routerPackages?.[fw] ?? `@tanstack/${fw}-router`,
    rejectEverywhere: c.rejectEverywhere ?? true,
    refreshMarkers: c.refreshMarkers ?? false,
  }
}

/**
 * Creates the planner. Its config comes from `config.perPlanner.hydrate`
 * (`HydratePlannerConfig`), which the host folds into the config key.
 */
export function createHydratePlanner(): Planner {
  return {
    name: HYDRATE_PLANNER,
    tier: 1,
    gate: (t0, ctx) => gate(t0, ctx),
    plan: (ctx) => plan(ctx),
  }
}

function gate(t0: ModuleAnalysis, ctx: GateContext): boolean {
  if (ctx.env.framework === 'vue') {
    return false
  }
  const packages =
    (ctx.config as Partial<HydratePlannerConfig> | undefined)?.packages ??
    DEFAULT_PACKAGES
  return (
    t0.imports.some(
      (imp) =>
        !imp.typeOnly &&
        packages[imp.specifier] !== undefined &&
        imp.specifiers.some(
          (s) =>
            !s.typeOnly && (s.imported === 'Hydrate' || s.imported === '*'),
        ),
    ) && t0.source.code.includes('Hydrate')
  )
}

// ---------------------------------------------------------------------------
// boundaries
// ---------------------------------------------------------------------------

interface ChildrenShape {
  /** The claimed region: what the chunk component returns. */
  range: Range
  /** The region needs a fragment around it (several children, or text). */
  wrap: boolean
  /** Nodes covering the region, for the validation walk. */
  nodes: Array<Node>
  /** The function-valued children to reject (J5.5). */
  functionChild: boolean
}

interface Boundary {
  element: JSXElement
  opening: JSXOpeningElement
  framework: HydrateFramework
  id: string
  /** False for a literal `split={false}`: neither extracted nor prefixed (R10). */
  split: boolean
  children: ChildrenShape | null
  /** Where the prefix (and `p`) attributes are inserted. */
  insertAt: number
  /** Source order among the boundaries the client extracts (generated names only). */
  index: number
}

interface BoundaryNames {
  /** The chunk component (and the export the lazy const loads). */
  comp: { name: string; sym: SymbolId }
  /** The `lazyRouteComponent` import of the lazy const (one per boundary: it travels alone). */
  lazyImport: { name: string; sym: SymbolId }
}

interface Extracted {
  b: Boundary
  region: Range
  /** Symbols the placeholder reads (captures, setters, `arguments`), for enclosing boundaries. */
  placeholderSyms: Array<{ sym: SymbolId; pos: number }>
  setterSyms: Set<SymbolId>
}

function findBoundaries(
  ctx: PlanContext,
  cfg: ResolvedConfig,
): Array<Boundary> {
  const { analysis, t1 } = ctx
  const found = new Map<
    number,
    { element: JSXElement; opening: JSXOpeningElement; fw: HydrateFramework }
  >()
  const elementOf = (opening: Node | null) => {
    if (!opening || opening.type !== 'JSXOpeningElement') {
      return null
    }
    const element = t1.parentOf(opening)
    return element && element.type === 'JSXElement'
      ? { element, opening }
      : null
  }
  for (const imp of analysis.imports) {
    const fw = cfg.packages[imp.specifier]
    if (fw === undefined || imp.typeOnly) {
      continue
    }
    for (const s of imp.specifiers) {
      if (s.typeOnly) {
        continue
      }
      if (s.imported === 'Hydrate') {
        for (const ref of t1.refs.refsOf(s.local)) {
          if (ref.ctx !== 'jsxOpen') {
            continue
          }
          const name = t1.nodeAt(ref.range.start)
          const hit = elementOf(name ? t1.parentOf(name) : null)
          if (hit && hit.opening.name.start === ref.range.start) {
            found.set(hit.element.start, { ...hit, fw })
          }
        }
      } else if (s.imported === '*') {
        // `<NS.Hydrate>`: the namespace binding is the root of a one-level member tag
        for (const ref of t1.refs.refsOf(s.local)) {
          if (ref.kind !== 'jsxTag') {
            continue
          }
          const object = t1.nodeAt(ref.range.start)
          const member = object ? t1.parentOf(object) : null
          if (
            !member ||
            member.type !== 'JSXMemberExpression' ||
            member.object.start !== ref.range.start ||
            member.object.type !== 'JSXIdentifier' ||
            member.property.name !== 'Hydrate'
          ) {
            continue
          }
          const hit = elementOf(t1.parentOf(member))
          if (hit && hit.opening.name.start === member.start) {
            found.set(hit.element.start, { ...hit, fw })
          }
        }
      }
    }
  }
  const fileHash = hash(
    'sha1',
    relative(cfg.root, analysis.path).replaceAll('\\', '/'),
  ).slice(0, 10)
  const out: Array<Boundary> = []
  let index = 0
  // the id's ordinal counts every boundary of the pristine source (the
  // same in every env, D5); shorter than an offset in the client's markup
  let ordinal = 0
  for (const start of [...found.keys()].sort((a, b) => a - b)) {
    const { element, opening, fw } = found.get(start)!
    const split = !isLiteralSplitFalse(opening)
    const children = childrenShape(element)
    out.push({
      element,
      opening,
      framework: fw,
      id: `${(ordinal++).toString(36)}_${fileHash}`,
      split,
      children,
      insertAt: insertPoint(opening),
      index: split && children ? index++ : -1,
    })
  }
  return out
}

function isLiteralSplitFalse(opening: JSXOpeningElement): boolean {
  for (const a of opening.attributes) {
    if (
      a.type === 'JSXAttribute' &&
      a.name.type === 'JSXIdentifier' &&
      a.name.name === 'split' &&
      a.value?.type === 'JSXExpressionContainer'
    ) {
      const e = unwrap(a.value.expression)
      return e.type === 'Literal' && e.value === false
    }
  }
  return false
}

/** After the last attribute (or the tag name) of the opening tag, before `>` or `/>`. */
function insertPoint(opening: JSXOpeningElement): number {
  // right after the last attribute, the type arguments or the tag name: a
  // comment between them and `>` (`<Hydrate // note\n>`) stays a comment
  const last = opening.attributes[opening.attributes.length - 1]
  return last ? last.end : (opening.typeArguments?.end ?? opening.name.end)
}

/** JSX drops whitespace-only text that spans lines (Babel's `cleanJSXElementLiteralChild`). */
function isDroppedText(node: Node): boolean {
  if (node.type !== 'JSXText') {
    return false
  }
  const lines = node.value.split(/\r\n|\n|\r/)
  return lines.length > 1 && lines.every((l) => /^[ \t]*$/.test(l))
}

function childrenShape(element: JSXElement): ChildrenShape | null {
  const meaningful = element.children.filter(
    (c) =>
      !isDroppedText(c) &&
      !(
        c.type === 'JSXExpressionContainer' &&
        c.expression.type === 'JSXEmptyExpression'
      ),
  )
  if (meaningful.length === 0) {
    // the `children` prop of a self-closing (or empty) boundary
    for (const a of element.openingElement.attributes) {
      if (
        a.type !== 'JSXAttribute' ||
        a.name.type !== 'JSXIdentifier' ||
        a.name.name !== 'children' ||
        a.value === null
      ) {
        continue
      }
      const v = a.value
      if (v.type === 'JSXElement' || v.type === 'JSXFragment') {
        return {
          range: { start: v.start, end: v.end },
          wrap: false,
          nodes: [v],
          functionChild: false,
        }
      }
      if (v.type !== 'JSXExpressionContainer') {
        return null // a string: plain text has nothing to hydrate
      }
      const e = v.expression
      if (e.type === 'JSXEmptyExpression') {
        return null
      }
      const inner = unwrap(e)
      if (
        (inner.type === 'Literal' && typeof inner.value === 'string') ||
        (inner.type === 'TemplateLiteral' && inner.expressions.length === 0)
      ) {
        return null
      }
      return {
        range: { start: e.start, end: e.end },
        wrap: false,
        nodes: [e],
        functionChild: isFunction(inner),
      }
    }
    return null
  }
  const functionChild = meaningful.some(
    (c) =>
      c.type === 'JSXExpressionContainer' &&
      c.expression.type !== 'JSXEmptyExpression' &&
      isFunction(unwrap(c.expression)),
  )
  if (meaningful.length === 1) {
    const c = meaningful[0]!
    if (c.type === 'JSXElement' || c.type === 'JSXFragment') {
      return {
        range: { start: c.start, end: c.end },
        wrap: false,
        nodes: [c],
        functionChild,
      }
    }
    if (
      c.type === 'JSXExpressionContainer' &&
      c.expression.type !== 'JSXEmptyExpression'
    ) {
      return {
        range: { start: c.expression.start, end: c.expression.end },
        wrap: false,
        nodes: [c.expression],
        functionChild,
      }
    }
  }
  const start = meaningful[0]!.start
  const end = meaningful[meaningful.length - 1]!.end
  return {
    range: { start, end },
    wrap: true,
    nodes: element.children.filter((c) => c.start >= start && c.end <= end),
    functionChild,
  }
}

function unwrap(node: Node): Node {
  let n = node
  for (;;) {
    switch (n.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
        n = n.expression
        continue
      default:
        return n
    }
  }
}

function isFunction(node: Node): boolean {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  )
}

const within = (r: Range, outer: Range): boolean =>
  r.start >= outer.start && r.end <= outer.end

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

function plan(ctx: PlanContext): void {
  const cfg = resolveConfig(ctx.config)
  const boundaries = findBoundaries(ctx, cfg)
  if (boundaries.length === 0) {
    return
  }
  const client = ctx.env.type === 'client'
  const liveEnv = ctx.liveness('env')
  const live = (b: Boundary) =>
    !liveEnv.isErased({ start: b.element.start, end: b.element.start + 1 })
  const facts: HydratePlanFacts = { boundaries: [] }
  const shared = new SharedNames(ctx)

  if (!client) {
    const erased: Array<Range> = []
    for (const b of boundaries) {
      erased.push(...stripFallback(ctx, b))
      if (b.split && b.children) {
        prefix(ctx, b, null)
        if (cfg.rejectEverywhere && live(b)) {
          validate(ctx, b, nestedRegions(boundaries, b))
        }
      }
      facts.boundaries.push({ id: b.id, chunk: null })
    }
    if (erased.length > 0) {
      // function-scope orphans of the stripped fallbacks: the core's cleanup
      // (pure initialisers go, impure ones stay as statements with what they read)
      cleanOrphanedDeclarations(ctx, 'all-outputs', HYDRATE_PLANNER)
    }
    ctx.setFacts(HYDRATE_PLANNER, facts)
    return
  }

  // client: generated names in source order, then planning innermost first, so an
  // enclosing boundary sees its nested placeholders (R39)
  const names = new Map<Boundary, BoundaryNames>()
  for (const b of boundaries) {
    if (b.split && b.children) {
      names.set(b, {
        comp: ctx.names.alloc(`TsrHydrate${b.index}`, { jsxTag: true }),
        lazyImport: ctx.names.alloc('tsrLazy'),
      })
    }
  }
  const extracted: Array<Extracted> = []
  const planned = new Map<Boundary, { sym: SymbolId; chunk: string }>()
  for (const b of [...boundaries].reverse()) {
    const n = names.get(b)
    const result =
      n && live(b)
        ? extract(
            ctx,
            b,
            n,
            nestedRegions(boundaries, b),
            extracted,
            shared,
            cfg,
          )
        : null
    if (result) {
      planned.set(b, result)
    }
  }
  // lazy consts and prefixes in source order
  for (const b of boundaries) {
    const p = planned.get(b)
    if (p) {
      addLazyConst(ctx, b, names.get(b)!, p.sym, p.chunk, cfg)
    }
    if (names.has(b)) {
      prefix(
        ctx,
        b,
        p && mayHaveProp(ctx, b.opening, 'prefetch') ? p.sym : null,
      )
    }
    facts.boundaries.push({ id: b.id, chunk: p?.chunk ?? null })
  }
  if (planned.size > 0) {
    extractExports(ctx)
  }
  ctx.setFacts(HYDRATE_PLANNER, facts)
}

/**
 * §3.5.3 for Hydrate chunks (J5.4 "an export only the children use loads
 * lazily"): every exported pure, unwritten declaration may leave for an
 * extracted-export output (`?tsr-split=export~<name>`, side-effect free),
 * which the parent re-exports; the core moves it there only when the parent
 * itself does not read it and a chunk needs it, so a component a boundary
 * renders and nothing else imports is not in the eager code. The same
 * outputs the route splitter declares for a route module (one output per
 * name: `declareOutput` is idempotent).
 */
function extractExports(ctx: PlanContext): void {
  const symbols = ctx.symbols
  for (const e of ctx.analysis.exports) {
    if (e.kind !== 'local' || e.local === null || e.typeOnly) {
      continue
    }
    const sym = e.local
    const declaring = ctx.t1.declaringUnits.get(sym) ?? []
    if (
      declaring.length === 0 ||
      declaring.some((u) => ctx.t1.units[u]!.kind !== 'declaration') ||
      declaring.some((u) => ctx.t1.units[u]!.effectful) ||
      ctx.t1.refs.writesOf(sym).length > 0
    ) {
      continue
    }
    const name = symbols.name(sym)
    const output = ctx.declareOutput({
      kind: 'export',
      key: `export~${name}`,
      derived: { kind: 'export', value: name },
      sideEffectFree: true,
    })
    ctx.extract(sym, output)
  }
}

/**
 * The children regions of the boundaries nested in `b` that the client
 * extracts: they render as placeholders in `b`'s chunk and are validated on
 * their own.
 */
function nestedRegions(
  boundaries: ReadonlyArray<Boundary>,
  b: Boundary,
): Array<Range> {
  const region = b.children!.range
  return boundaries
    .filter(
      (o) => o !== b && o.split && o.children && within(o.element, region),
    )
    .map((o) => o.children!.range)
}

/** Names and symbols shared by every boundary of the file (allocated on first use). */
class SharedNames {
  private propsSym: SymbolId | null = null
  private argsSym: SymbolId | null = null
  private argsProp: { name: string; sym: SymbolId } | null = null
  private elName: string | null = null
  constructor(private readonly ctx: PlanContext) {}
  /** The Solid chunk component's parameter. */
  get props(): SymbolId {
    this.propsSym ??= this.ctx.names.alloc('props').sym
    return this.propsSym
  }
  /** `arguments` of the enclosing function, as generated text reads it (renders `arguments`). */
  get args(): SymbolId {
    this.argsSym ??= this.ctx.symbols.declare('arguments', 'synthetic')
    return this.argsSym
  }
  /** The prop (and React local) carrying the enclosing function's `arguments`. */
  get argsCapture(): { name: string; sym: SymbolId } {
    this.argsProp ??= this.ctx.names.alloc('tsrArguments')
    return this.argsProp
  }
  /** The parameter of generated ref setters. */
  get el(): string {
    this.elName ??= this.ctx.names.alloc('el').name
    return this.elName
  }
}

/** The chunk's export name of a boundary's component: `H<n>` (short: production bytes in the chunk and the parent). */
function chunkExportName(b: Boundary): string {
  return `H${b.index}`
}

/** Inserts ` h="<id>"` (both envs) and, on the client, ` p={TsrHydrate<n>.preload}`. */
function prefix(ctx: PlanContext, b: Boundary, lazy: SymbolId | null): void {
  const parts: Array<string | SymRef> = [` h="${b.id}"`]
  if (lazy !== null) {
    parts.push(' p={', { sym: lazy }, '.preload}')
  }
  ctx.rewrites.add({
    range: { start: b.insertAt, end: b.insertAt },
    body: [{ k: 'text', parts }],
    scope: 'all-outputs',
    by: HYDRATE_PLANNER,
    reason: 'hydrate-prefix',
  })
}

function boundaryError(
  ctx: PlanContext,
  b: Boundary,
  code: string,
  message: string,
): void {
  const d: Diagnostic = {
    severity: 'error',
    message,
    range: { start: b.element.start, end: b.opening.end },
    by: HYDRATE_PLANNER,
    code,
  }
  ctx.diagnostic(d)
}

interface Scan {
  ok: boolean
  /** `arguments` occurrences owned by a function enclosing the boundary. */
  argumentsRefs: Array<Range>
  /** Solid `use:x` directives: the directive's name node range and binding. */
  directives: Array<{ nameRange: Range; sym: SymbolId | null }>
  /** Solid `ref={x}` attributes naming a binding: the identifier range and symbol. */
  refAttrs: Array<{ range: Range; sym: SymbolId }>
}

/**
 * Validates the children of `b` (J5.5) and collects what extraction needs.
 * `skip` are the regions of nested extracted boundaries (they render as
 * placeholders here and are validated on their own).
 */
function validate(
  ctx: PlanContext,
  b: Boundary,
  skip: ReadonlyArray<Range>,
): Scan {
  const shape = b.children!
  const scan: Scan = {
    ok: true,
    argumentsRefs: [],
    directives: [],
    refAttrs: [],
  }
  const fail = (code: string, message: string) => {
    if (scan.ok) {
      boundaryError(ctx, b, code, message)
    }
    scan.ok = false
  }
  if (shape.functionChild) {
    fail(
      'hydrate-function-children',
      'Hydrate cannot code-split function-as-children. Use split={false} for this boundary.',
    )
    return scan
  }
  const { t1, analysis } = ctx
  const freeArguments = new Set<number>()
  for (const f of t1.freeRefs) {
    if (
      f.name === 'arguments' &&
      f.range.start >= shape.range.start &&
      f.range.end <= shape.range.end
    ) {
      freeArguments.add(f.range.start)
    }
  }
  const solid = b.framework === 'solid'
  const refAt = (start: number): ClassifiedRef | undefined =>
    t1.refs
      .refsIn({ start, end: start + 1 })
      .find((r) => r.range.start === start)

  /** `fn`: inside a function of the children; `self`: `this`/`arguments` are owned inside. */
  const visit = (node: Node, fn: boolean, self: boolean): void => {
    if (skip.some((r) => within(node, r))) {
      return
    }
    let nextFn = fn
    let nextSelf = self
    switch (node.type) {
      case 'ArrowFunctionExpression':
        nextFn = true
        break
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        nextFn = true
        nextSelf = true
        break
      case 'ClassBody':
        nextFn = true
        nextSelf = true
        break
      case 'ThisExpression':
        if (!self) {
          fail(
            'hydrate-this',
            'Hydrate cannot code-split JSX that reads `this` of the enclosing component: the children render in another component. Read the value into a local before the boundary, or use split={false}.',
          )
        }
        break
      case 'Super':
        if (!self) {
          fail(
            'hydrate-super',
            'Hydrate cannot code-split JSX that reads `super` of the enclosing component: the children render in another component. Read the value into a local before the boundary, or use split={false}.',
          )
        }
        break
      case 'MetaProperty':
        if (!self && node.meta.name === 'new') {
          fail(
            'hydrate-this',
            'Hydrate cannot code-split JSX that reads `new.target` of the enclosing function. Read it into a local before the boundary, or use split={false}.',
          )
        }
        break
      case 'AwaitExpression':
      case 'YieldExpression':
        if (!fn) {
          fail(
            'hydrate-await',
            `Hydrate cannot code-split JSX containing \`${node.type === 'AwaitExpression' ? 'await' : 'yield'}\`: the split children render in a synchronous component. Compute the value before the boundary, or use split={false}.`,
          )
        }
        break
      case 'ForOfStatement':
        if (node.await && !fn) {
          fail(
            'hydrate-await',
            'Hydrate cannot code-split JSX containing `await`: the split children render in a synchronous component. Compute the value before the boundary, or use split={false}.',
          )
        }
        break
      case 'CallExpression':
        if (!fn) {
          const hook = hookName(node.callee)
          if (hook !== null) {
            fail(
              'hydrate-hook',
              `Hydrate cannot code-split JSX that calls hooks during render (\`${hook}()\`): the children render in another component. Move the hook call into a child component, or use split={false}.`,
            )
          }
        }
        break
      case 'Identifier':
        if (
          node.name === 'arguments' &&
          !self &&
          freeArguments.has(node.start)
        ) {
          scan.argumentsRefs.push({ start: node.start, end: node.end })
        }
        break
      case 'JSXAttribute':
        if (solid) {
          if (
            node.name.type === 'JSXNamespacedName' &&
            node.name.namespace.name === 'use'
          ) {
            const binding = analysis.file
              .scopeOf(node)
              .lookup(node.name.name.name, 'value')
            scan.directives.push({
              nameRange: {
                start: node.name.name.start,
                end: node.name.name.end,
              },
              sym: binding ? ctx.symbols.ofBinding(binding) : null,
            })
          } else if (
            node.name.type === 'JSXIdentifier' &&
            node.name.name === 'ref' &&
            node.value?.type === 'JSXExpressionContainer' &&
            node.value.expression.type === 'Identifier'
          ) {
            const ref = refAt(node.value.expression.start)
            if (ref) {
              scan.refAttrs.push({ range: ref.range, sym: ref.sym })
            }
          }
        }
        break
      default:
        break
    }
    forEachChild(node, (c) => visit(c, nextFn, nextSelf))
  }
  for (const n of shape.nodes) {
    visit(n, false, false)
  }
  if (!scan.ok) {
    return scan
  }
  // the children receive the values of the enclosing function's locals, not the variables
  const region = shape.range
  for (const ref of t1.refs.refsIn(region)) {
    if (
      ref.kind === 'write' &&
      !skip.some((r) => within(ref.range, r)) &&
      !ctx.symbols.isModuleLevel(ref.sym) &&
      !declaredWithin(ctx, ref.sym, region)
    ) {
      fail(
        'hydrate-capture-write',
        `Hydrate cannot code-split JSX that assigns \`${ctx.symbols.name(ref.sym)}\`, a local of the enclosing component: the split children receive its value, not the variable. Move the state into a child component, or use split={false}.`,
      )
      break
    }
  }
  return scan
}

/**
 * Whether the children of `b` read, through module-level declarations, the
 * unexported top-level declaration holding the boundary (a recursive
 * component rendering itself inside its own boundary): that declaration is
 * then the chunk's, and so is the lazy const only it reads.
 */
function reachesEnclosingDeclaration(
  ctx: PlanContext,
  b: Boundary,
  region: Range,
): boolean {
  const { t1, symbols } = ctx
  const item = t1.items.find(
    (it) => it.range.start <= b.element.start && b.element.start < it.range.end,
  )
  if (!item) {
    return false
  }
  const enclosing = item.units
    .map((u) => t1.units[u]!)
    .find(
      (u) => u.range.start <= b.element.start && b.element.start < u.range.end,
    )
  if (
    !enclosing ||
    enclosing.kind !== 'declaration' ||
    enclosing.exported.length > 0 ||
    enclosing.declares.length === 0
  ) {
    return false
  }
  const target = new Set(enclosing.declares)
  const seen = new Set<SymbolId>()
  const work: Array<SymbolId> = []
  const push = (range: Range) => {
    for (const ref of t1.refs.refsIn(range)) {
      if (symbols.isModuleLevel(ref.sym) && !seen.has(ref.sym)) {
        seen.add(ref.sym)
        work.push(ref.sym)
      }
    }
  }
  push(region)
  while (work.length > 0) {
    const sym = work.pop()!
    if (target.has(sym)) {
      return true
    }
    for (const u of t1.declaringUnits.get(sym) ?? []) {
      const unit = t1.units[u]!
      if (unit.kind === 'declaration') {
        push(unit.range)
      }
    }
  }
  return false
}

function declaredWithin(ctx: PlanContext, s: SymbolId, region: Range): boolean {
  const scope = ctx.symbols.scopeRange(s)
  return scope !== null && within(scope, region)
}

/** The hook a callee names (`useX`, `NS.useX`, `(useX)`), or null. */
function hookName(callee: Node): string | null {
  const c = unwrap(callee)
  if (c.type === 'Identifier') {
    return HOOK_RE.test(c.name) ? c.name : null
  }
  if (
    c.type === 'MemberExpression' &&
    !c.computed &&
    c.property.type === 'Identifier' &&
    HOOK_RE.test(c.property.name)
  ) {
    return c.property.name
  }
  return null
}

/** Visits the child nodes of a Yuku node (plain objects with `type`). */
function forEachChild(node: Node, fn: (child: Node) => void): void {
  for (const key in node) {
    if (key === 'comments') {
      continue
    }
    const v = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(v)) {
      for (const item of v) {
        if (isNode(item)) {
          fn(item)
        }
      }
    } else if (isNode(v)) {
      fn(v)
    }
  }
}

function isNode(v: unknown): v is Node {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { type?: unknown }).type === 'string' &&
    typeof (v as { start?: unknown }).start === 'number'
  )
}

/** Core fallbacks (placement constraints found after planning) that refuse an extraction. */
const FALLBACK_REASONS: Record<string, { code: string; message: string }> = {
  'hydrate-writer': {
    code: 'hydrate-module-write',
    message:
      'Hydrate cannot code-split JSX that assigns a module-level binding the rest of the module also uses: the split code cannot assign a binding it imports. Move the state into a child component, or use split={false}.',
  },
  'multi-writer': {
    code: 'hydrate-module-write',
    message:
      'Hydrate cannot code-split JSX that assigns a module-level binding other split code also assigns. Move the state into one component, or use split={false}.',
  },
  'shared-writer': {
    code: 'hydrate-module-write',
    message:
      'Hydrate cannot code-split JSX that assigns a module-level binding the rest of the module also uses. Move the state into a child component, or use split={false}.',
  },
  'ordered-effect': {
    code: 'hydrate-ordered-effect',
    message:
      'Hydrate cannot code-split JSX that reads, at module evaluation, a binding later top-level code mutates: the split would change the order of evaluation. Use split={false}.',
  },
}

/** Plans the client extraction of one live boundary; returns its lazy const. */
function extract(
  ctx: PlanContext,
  b: Boundary,
  { comp }: BoundaryNames,
  nested: ReadonlyArray<Range>,
  extracted: Array<Extracted>,
  shared: SharedNames,
  cfg: ResolvedConfig,
): { sym: SymbolId; chunk: string } | null {
  const { t1, symbols } = ctx
  const shape = b.children!
  const region = shape.range
  // the directly nested extracted boundaries (already planned: innermost first)
  const nestedAll = extracted.filter((e) => within(e.b.element, region))
  const direct = nestedAll.filter(
    (e) => !nestedAll.some((o) => o !== e && within(e.b.element, o.region)),
  )
  const skip = direct.map((e) => e.region)
  const scan = validate(ctx, b, nested)
  if (!scan.ok) {
    return null
  }
  const fallback = ctx.fallbacks.find(
    (f) =>
      f.kind === 'hydrate-children' &&
      f.range.start === region.start &&
      f.range.end === region.end,
  )
  if (fallback) {
    const reason = FALLBACK_REASONS[fallback.reason] ?? {
      code: `hydrate-${fallback.reason}`,
      message: 'Hydrate cannot code-split these children. Use split={false}.',
    }
    boundaryError(ctx, b, reason.code, reason.message)
    return null
  }

  // ---- captures: own reads declared outside, then nested placeholders' reads (R39)
  const liveEnv = ctx.liveness('env')
  const declaredInside = (sym: SymbolId) => declaredWithin(ctx, sym, region)
  const solid = b.framework === 'solid'
  // Solid: `ref={x}` on a captured reassignable binding becomes a setter prop
  const setters = solid
    ? scan.refAttrs.filter(
        (r) =>
          !symbols.isModuleLevel(r.sym) &&
          !declaredInside(r.sym) &&
          symbols.isReassignable(r.sym),
      )
    : []
  const setterAt = new Set(setters.map((s) => s.range.start))
  const found: Array<{ sym: SymbolId; pos: number }> = []
  for (const ref of t1.refs.refsIn(region)) {
    if (
      skip.some((r) => within(ref.range, r)) ||
      setterAt.has(ref.range.start) ||
      ref.kind === 'implicitJsxFactory' ||
      ref.kind === 'exportSpecifier' ||
      symbols.isModuleLevel(ref.sym) ||
      declaredInside(ref.sym) ||
      !liveEnv.live(ref)
    ) {
      continue
    }
    found.push({ sym: ref.sym, pos: ref.range.start })
  }
  let args = scan.argumentsRefs.length > 0
  for (const e of direct) {
    for (const p of e.placeholderSyms) {
      if (p.sym === shared.args) {
        args = true
        continue
      }
      if (symbols.isModuleLevel(p.sym) || declaredInside(p.sym)) {
        continue
      }
      if (e.setterSyms.has(p.sym)) {
        boundaryError(
          ctx,
          b,
          'hydrate-nested-ref',
          `Hydrate cannot code-split JSX whose nested boundary assigns \`${symbols.name(p.sym)}\` through \`ref\`, a local declared outside both boundaries. Use split={false} on one of them.`,
        )
        return null
      }
      found.push({ sym: p.sym, pos: e.b.element.start })
    }
  }
  // Solid: `use:x` reads `x` (a core value ref, captured above); a directive
  // names an identifier, so a captured local stays a local: `const x = props.x`
  const directiveLocals: Array<{ name: string; sym: SymbolId }> = []
  if (solid) {
    for (const d of scan.directives) {
      if (
        d.sym === null ||
        declaredInside(d.sym) ||
        symbols.isModuleLevel(d.sym)
      ) {
        continue
      }
      found.push({ sym: d.sym, pos: d.nameRange.start })
      if (!directiveLocals.some((l) => l.sym === d.sym)) {
        directiveLocals.push({ name: symbols.name(d.sym), sym: d.sym })
      }
    }
  }
  const captures: Array<SymbolId> = []
  {
    const seen = new Set<SymbolId>()
    for (const f of [...found].sort((x, y) => x.pos - y.pos)) {
      if (!seen.has(f.sym)) {
        seen.add(f.sym)
        captures.push(f.sym)
      }
    }
  }

  // ---- outputs, names, symbols
  const out = ctx.declareOutput({
    kind: 'hydrate',
    key: b.id,
    derived: { kind: 'hydrate', value: b.id },
  })
  const chunkId = out.slice('derived:'.length)
  // the parent's lazy const: same name as the chunk component, its own symbol
  // (D10, impl-notes-core 29), unless the children reach the unexported
  // declaration holding the boundary (a recursive component): that
  // declaration then moves into the chunk with the lazy const, next to the
  // chunk component, and the two need distinct names
  const lazy = reachesEnclosingDeclaration(ctx, b, region)
    ? ctx.names.alloc(comp.name).sym
    : symbols.declare(comp.name)
  const propOf = new Map<SymbolId, string>()
  for (const c of captures) {
    const name = symbols.name(c)
    propOf.set(
      c,
      RESERVED_PROPS.has(name) ? ctx.names.alloc(`tsrCap$${name}`).name : name,
    )
  }
  const setterProps = setters.map((s) => ({
    ...s,
    prop: ctx.names.alloc(`tsrRef$${symbols.name(s.sym)}`).name,
  }))

  // ---- substitution environment of the chunk component (R39)
  const env = new Map<SymbolId, RefTarget>()
  const props = solid ? shared.props : null
  if (props !== null) {
    for (const c of captures) {
      if (!directiveLocals.some((l) => l.sym === c)) {
        env.set(c, { member: [props, propOf.get(c)!] })
      }
    }
  }
  if (args) {
    const a = shared.argsCapture
    env.set(
      shared.args,
      props !== null ? { member: [props, a.name] } : { sym: a.sym },
    )
  }
  const scopeChunk: ReadonlyArray<OutputId> = [out]
  for (const r of scan.argumentsRefs) {
    ctx.rewrites.add({
      range: r,
      body: [{ k: 'text', parts: [{ sym: shared.args }], mapTo: r.start }],
      scope: scopeChunk,
      by: HYDRATE_PLANNER,
      reason: 'hydrate-arguments',
    })
  }
  for (const s of setterProps) {
    const setter = symbols.declare(s.prop, 'synthetic')
    env.set(setter, { member: [props!, s.prop] })
    ctx.rewrites.add({
      range: s.range,
      body: [{ k: 'text', parts: [{ sym: setter }], mapTo: s.range.start }],
      scope: scopeChunk,
      by: HYDRATE_PLANNER,
      reason: 'hydrate-ref-setter',
    })
  }

  // ---- the chunk component: a fixed-home generated unit owning the children (R37)
  // exported under the short name `H<n>` (the parent's lazy wrapper reads it;
  // the name is production bytes, twice per boundary)
  const head: Array<string | SymRef> = ['function ', { sym: comp.sym }]
  if (props !== null) {
    // Solid: the one `props` parameter, when the chunk reads it
    const readsProps = captures.length > 0 || args || setterProps.length > 0
    head.push(readsProps ? '(' : '() { ')
    if (readsProps) {
      head.push({ sym: props }, ') { ')
    }
    for (const l of directiveLocals) {
      head.push(`const ${l.name} = `, { sym: props }, `.${propOf.get(l.sym)}; `)
    }
  } else {
    const params: Array<string> = []
    for (const c of captures) {
      const name = symbols.name(c)
      const prop = propOf.get(c)!
      params.push(prop === name ? name : `${prop}: ${name}`)
    }
    if (args) {
      params.push(shared.argsCapture.name)
    }
    head.push(params.length > 0 ? `({ ${params.join(', ')} }) { ` : '() { ')
  }
  head.push('return ')
  if (shape.wrap) {
    // a classic JSX runtime compiles the fragment through the pragma's bindings: read them
    const { jsx } = t1
    if (jsx.runtime === 'classic') {
      for (const s of new Set([jsx.factory, jsx.fragment])) {
        if (s !== null) {
          head.push('/* ', { sym: s }, ' */ ')
        }
      }
    }
    head.push('<>')
  } else {
    head.push('(')
  }
  const tail: Array<string | SymRef> = [shape.wrap ? '</> }\n' : ') }\n']
  if (cfg.refreshMarkers && b.framework === 'react') {
    // identity = chunk id + the binding React Refresh registers (R41, as the
    // route splitter marks its component chunks)
    tail.push(
      { sym: comp.sym },
      `.$$tsrRefreshId = ${JSON.stringify(`${chunkId} ${comp.name}`)}\n`,
    )
  }
  tail.push('export { ', { sym: comp.sym }, ` as ${chunkExportName(b)} }\n`)
  const owner = ctx.rewrites.addGenerated({
    body: [
      { k: 'text', parts: head, mapTo: b.element.start },
      { k: 'slice', range: region },
      { k: 'text', parts: tail },
    ],
    declares: [comp.sym],
    effectful: false,
    anchor: { k: 'end' },
    home: out,
    env,
    by: HYDRATE_PLANNER,
  })

  // ---- the placeholder at the original occurrence
  const placeholderSyms: Array<{ sym: SymbolId; pos: number }> = []
  const parts: Array<string | SymRef> = ['<', { sym: lazy, ctx: 'jsxTag' }]
  for (const c of captures) {
    if (
      solid &&
      symbols.isReassignable(c) &&
      (t1.refs.writesOf(c).length > 0 || setters.some((s) => s.sym === c))
    ) {
      // Solid passes a bare identifier by value; a binding assigned later
      // (`ref={el}` sets it, a reassigned let) is read through a getter
      // (a call makes the prop dynamic), so the chunk sees its current value
      parts.push(` ${propOf.get(c)}={(() => `, { sym: c }, ')()}')
    } else {
      parts.push(` ${propOf.get(c)}={`, { sym: c }, '}')
    }
    placeholderSyms.push({ sym: c, pos: b.element.start })
  }
  if (args) {
    parts.push(` ${shared.argsCapture.name}={`, { sym: shared.args }, '}')
    placeholderSyms.push({ sym: shared.args, pos: b.element.start })
  }
  for (const s of setterProps) {
    // Solid's own `ref` assignment: call a function ref, else assign the variable
    const el = shared.el
    parts.push(
      ` ${s.prop}={(${el}) => typeof `,
      { sym: s.sym },
      ` === 'function' ? `,
      { sym: s.sym, ctx: 'callee' },
      `(${el}) : (`,
      { sym: s.sym },
      ` = ${el})}`,
    )
    placeholderSyms.push({ sym: s.sym, pos: b.element.start })
  }
  parts.push('/>')
  const regionId = ctx.region(region, 'hydrate-children')
  ctx.rewrites.claim({
    region: regionId,
    owner,
    placeholder: [{ k: 'text', parts, mapTo: region.start }],
    by: HYDRATE_PLANNER,
  })

  extracted.push({
    b,
    region,
    placeholderSyms,
    setterSyms: new Set(setters.map((s) => s.sym)),
  })
  return { sym: lazy, chunk: chunkId }
}

/** The parent's lazy const, placed by needers (a boundary in a split component homes with it). */
function addLazyConst(
  ctx: PlanContext,
  b: Boundary,
  { lazyImport }: BoundaryNames,
  lazy: SymbolId,
  chunkId: string,
  cfg: ResolvedConfig,
): void {
  const spec = siblingSpecifier(chunkId)
  const router = cfg.routerPackage(b.framework)
  ctx.rewrites.addGenerated({
    body: [
      {
        k: 'text',
        parts: [
          'const ',
          { sym: lazy },
          ' = /* @__PURE__ */ ',
          { sym: lazyImport.sym, ctx: 'callee' },
          '(() => import(',
        ],
      },
      {
        k: 'spec',
        specifier: spec,
        edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
        provenance: { origin: 'runtime' },
        form: 'dynamic',
      },
      { k: 'text', parts: [`), '${chunkExportName(b)}')\n`] },
    ],
    declares: [lazy],
    effectful: false,
    anchor: { k: 'after-header' },
    home: 'auto',
    by: HYDRATE_PLANNER,
    imports: [
      {
        names: [{ imported: 'lazyRouteComponent', local: lazyImport.sym }],
        spec: {
          k: 'spec',
          specifier: router,
          edgeKey: ctx.edgeKey(router, 'static', 'runtime'),
          provenance: { origin: 'runtime' },
        },
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// fallback (server envs)
// ---------------------------------------------------------------------------

/** Erases a statically visible `fallback`; returns the erased ranges. */
function stripFallback(ctx: PlanContext, b: Boundary): Array<Range> {
  const erased: Array<Range> = []
  const erase = (range: Range) => {
    ctx.rewrites.add({
      range,
      body: [],
      scope: 'all-outputs',
      by: HYDRATE_PLANNER,
      reason: 'hydrate-fallback',
    })
    erased.push(range)
  }
  let prevEnd = b.opening.typeArguments?.end ?? b.opening.name.end
  for (const a of b.opening.attributes) {
    const before = prevEnd
    prevEnd = a.end
    if (a.type === 'JSXAttribute') {
      if (a.name.type === 'JSXIdentifier' && a.name.name === 'fallback') {
        // with the whitespace before it
        erase({ start: before, end: a.end })
      }
      continue
    }
    const obj = spreadObject(ctx, a.argument)
    if (obj) {
      for (const p of obj.properties) {
        if (isNamedProperty(p, 'fallback')) {
          erase(propertyRange(obj, p))
        }
      }
    }
  }
  return erased
}

/** The object literal a spread passes: inline, or a single-use unexported `const`. */
function spreadObject(
  ctx: PlanContext,
  argument: Node,
): ObjectExpression | null {
  const arg = unwrap(argument)
  if (arg.type === 'ObjectExpression') {
    return arg
  }
  if (arg.type !== 'Identifier') {
    return null
  }
  const { t1, symbols } = ctx
  const ref = t1.refs
    .refsIn({ start: arg.start, end: arg.end })
    .find((r) => r.range.start === arg.start)
  if (!ref || symbols.isReassignable(ref.sym)) {
    return null
  }
  const all = t1.refs.refsOf(ref.sym)
  if (all.length !== 1 || all[0] !== ref) {
    return null
  }
  const binding = symbols.binding(ref.sym)
  const decl =
    binding?.declarations.length === 1 ? binding.declarations[0]! : null
  const declarator = decl ? t1.parentOf(decl) : null
  if (
    !declarator ||
    declarator.type !== 'VariableDeclarator' ||
    declarator.id.start !== decl!.start ||
    declarator.init === null
  ) {
    return null
  }
  const statement = t1.parentOf(declarator)
  const container = statement ? t1.parentOf(statement) : null
  if (
    !statement ||
    statement.type !== 'VariableDeclaration' ||
    statement.kind !== 'const' ||
    container?.type === 'ExportNamedDeclaration'
  ) {
    return null
  }
  const init = unwrap(declarator.init)
  return init.type === 'ObjectExpression' ? init : null
}

function isNamedProperty(p: Node, name: string): boolean {
  if (p.type !== 'Property') {
    return false
  }
  const k = p.key
  if (!p.computed && k.type === 'Identifier') {
    return k.name === name
  }
  if (k.type === 'Literal') {
    return k.value === name
  }
  if (
    p.computed &&
    k.type === 'TemplateLiteral' &&
    k.expressions.length === 0 &&
    k.quasis.length === 1
  ) {
    return k.quasis[0]!.value.cooked === name
  }
  return false
}

/** A property's range with its separating comma (one edit per removed property, R17). */
function propertyRange(obj: ObjectExpression, prop: Node): Range {
  const props = obj.properties as ReadonlyArray<Node>
  const i = props.findIndex((p) => p.start === prop.start)
  const next = props[i + 1]
  if (next) {
    return { start: prop.start, end: next.start }
  }
  const prev = props[i - 1]
  if (prev) {
    return { start: prev.end, end: prop.end }
  }
  return { start: prop.start, end: prop.end }
}

/** Whether the opening tag may pass `name` (an attribute, or a spread that may carry it). */
function mayHaveProp(
  ctx: PlanContext,
  opening: JSXOpeningElement,
  name: string,
): boolean {
  return opening.attributes.some((a) => {
    if (a.type === 'JSXAttribute') {
      return a.name.type === 'JSXIdentifier' && a.name.name === name
    }
    const obj = spreadObject(ctx, a.argument)
    if (!obj) {
      return true
    }
    return obj.properties.some(
      (p) =>
        p.type !== 'Property' ||
        (p.computed && !isNamedProperty(p, name) && p.key.type !== 'Literal') ||
        isNamedProperty(p, name),
    )
  })
}
