/**
 * The `<Hydrate>` deferred-hydration planner (J5) on the shared compiler core.
 *
 * A boundary is a JSX element whose tag is the `Hydrate` of a Start package,
 * by binding: a named or renamed import, or `<NS.Hydrate>` on a namespace
 * import, of the package or of an app module re-exporting it as `Hydrate`
 * (the recognizer's `Hydrate` kinds, read through the summaries in the
 * prefetch; a package's re-export is not followed: a Vite server resolves no
 * package it externalises, so the client alone would follow it). Its id is
 * computed from the pristine source (the ordinal of its `<` among the
 * elements of the module that may be one, and a hash of the root-relative
 * path), so every env and every output of one build agree whatever other
 * planners erase or the envs resolve: server and client must emit the same
 * prefix for every boundary.
 *
 * - Every env inserts ` h="<id>"` into the opening tag of each boundary the
 *   client may extract (anything but a literal `split={false}` with children
 *   that are not text only), so the server's and the client's hydration ids
 *   match; the client keeps it on a boundary whose children it keeps in
 *   place (decision 12: a capture the split children would not see as the
 *   component does, with one warning, `notSplit`).
 * - Server envs strip a statically visible `fallback` (an erased region:
 *   the core removes what only the fallback read).
 * - The client env claims the children for a fixed-home generated unit, the
 *   chunk component of `<file>?tss-hydrate=<id>`; the original occurrence
 *   renders `<TsrHydrate<n> a={a}/>` and a `/* @__PURE__ *\/` lazy const
 *   (an `auto` home: placed by the removal rule) loads the chunk. Captures are computed innermost
 *   first and include the reads of nested placeholders, so a Solid chunk
 *   forwards them through its substitution environment.
 */
import { hash } from 'node:crypto'
import { relative } from 'node:path'
import {
  Declarations,
  LookupPath,
  UNKNOWN,
  VALUE,
  derivedIdOf,
  isKnownSpecifier,
  listEnd,
  ownEntry,
  recognizeImport,
  removeListItems,
  sameFileSpecifier,
  unwrapExpression,
  valueBinding,
  walkMoved,
} from '@tanstack/router-utils/compiler'
import { startValueReader } from '../compiler/prefetch'
import {
  HYDRATE_COMPONENT,
  HYDRATE_KINDS,
  startRecognizer,
} from '../compiler/recognizer'
import type { PackageClasses } from '../compiler/package-class'
import type {
  AbstractValue,
  ClassifiedRef,
  ContextKind,
  ContextUse,
  Diagnostic,
  ImportEntry,
  ModuleAnalysis,
  PlanContext,
  Planner,
  PrefetchContext,
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

type HydrateFramework = 'react' | 'solid'

export interface HydratePlannerConfig {
  /** Project root: boundary ids hash the path relative to it. */
  root: string
}

export const HYDRATE_PLANNER = 'hydrate'

const HOOK_RE = /^use[A-Z0-9]/
/**
 * Props React (and Solid, for `ref`) keep for themselves: a capture of such a
 * name travels under another. `children` is an ordinary prop of the
 * self-closing placeholder (`<Lazy children={children}/>`), as on main.
 */
const RESERVED_PROPS = new Set(['key', 'ref'])

declare module '@tanstack/router-utils/compiler' {
  interface PlannerData {
    /** The Hydrate planner's `PlannerData` (`HYDRATE_PLANNER`). */
    hydrate: { config: HydratePlannerConfig; prefetch: HydratePrefetch }
  }
}

/**
 * Creates the planner. Its config comes from `config.perPlanner.hydrate`
 * (`HydratePlannerConfig`), which the host folds into the config key.
 */
export function createHydratePlanner(
  /** Whose modules' exports are followed (`PackageClasses.readsOnDemand`). */
  classes: Pick<PackageClasses, 'readsOnDemand'>,
): Planner<typeof HYDRATE_PLANNER> {
  return {
    name: HYDRATE_PLANNER,
    tier: 1,
    gate: (t0) => gate(t0),
    prefetch: (t0, ctx) => prefetch(t0, ctx, classes),
    plan: (ctx) => plan(ctx),
  }
}

type ImportSpecifierEntry = ImportEntry['specifiers'][number]

/** An import a boundary's tag may be: imported as `Hydrate`, or a namespace (`<NS.Hydrate>`), of any module. */
function isCandidate(s: ImportSpecifierEntry): boolean {
  return !s.typeOnly && (s.imported === HYDRATE_COMPONENT || s.namespace)
}

function gate(t0: ModuleAnalysis): boolean {
  return (
    t0.imports.some(
      (imp) => !imp.typeOnly && imp.specifiers.some(isCandidate),
    ) && t0.source.code.includes(HYDRATE_COMPONENT)
  )
}

/**
 * Whether an import names the tag of an element: a JSX reference of the
 * binding (of `<NS.Hydrate>` for a namespace). The prefetch reads nothing
 * for an import no element can be a boundary through (a module calling
 * `useHydrated` passes the gate), so it records no dependency for it.
 */
function mayTagBoundary(t0: ModuleAnalysis, s: ImportSpecifierEntry): boolean {
  if (
    s.namespace &&
    !t0.source.code.includes(`${s.localName}.${HYDRATE_COMPONENT}`)
  ) {
    return false
  }
  const binding = t0.file.bindings[s.local]
  return (
    binding !== undefined &&
    binding.references.some(
      (r) => !r.inTypePosition && r.node.type === 'JSXIdentifier',
    )
  )
}

/** The framework of a value that is the `Hydrate` of a Start package. */
function frameworkOf(v: AbstractValue): HydrateFramework | undefined {
  return v.t === 'factory' ? ownEntry(HYDRATE_KINDS, v.kind) : undefined
}

/** The prefetch's result: the candidate imports of app modules that are the Start `Hydrate`, by binding. */
interface HydratePrefetch {
  reexported: Array<[SymbolId, HydrateFramework]>
}

/**
 * What each candidate import of an app module is, through the summaries
 * (named re-exports, imports exported again, `export *`, namespaces, chains),
 * never entering a package. Withdraws a module with no boundary.
 */
async function prefetch(
  t0: ModuleAnalysis,
  ctx: PrefetchContext,
  classes: Pick<PackageClasses, 'readsOnDemand'>,
): Promise<boolean> {
  const table = startRecognizer()
  const self = ctx.identity.canonicalId
  let reader: ReturnType<typeof startValueReader> | null = null
  let direct = false
  const reexported: HydratePrefetch['reexported'] = []
  const work: Array<Promise<void>> = []
  for (const imp of t0.imports) {
    if (imp.typeOnly) {
      continue
    }
    const known = isKnownSpecifier(table, imp.specifier)
    for (const s of imp.specifiers) {
      if (!isCandidate(s) || s.local < 0 || !mayTagBoundary(t0, s)) {
        continue
      }
      if (known) {
        direct ||=
          frameworkOf(
            recognizeImport(table, imp.specifier, HYDRATE_COMPONENT),
          ) !== undefined
        continue
      }
      reader ??= startValueReader(ctx, {
        table,
        answerFromRegistry: false,
        enters: (id) => classes.readsOnDemand(id),
      })
      const read = reader
      work.push(
        (async () => {
          const start = LookupPath.start()
          let v: AbstractValue = UNKNOWN
          if (s.namespace) {
            const target = await read.resolveFrom(imp.specifier, self)
            if (target !== null) {
              v = await read.exportValue(target, HYDRATE_COMPONENT, start)
            }
          } else {
            v = await read.importedValue(
              self,
              imp.specifier,
              HYDRATE_COMPONENT,
              start,
            )
          }
          const fw = frameworkOf(v)
          if (fw) {
            reexported.push([s.local, fw])
          }
        })(),
      )
    }
  }
  await Promise.all(work)
  ctx.set({ reexported } satisfies HydratePrefetch)
  return direct || reexported.length > 0
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
  /** False for a literal `split={false}`: neither extracted nor prefixed, on the server and the client alike. */
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
  placeholderSyms: Array<SymbolId>
  setterSyms: Set<SymbolId>
  /** Where the children first read each capture (diagnostics of enclosing boundaries). */
  readAt: ReadonlyMap<SymbolId, Range>
}

function findBoundaries(
  ctx: PlanContext,
  cfg: HydratePlannerConfig,
): Array<Boundary> {
  const { analysis, t1 } = ctx
  const table = startRecognizer()
  const reexported = new Map(ctx.prefetched.get(HYDRATE_PLANNER)?.reexported)
  // every element whose tag may be a boundary (its framework, or null when
  // its import is no Start `Hydrate`): ordinals count them all, so an env
  // resolving an app module differently shifts no other boundary's id
  const found = new Map<
    number,
    {
      element: JSXElement
      opening: JSXOpeningElement
      fw: HydrateFramework | null
    }
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
    if (imp.typeOnly) {
      continue
    }
    const known = isKnownSpecifier(table, imp.specifier)
    for (const s of imp.specifiers) {
      if (!isCandidate(s)) {
        continue
      }
      const fw =
        (known
          ? frameworkOf(
              recognizeImport(table, imp.specifier, HYDRATE_COMPONENT),
            )
          : reexported.get(s.local)) ?? null
      if (s.imported === HYDRATE_COMPONENT) {
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
      } else if (s.namespace) {
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
            member.property.name !== HYDRATE_COMPONENT
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
  // the id's ordinal counts every candidate element of the pristine source
  // (the same in every env, as ids derive from the pristine source); shorter
  // than an offset in the client's markup
  let ordinal = 0
  for (const start of [...found.keys()].sort((a, b) => a - b)) {
    const { element, opening, fw } = found.get(start)!
    const id = `${(ordinal++).toString(36)}_${fileHash}`
    if (fw === null) {
      continue
    }
    const split = !isLiteralSplitFalse(opening)
    const children = childrenShape(element)
    out.push({
      element,
      opening,
      framework: fw,
      id,
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
      const e = unwrapExpression(a.value.expression)
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
      if (isText(e)) {
        return null
      }
      return {
        range: { start: e.start, end: e.end },
        wrap: false,
        nodes: [e],
        functionChild: isFunction(unwrapExpression(e)),
      }
    }
    return null
  }
  if (
    meaningful.every(
      (c) =>
        c.type === 'JSXText' ||
        (c.type === 'JSXExpressionContainer' &&
          c.expression.type !== 'JSXEmptyExpression' &&
          isText(c.expression)),
    )
  ) {
    return null // text only, in any spelling: nothing to hydrate
  }
  const functionChild = meaningful.some(
    (c) =>
      c.type === 'JSXExpressionContainer' &&
      c.expression.type !== 'JSXEmptyExpression' &&
      isFunction(unwrapExpression(c.expression)),
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

/** A string, or a template literal without expressions. */
function isText(node: Node): boolean {
  const e = unwrapExpression(node)
  return (
    (e.type === 'Literal' && typeof e.value === 'string') ||
    (e.type === 'TemplateLiteral' && e.expressions.length === 0)
  )
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

function plan(ctx: PlanContext<typeof HYDRATE_PLANNER>): void {
  const cfg = ctx.config
  const boundaries = findBoundaries(ctx, cfg)
  if (boundaries.length === 0) {
    return
  }
  const client = ctx.env.type === 'client'
  const liveEnv = ctx.liveness('env')
  const live = (b: Boundary) =>
    !liveEnv.isErased({ start: b.element.start, end: b.element.start + 1 })
  const shared = new SharedNames(ctx)

  if (!client) {
    for (const b of boundaries) {
      stripFallback(ctx, b)
      if (b.split && b.children) {
        prefix(ctx, b, null)
        // every compile that would extract the boundary fails alike (J5.5)
        if (live(b)) {
          validate(ctx, b, nestedRegions(boundaries, b))
        }
      }
    }
    return
  }

  // client: generated names in source order, then planning innermost first, so an
  // enclosing boundary sees its nested placeholders (closure interfaces are
  // computed bottom-up, including the reads of generated placeholders)
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
  // boundaries whose children stay in place: part of the enclosing ones'
  const inline = new Set<Boundary>()
  for (const b of [...boundaries].reverse()) {
    const n = names.get(b)
    const result =
      n && live(b)
        ? extract(
            ctx,
            b,
            n,
            nestedRegions(boundaries, b, inline),
            extracted,
            shared,
          )
        : null
    if (result === 'inline') {
      inline.add(b)
    } else if (result) {
      planned.set(b, result)
    }
  }
  // lazy consts and prefixes in source order
  for (const b of boundaries) {
    const p = planned.get(b)
    if (p) {
      addLazyConst(ctx, b, names.get(b)!, p.sym, p.chunk)
    }
    if (names.has(b)) {
      prefix(
        ctx,
        b,
        p && mayHaveProp(ctx, b.opening, 'prefetch') ? p.sym : null,
      )
    }
  }
}

/**
 * The children regions of the boundaries nested in `b` that the client
 * extracts: they render as placeholders in `b`'s chunk and are validated on
 * their own (not those it keeps in place, `inline`: their children are
 * `b`'s).
 */
function nestedRegions(
  boundaries: ReadonlyArray<Boundary>,
  b: Boundary,
  inline: ReadonlySet<Boundary> = new Set(),
): Array<Range> {
  const region = b.children!.range
  return boundaries
    .filter(
      (o) =>
        o !== b &&
        o.split &&
        o.children &&
        !inline.has(o) &&
        within(o.element, region),
    )
    .map((o) => o.children!.range)
}

/** Names and symbols shared by every boundary of the file (allocated on first use). */
class SharedNames {
  private propsSym: SymbolId | null = null
  private elName: string | null = null
  constructor(private readonly ctx: PlanContext) {}
  /** The Solid chunk component's parameter. */
  get props(): SymbolId {
    this.propsSym ??= this.ctx.names.alloc('props').sym
    return this.propsSym
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
  ctx.rewrites.edit({
    range: { start: b.insertAt, end: b.insertAt },
    body: [{ k: 'text', parts }],
    by: HYDRATE_PLANNER,
  })
}

function boundaryError(
  ctx: PlanContext,
  b: Boundary,
  code: string,
  message: string,
  range: Range = { start: b.element.start, end: b.opening.end },
): void {
  const d: Diagnostic = {
    severity: 'error',
    message,
    range,
    by: HYDRATE_PLANNER,
    code,
  }
  ctx.diagnostic(d)
}

interface Scan {
  ok: boolean
  /** Solid `use:x` directives: the directive's name node range and binding. */
  directives: Array<{ nameRange: Range; sym: SymbolId | null }>
  /** Solid `ref={x}` attributes naming a binding: the identifier range and symbol. */
  refAttrs: Array<{ range: Range; sym: SymbolId }>
  /** The outermost functions and instance-field initialisers of the children (`walkMoved`'s `callables`). */
  callables: Array<Range>
}

/**
 * The refusal of each context the children would take from the component
 * without a name, reported at the use (where the edit acts).
 */
const CONTEXT_REFUSALS: Record<
  ContextKind,
  { code: string; message: (use: ContextUse) => string }
> = {
  this: {
    code: 'hydrate-this',
    message: () =>
      'Hydrate cannot code-split JSX that reads `this` of the enclosing component: the children render in another component. Read the value into a local before the boundary, or use split={false}.',
  },
  super: {
    code: 'hydrate-super',
    message: () =>
      'Hydrate cannot code-split JSX that reads `super` of the enclosing component: the children render in another component. Read the value into a local before the boundary, or use split={false}.',
  },
  'new.target': {
    code: 'hydrate-new-target',
    message: () =>
      'Hydrate cannot code-split JSX that reads `new.target` of the enclosing function: the children render in another component. Read it into a local before the boundary, or use split={false}.',
  },
  arguments: {
    code: 'hydrate-arguments',
    message: () =>
      'Hydrate cannot code-split JSX that reads `arguments` of the enclosing function: the children render in another component. Read it into a local before the boundary (`const args = arguments`), or use split={false}.',
  },
  await: {
    code: 'hydrate-await',
    message: () =>
      'Hydrate cannot code-split JSX containing `await`: the split children render in a synchronous component. Compute the value before the boundary, or use split={false}.',
  },
  yield: {
    code: 'hydrate-yield',
    message: () =>
      'Hydrate cannot code-split JSX containing `yield`: the split children render in a synchronous component. Compute the value before the boundary, or use split={false}.',
  },
  'private-name': {
    code: 'hydrate-private-name',
    message: (use) =>
      `Hydrate cannot code-split JSX that reads \`#${(use.node as { name: string }).name}\` of the enclosing class: the split children render in another module, outside the class. Read it into a local before the boundary, or use split={false}.`,
  },
}

/**
 * Validates the children of `b` (J5.5) and collects what extraction needs.
 * `skip` are the regions of nested extracted boundaries (they render as
 * placeholders here and are validated on their own). The first failure in
 * the walk's order is reported.
 */
function validate(
  ctx: PlanContext,
  b: Boundary,
  skip: ReadonlyArray<Range>,
): Scan {
  const shape = b.children!
  const scan: Scan = { ok: true, directives: [], refAttrs: [], callables: [] }
  const fail = (code: string, message: string, range?: Range) => {
    if (scan.ok) {
      boundaryError(ctx, b, code, message, range)
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
  const solid = b.framework === 'solid'
  const refAt = (start: number): ClassifiedRef | undefined =>
    t1.refs
      .refsIn({ start, end: start + 1 })
      .find((r) => r.range.start === start)
  /** React's `use` (`use(Ctx)`, `React.use(promise)`), by binding: imports of `react`. */
  const reactUse = new Set<SymbolId>()
  const reactNamespaces = new Set<SymbolId>()
  if (!solid) {
    for (const imp of analysis.imports) {
      if (imp.typeOnly || imp.specifier !== 'react') {
        continue
      }
      for (const s of imp.specifiers) {
        if (s.typeOnly) {
          continue
        }
        if (s.imported === 'use') {
          reactUse.add(s.local)
        } else if (s.namespace || s.imported === 'default') {
          reactNamespaces.add(s.local)
        }
      }
    }
  }
  /** The name a call of React's `use` is written with, or null. */
  const reactUseName = (callee: Node): string | null => {
    const c = unwrapExpression(callee)
    const member =
      c.type === 'MemberExpression' &&
      !c.computed &&
      c.property.type === 'Identifier' &&
      c.property.name === 'use'
    const root = member ? c.object : c
    if (root.type !== 'Identifier') {
      return null
    }
    const sym = refAt(root.start)?.sym
    if (sym === undefined || !(member ? reactNamespaces : reactUse).has(sym)) {
      return null
    }
    return member ? 'use' : root.name
  }
  const { callables } = walkMoved(t1, shape.nodes, {
    skip,
    // every use crosses: the children render in another component
    onUse: (use) => {
      const refusal = CONTEXT_REFUSALS[use.kind]
      fail(refusal.code, refusal.message(use), {
        start: use.node.start,
        end: use.node.end,
      })
    },
    onNode: (node, runs) => {
      if (node.type === 'CallExpression') {
        // React's rules of hooks: a call that may run while the children
        // render would move into another component. Solid has none: a
        // `use*` call in the chunk runs under the boundary's owner, with
        // its context
        if (runs === 'now' && !solid) {
          const hook = hookName(node.callee) ?? reactUseName(node.callee)
          if (hook !== null) {
            fail(
              'hydrate-hook',
              `Hydrate cannot code-split JSX that calls hooks during render (\`${hook}()\`): the children render in another component. Move the hook call into a child component, or use split={false}.`,
              { start: node.start, end: node.end },
            )
          }
        }
      } else if (node.type === 'JSXAttribute' && solid) {
        if (
          node.name.type === 'JSXNamespacedName' &&
          node.name.namespace.name === 'use'
        ) {
          const binding = valueBinding(
            analysis.file.scopeOf(node),
            node.name.name.name,
          )
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
          node.value?.type === 'JSXExpressionContainer'
        ) {
          // (Solid's JSX transform unwraps `ref={el!}`, `ref={el as T}`, `ref={(el)}`)
          const target = unwrapExpression(node.value.expression)
          const ref =
            target.type === 'Identifier' ? refAt(target.start) : undefined
          if (ref) {
            scan.refAttrs.push({ range: ref.range, sym: ref.sym })
          }
        }
      }
    },
  })
  scan.callables = callables
  return scan
}

/**
 * The children's walk to the top-level declaration holding `b`, by name
 * through module-level declarations (names on the source only):
 * - `leadsBack`: the bindings the children reach that reach that
 *   declaration, it included (H2 (a), spec-phase2-hydrate: the route, a
 *   recursive component). A copy of one would hold the boundary again; the
 *   chunk imports each the module keeps (`OutputSpec.imported`);
 * - `enclosingUnexported`: the children reach that declaration and it is
 *   unexported (a recursive component): when the module does not keep it,
 *   the chunk holds it, and the lazy const only it reads, next to the chunk
 *   component, so the two need distinct names.
 */
function leadsBackToBoundary(
  ctx: PlanContext,
  b: Boundary,
  region: Range,
): { leadsBack: Set<SymbolId>; enclosingUnexported: boolean } {
  const { t1, symbols } = ctx
  const none = { leadsBack: new Set<SymbolId>(), enclosingUnexported: false }
  const item = t1.items.find(
    (it) => it.range.start <= b.element.start && b.element.start < it.range.end,
  )
  if (!item) {
    return none
  }
  const enclosing = item.units
    .map((u) => t1.units[u]!)
    .find(
      (u) => u.range.start <= b.element.start && b.element.start < u.range.end,
    )
  if (
    !enclosing ||
    enclosing.kind !== 'declaration' ||
    enclosing.declares.length === 0
  ) {
    return none
  }
  const target = new Set(enclosing.declares)
  // what the children reach, and what each reached binding's declarations name
  const named = new Map<SymbolId, Array<SymbolId>>()
  const work: Array<SymbolId> = []
  const namesIn = (range: Range) => {
    const out: Array<SymbolId> = []
    for (const ref of t1.refs.refsIn(range)) {
      if (symbols.isModuleLevel(ref.sym)) {
        out.push(ref.sym)
        if (!named.has(ref.sym)) {
          named.set(ref.sym, [])
          work.push(ref.sym)
        }
      }
    }
    return out
  }
  namesIn(region)
  while (work.length > 0) {
    const sym = work.pop()!
    const out: Array<SymbolId> = []
    for (const u of t1.declaringUnits.get(sym) ?? []) {
      const unit = t1.units[u]!
      if (unit.kind === 'declaration') {
        out.push(...namesIn(unit.range))
      }
    }
    named.set(sym, out)
  }
  const back = [...target].filter((t) => named.has(t))
  if (back.length === 0) {
    return none
  }
  // of those, what leads back: the walk reversed, from the declaration
  const namedBy = new Map<SymbolId, Array<SymbolId>>()
  for (const [sym, out] of named) {
    for (const t of out) {
      const by = namedBy.get(t)
      if (by) {
        by.push(sym)
      } else {
        namedBy.set(t, [sym])
      }
    }
  }
  const leadsBack = new Set<SymbolId>()
  while (back.length > 0) {
    const sym = back.pop()!
    if (!leadsBack.has(sym)) {
      leadsBack.add(sym)
      back.push(...(namedBy.get(sym) ?? []))
    }
  }
  return {
    leadsBack,
    enclosingUnexported:
      enclosing.exported.length === 0 &&
      [...target].some((t) => leadsBack.has(t)),
  }
}

function declaredWithin(ctx: PlanContext, s: SymbolId, region: Range): boolean {
  const scope = ctx.symbols.scopeRange(s)
  return scope !== null && within(scope, region)
}

/** The hook a callee names (`useX`, `NS.useX`, `(useX)`), or null. */
function hookName(callee: Node): string | null {
  const c = unwrapExpression(callee)
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

/**
 * A boundary whose children the client keeps in place (decision 12): one
 * warning naming `why`, at `range`; it renders as with `split={false}`, and
 * keeps its id (both envs prefix it alike).
 */
function notSplit(
  ctx: PlanContext,
  b: Boundary,
  why: string,
  range: Range = { start: b.element.start, end: b.opening.end },
): 'inline' {
  ctx.diagnostic({
    severity: 'warning',
    message: `Hydrate does not code-split these children, they render in place: ${why}. Write split={false} to keep them in place without this warning.`,
    range,
    by: HYDRATE_PLANNER,
    code: 'hydrate-not-split',
  })
  return 'inline'
}

/**
 * Plans the client extraction of one live boundary; returns its lazy const,
 * `inline` when its children stay in place (`notSplit`), null when it is
 * refused.
 */
function extract(
  ctx: PlanContext,
  b: Boundary,
  { comp }: BoundaryNames,
  nested: ReadonlyArray<Range>,
  extracted: Array<Extracted>,
  shared: SharedNames,
): { sym: SymbolId; chunk: string } | 'inline' | null {
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
  const fallback = ctx.fallbackAt(region, 'hydrate-children')
  if (fallback) {
    // (the core's `shared-writer` fallback: the chunk would assign a module binding)
    return notSplit(
      ctx,
      b,
      `they, or code only they use, assign \`${symbols.name(fallback.write.sym)}\`, a module-level binding, and the split code would assign an import or its own copy, not the binding the module reads`,
    )
  }

  // ---- captures: own reads declared outside, then nested placeholders' reads
  const liveEnv = ctx.liveness('env')
  const declaredInside = (sym: SymbolId) => declaredWithin(ctx, sym, region)
  const solid = b.framework === 'solid'
  // Solid: `ref={x}` on a captured reassignable binding becomes a setter
  // prop (a ref the client erased, e.g. in an isomorphic fn's server
  // implementation, sets nothing)
  const setters = solid
    ? scan.refAttrs.filter(
        (r) =>
          !liveEnv.isErased(r.range) &&
          !symbols.isModuleLevel(r.sym) &&
          !declaredInside(r.sym) &&
          symbols.isReassignable(r.sym),
      )
    : []
  const setterAt = new Set(setters.map((s) => s.range.start))
  /** A capture: `pos` orders the props, `at` is the read diagnostics point at. */
  const found: Array<{ sym: SymbolId; pos: number; at: Range }> = []
  // React passes a capture's value when the placeholder renders (Solid
  // reads a reassigned binding through a getter): a function of the
  // children reading a binding the component assigns, itself or through a
  // nested boundary's placeholder it renders, would read that snapshot
  const readsSnapshot = (sym: SymbolId, evaluated: Range): boolean =>
    !solid &&
    symbols.isReassignable(sym) &&
    scan.callables.some((f) => within(evaluated, f)) &&
    t1.mutation.isReassigned(sym, (r) => liveEnv.live(r))
  const snapshotWhy = (sym: SymbolId) =>
    `a function in them reads \`${symbols.name(sym)}\`, which the enclosing component reassigns, and split children receive its value when the boundary renders`
  // a capture whose runtime declaration does not end before the boundary
  // starts (a hoisted function's value is there from the start): the
  // placeholder may read it before it is initialised
  let table: Declarations | undefined
  const incomplete = (sym: SymbolId): boolean => {
    const binding = symbols.binding(sym)
    if (binding === null || symbols.initialisation(sym) === 'start') {
      return false
    }
    table ??= new Declarations(ctx.analysis.file)
    return table
      .of(binding)
      .some(
        (d) =>
          (d.spaces & VALUE) !== 0 &&
          d.kind !== 'erased' &&
          d.node.end > b.element.start,
      )
  }
  // the first reason after the walk: a write of the children (the cause of
  // a snapshot) is reported first
  let why: { text: string; at: Range } | undefined
  for (const ref of t1.capturesOf(region)) {
    if (
      skip.some((r) => within(ref.range, r)) ||
      setterAt.has(ref.range.start) ||
      ref.kind === 'exportSpecifier' ||
      !liveEnv.live(ref)
    ) {
      continue
    }
    // the children receive the values of the enclosing function's locals,
    // not the variables: a write the client's children keep assigns a copy
    // (one only the server keeps, e.g. in an isomorphic fn's server
    // implementation, stays in the server's render of the original JSX)
    if (ref.kind === 'write') {
      return notSplit(
        ctx,
        b,
        `they assign \`${symbols.name(ref.sym)}\`, a local of the enclosing component, and split children receive its value, not the variable`,
        ref.range,
      )
    }
    if (!why && readsSnapshot(ref.sym, ref.range)) {
      why = { text: snapshotWhy(ref.sym), at: ref.range }
    } else if (!why && incomplete(ref.sym)) {
      why = {
        text: `they read \`${symbols.name(ref.sym)}\`, whose declaration does not end before the boundary, and the split code may read it before it is initialised`,
        at: ref.range,
      }
    }
    found.push({ sym: ref.sym, pos: ref.range.start, at: ref.range })
  }
  if (why) {
    return notSplit(ctx, b, why.text, why.at)
  }
  for (const e of direct) {
    for (const sym of e.placeholderSyms) {
      if (symbols.isModuleLevel(sym) || declaredInside(sym)) {
        continue
      }
      if (e.setterSyms.has(sym)) {
        return notSplit(
          ctx,
          b,
          `a nested boundary assigns \`${symbols.name(sym)}\` through \`ref\`, a local declared outside both`,
        )
      }
      const at = e.readAt.get(sym) ?? e.b.element
      if (readsSnapshot(sym, e.b.element)) {
        return notSplit(ctx, b, snapshotWhy(sym), at)
      }
      found.push({ sym, pos: e.b.element.start, at })
    }
  }
  // Solid: `use:x` reads `x` (a core value ref, captured above); a directive
  // names an identifier, so a captured local stays a local: `const x = props.x`
  // (one the client erased is no capture)
  const directiveLocals: Array<{ name: string; sym: SymbolId }> = []
  if (solid) {
    for (const d of scan.directives) {
      if (
        d.sym === null ||
        liveEnv.isErased(d.nameRange) ||
        declaredInside(d.sym) ||
        symbols.isModuleLevel(d.sym)
      ) {
        continue
      }
      found.push({ sym: d.sym, pos: d.nameRange.start, at: d.nameRange })
      if (!directiveLocals.some((l) => l.sym === d.sym)) {
        directiveLocals.push({ name: symbols.name(d.sym), sym: d.sym })
      }
    }
  }
  const captures: Array<SymbolId> = []
  const readAt = new Map<SymbolId, Range>()
  for (const f of [...found].sort((x, y) => x.pos - y.pos)) {
    if (!readAt.has(f.sym)) {
      readAt.set(f.sym, f.at)
      captures.push(f.sym)
    }
  }

  // ---- outputs, names, symbols
  const { leadsBack, enclosingUnexported } = leadsBackToBoundary(ctx, b, region)
  const out = ctx.declareOutput({
    kind: 'hydrate',
    key: b.id,
    derived: { kind: 'hydrate', value: b.id },
    imported: leadsBack,
  })
  const chunkId = derivedIdOf(out)
  // the parent's lazy const: same name as the chunk component, its own symbol
  // (one name per meaning in every output of the file; the chunk component
  // is a fixed-home generated unit pinned to its chunk), unless the children reach the unexported
  // declaration holding the boundary (a recursive component): that
  // declaration then moves into the chunk with the lazy const, next to the
  // chunk component, and the two need distinct names
  const lazy = enclosingUnexported
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

  // ---- substitution environment of the chunk component (generated text is
  // structured: each output renders its symbols through this map, so outer
  // Solid rewrites reach inner placeholders)
  const env = new Map<SymbolId, RefTarget>()
  const props = solid ? shared.props : null
  if (props !== null) {
    for (const c of captures) {
      if (!directiveLocals.some((l) => l.sym === c)) {
        env.set(c, { member: [props, propOf.get(c)!] })
      }
    }
  }
  for (const s of setterProps) {
    const setter = symbols.declare(s.prop, 'synthetic')
    env.set(setter, { member: [props!, s.prop] })
    ctx.rewrites.edit({
      range: s.range,
      body: [{ k: 'text', parts: [{ sym: setter }], mapTo: s.range.start }],
      by: HYDRATE_PLANNER,
    })
  }

  // ---- the chunk component: a fixed-home generated unit owning the children
  // (ownership is separate from final placement: an erased ancestor region
  // suppresses it)
  // exported under the short name `H<n>` (the parent's lazy wrapper reads it;
  // the name is production bytes, twice per boundary)
  const head: Array<string | SymRef> = ['function ', { sym: comp.sym }]
  if (props !== null) {
    // Solid: the one `props` parameter, when the chunk reads it
    const readsProps = captures.length > 0 || setterProps.length > 0
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
    head.push(params.length > 0 ? `({ ${params.join(', ')} }) { ` : '() { ')
  }
  head.push('return ')
  if (shape.wrap) {
    head.push('<>')
  } else {
    head.push('(')
  }
  const tail: Array<string | SymRef> = [shape.wrap ? '</> }\n' : ') }\n']
  tail.push('export { ', { sym: comp.sym }, ` as ${chunkExportName(b)} }\n`)
  const regionId = ctx.region(region, 'hydrate-children')
  const owner = ctx.rewrites.addGenerated({
    body: [
      { k: 'text', parts: head, mapTo: b.element.start },
      { k: 'region', id: regionId },
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
  const placeholderSyms: Array<SymbolId> = []
  const parts: Array<string | SymRef> = ['<', { sym: lazy, ctx: 'jsxTag' }]
  for (const c of captures) {
    if (
      solid &&
      symbols.isReassignable(c) &&
      (t1.mutation.isReassigned(
        c,
        // (a `ref={c}` assigns only where the client keeps it)
        (r) => r.kind === 'write' || liveEnv.live(r),
      ) ||
        setters.some((s) => s.sym === c))
    ) {
      // Solid passes a bare identifier by value; a binding assigned later
      // (`ref={el}` sets it, outside the boundary too, a reassigned let) is
      // read through a getter (a call makes the prop dynamic), so the chunk
      // sees its current value
      parts.push(` ${propOf.get(c)}={(() => `, { sym: c }, ')()}')
    } else {
      parts.push(` ${propOf.get(c)}={`, { sym: c }, '}')
    }
    placeholderSyms.push(c)
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
    placeholderSyms.push(s.sym)
  }
  parts.push('/>')
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
    readAt,
  })
  return { sym: lazy, chunk: chunkId }
}

/** The parent's lazy const, with an `auto` home: placement places it by the removal rule (a boundary in a split component homes with it). */
function addLazyConst(
  ctx: PlanContext,
  b: Boundary,
  { lazyImport }: BoundaryNames,
  lazy: SymbolId,
  chunkId: string,
): void {
  const spec = sameFileSpecifier(chunkId)
  const router = `@tanstack/${b.framework}-router`
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
        },
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// fallback (server envs)
// ---------------------------------------------------------------------------

/** Erases a statically visible `fallback` (what only it read goes with it: the core's removal). */
function stripFallback(ctx: PlanContext, b: Boundary): void {
  const erase = (range: Range) => {
    ctx.rewrites.edit({
      range,
      body: [],
      by: HYDRATE_PLANNER,
    })
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
      // with their commas (a lone `fallback: …,` leaves `{}`, not `{ , }`)
      const props = obj.properties as ReadonlyArray<Node>
      const fallbacks = new Set(
        props.filter((p) => isNamedProperty(p, 'fallback')),
      )
      if (fallbacks.size > 0) {
        removeListItems(
          ctx,
          props,
          (p) => fallbacks.has(p),
          fallbacks,
          listEnd(ctx.analysis.source.code, props),
          HYDRATE_PLANNER,
        )
      }
    }
  }
}

/** The object literal a spread passes: inline, or a single-use unexported `const`. */
function spreadObject(
  ctx: PlanContext,
  argument: Node,
): ObjectExpression | null {
  const arg = unwrapExpression(argument)
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
  const init = unwrapExpression(declarator.init)
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
