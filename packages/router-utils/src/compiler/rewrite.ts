/**
 * The regions and the rewrite tree (see README.md, "Units, regions, edits").
 *
 * Planners emit `Edit`s against original ranges whose bodies are fragments:
 * slices of the range they rewrite (rendered with what the output does
 * inside them), structured text (string parts and `SymRef`s), glue specifier
 * literals (`spec`) and context-aware reference rewrites (`ref`). Generated
 * units own claimed regions (`{ k: 'region' }`); the region renders inside
 * the owner wherever the owner is homed and a placeholder renders at the
 * original occurrence.
 *
 * The plan owns one region tree (`RegionTable`): the module, its regions and
 * the range of every edit, shared by every output, so that two ranges nest
 * or are disjoint whatever outputs their edits are scoped to. What an output
 * renders of the source (`OutputView`) is one walk of that tree
 * (`OutputView.walk`), whose visitors are the renderer, placement's reads and
 * the erased parts; the point questions climb it from a position's innermost
 * range.
 */
import type { Range } from './header'
import type { ClassifiedRef, RefContext } from './analysis'
import type { SymbolId } from './symbols'
import type { RegionId, UnitId } from './units'

export type OutputId = 'env' | `derived:${string}`

/** The module id of a derived output (`derived:<id>`). */
export function derivedIdOf(output: OutputId): string {
  return output.slice('derived:'.length)
}
export type EditScope = 'all-outputs' | ReadonlyArray<OutputId>
export type RefTarget =
  | { sym: SymbolId }
  | { member: [SymbolId, ...Array<string>] }
/**
 * How a `SymRef` renders: the binding's name (`expr`, `callee`, `jsxTag`),
 * or `homeId`: a string literal of the id of the module the output takes the
 * binding from (its own id when it holds the binding), decided by placement.
 */
export type SymRefContext = 'expr' | 'callee' | 'jsxTag' | 'homeId'
export interface SymRef {
  sym: SymbolId
  ctx?: SymRefContext
}

export type EdgeProvenance =
  | { origin: 'source' }
  | {
      origin: 'forwarded'
      importerId: string
      span: Range
      rawSpecifier: string
    }
  | { origin: 'runtime' }

/**
 * A fragment of an edit's body or of a placeholder. Source text enters a body
 * only as a slice of the range the edit rewrites (it renders with what the
 * output does inside it: `OutputView.walk`).
 */
export type Frag =
  | { k: 'slice'; range: Range }
  | TextFrag
  | {
      k: 'spec'
      specifier: string
      edgeKey: string
      /** Policy-relevant facts of the glue edge (glue replacing a user import is policy-checked). Default: runtime (exempt). */
      provenance?: EdgeProvenance
      names?: ReadonlyArray<string>
      /** Edge form of the glue literal (default 'static'). */
      form?: 'static' | 'dynamic'
    }
  | {
      k: 'ref'
      range: Range
      to: RefTarget
      ctx: RefContext
      exportShorthand?: boolean
    }

export type TextFrag = {
  k: 'text'
  parts: ReadonlyArray<string | SymRef>
  mapTo?: number
  declares?: ReadonlyArray<SymbolId>
}

/** A claimed region, whole: its text, rendered by its owner. */
export type RegionFrag = { k: 'region'; id: RegionId }

/**
 * A fragment of a generated unit. It names source text only as a region it
 * claims (`RegionFrag`), never as a slice: the region renders with every edit
 * of the output inside it.
 */
export type GenFrag = Exclude<Frag, { k: 'slice' }> | RegionFrag

interface Edit {
  range: Range
  body: ReadonlyArray<Frag>
  scope: EditScope
  by: string
}

export type GenUnitId = number

export type Anchor =
  | { k: 'after-header' }
  | { k: 'before-unit' | 'after-unit'; unit: UnitId }
  | { k: 'end' }

export type SubstEnv = ReadonlyMap<SymbolId, RefTarget>

/**
 * Where a generated unit goes: `auto` (placement decides), one output, or
 * `env-readers`: every derived output that imports a binding of the env
 * module other than `besides`, decided once inclusion is (route HMR's
 * registration of the chunks that read what the route module keeps). Such a
 * unit declares nothing, owns no claim and reads only its own imports, so
 * where it goes changes nothing else.
 */
export type GeneratedHome =
  | 'auto'
  | OutputId
  | { k: 'env-readers'; besides: ReadonlyArray<SymbolId> }

export interface GeneratedUnit {
  id: GenUnitId
  body: ReadonlyArray<GenFrag>
  declares: ReadonlyArray<SymbolId>
  effectful: boolean
  anchor: Anchor
  home: GeneratedHome
  env?: SubstEnv
  by: string
  /** Glue imports this unit needs (`import { x } from '<spec>'`, rendered with the output's imports). */
  imports?: ReadonlyArray<GlueImport>
}

export interface GlueImport {
  /** Imported name → local symbol (declared by this import in the output). */
  names: ReadonlyArray<{ imported: string; local: SymbolId }>
  spec: Extract<Frag, { k: 'spec' }>
}

interface RegionClaim {
  region: RegionId
  owner: GenUnitId
  placeholder: ReadonlyArray<Frag>
  by: string
  /**
   * What the claimed text is, in a message's words (`a server function
   * written in place, …`): a later planner that would claim exactly the
   * same text reports it at that text instead (two claims on one range have
   * no order).
   */
  subject?: string
}

// ---- regions ------------------------------------------------------------------

export type RegionKind =
  | 'unit'
  | 'option-value'
  | 'hydrate-children'
  | 'nested-chain'
  | 'custom'

/**
 * A placement member's text in the source: a unit, or a sub-region a
 * planner registers (its node in the tree). How regions nest is the tree's
 * (`RegionTable.parentOf`, `childrenOf`, `innermostAt`).
 */
export interface Region {
  id: RegionId
  range: Range
  kind: RegionKind
  unit: UnitId | null
}

export interface PlannerEdit extends Edit {
  n: number
}

/**
 * A range of the region tree: the module, a sub-region, the range of
 * planner edits, or several of them (one node per range). Nodes nest or are
 * disjoint, and nest or are disjoint with the units (`RegionTable.node`).
 * Zero-width ranges (inserts) are no nodes: they render at their position,
 * whose bytes decide whether they do.
 */
export interface RangeNode {
  readonly start: number
  readonly end: number
  parent: RangeNode | null
  /** Sorted by start, disjoint. */
  children: Array<RangeNode>
  /** What first addressed the range (a conflict names it). */
  readonly by: string
  /** The planner edits on exactly this range, of every scope, in call order. */
  edits: Array<PlannerEdit> | null
  /** The claim of the region on exactly this range (a second one is a conflict). */
  claim: RegionClaim | null
  /** The region on exactly this range, if any (a placement member). */
  region: RegionId | null
  /** Whether this node or one inside it holds an edit or a claim (the others decide nothing: every walk skips them). */
  marked: boolean
}

/**
 * The regions of one plan and its region tree. Each unit is the region of
 * its id; planners register sub-regions (`register`), the rewrite set the
 * ranges of its edits (`node`). Registering a range that partly overlaps
 * another one throws, whatever outputs their edits are scoped to.
 *
 * Placement reads the regions (units and sub-regions, each under the
 * innermost region holding it: `parent`, `children`, `innermostAt`); the
 * ranges of edits are tree nodes only.
 */
export class RegionTable {
  readonly regions: Array<Region> = []
  /** Unit regions sorted by start (disjoint). */
  private readonly unitRegions: Array<Region> = []
  /** Sub-regions by `start:end:kind` (one region per range and kind). */
  private readonly subRegionByKey = new Map<string, RegionId>()
  private readonly root: RangeNode
  /** The nodes by start (several start at one offset only when nested). */
  private readonly nodes = new Map<number, RangeNode | Array<RangeNode>>()
  /** `childrenOf`, per region (reset when a region or a node is added). */
  private nested: Array<ReadonlyArray<RegionId> | undefined> | null = null

  constructor(
    length: number,
    units: ReadonlyArray<{ id: UnitId; range: Range }>,
  ) {
    this.root = {
      start: 0,
      end: length,
      parent: null,
      children: [],
      by: 'the module',
      edits: null,
      claim: null,
      region: null,
      marked: false,
    }
    this.nodes.set(0, this.root)
    for (const u of units) {
      const r: Region = {
        id: this.regions.length,
        range: u.range,
        kind: 'unit',
        unit: u.id,
      }
      this.regions.push(r)
      this.unitRegions.push(r)
    }
  }

  /** Registers a sub-region: its node of the tree. */
  register(range: Range, kind: Exclude<RegionKind, 'unit'>): RegionId {
    const key = `${range.start}:${range.end}:${kind}`
    const existing = this.subRegionByKey.get(key)
    if (existing !== undefined) {
      return existing
    }
    const node = this.node(range, `a ${kind} region`)!
    const id = this.regions.length
    this.regions.push({ id, range, kind, unit: null })
    this.subRegionByKey.set(key, id)
    // (a sub-region on exactly a unit's range is the innermost of the two)
    if (node.region === null || this.regions[node.region]!.unit !== null) {
      node.region = id
    }
    this.nested = null
    return id
  }

  get(id: RegionId): Region {
    return this.regions[id]!
  }

  /** The unit region holding `[start, end)` (a zero-width range: the byte at `start`), if any. */
  private unitAt(start: number, end: number): Region | null {
    const i = this.lastUnitStartingBy(start)
    const u = i < 0 ? null : this.unitRegions[i]!
    return u === null || Math.max(end, start + 1) > u.range.end ? null : u
  }

  /** The innermost region containing `[start, end)` (a zero-width range: the byte at `start`). */
  innermostAt(start: number, end: number = start): RegionId | null {
    const unit = this.unitAt(start, end)
    if (unit === null) {
      return null
    }
    let found = unit.id
    let node = this.root
    for (;;) {
      const c = node.children[lastStartingBy(node.children, start)]
      if (
        c === undefined ||
        Math.max(end, start) > c.end ||
        (end <= start && start >= c.end)
      ) {
        return found
      }
      if (c.region !== null) {
        found = c.region
      }
      node = c
    }
  }

  /** The region a region nests in (null: a unit). */
  parentOf(id: RegionId): RegionId | null {
    const r = this.regions[id]!
    if (r.unit !== null) {
      return null
    }
    const node = this.nodeOn(r.range)!
    for (let x = node.parent; x !== null; x = x.parent) {
      if (x.region !== null) {
        return x.region
      }
    }
    return this.unitAt(r.range.start, r.range.end)?.id ?? null
  }

  /** The regions nesting directly in a region (in source order). */
  childrenOf(id: RegionId): ReadonlyArray<RegionId> {
    const nested = (this.nested ??= [])
    const hit = nested[id]
    if (hit !== undefined) {
      return hit
    }
    const list: Array<RegionId> = []
    const { start, end } = this.regions[id]!.range
    const own = this.nodeOn({ start, end })
    const into = (x: RangeNode) => {
      for (
        let i = Math.max(0, lastStartingBy(x.children, start));
        i < x.children.length;
        i++
      ) {
        const c = x.children[i]!
        if (c.start >= end) {
          break
        }
        if (c.start < start || c.end > end) {
          continue
        }
        if (c.region !== null && c.region !== id) {
          list.push(c.region)
        } else {
          into(c)
        }
      }
    }
    if (own !== null && own.region === id) {
      into(own)
    } else {
      // a unit, or a region without the node of its range (another one's)
      let x = this.root
      for (;;) {
        const c = x.children[lastStartingBy(x.children, start)]
        if (
          c === undefined ||
          c.end < end ||
          (c.start === start && c.end === end)
        ) {
          break
        }
        x = c
      }
      into(x)
    }
    nested[id] = list
    return list
  }

  /** The index of the last unit region starting at or before `offset` (-1: none). */
  private lastUnitStartingBy(offset: number): number {
    const units = this.unitRegions
    let lo = 0
    let hi = units.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (units[mid]!.range.start <= offset) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found
  }

  /** The innermost region owning a reference. */
  ownerOf(ref: ClassifiedRef): RegionId {
    const id = this.innermostAt(ref.range.start, ref.range.end)
    if (id === null) {
      throw new Error(`reference at ${ref.range.start} is outside every region`)
    }
    return id
  }

  /** The unit holding a region. */
  unitOf(id: RegionId): UnitId | null {
    const r = this.regions[id]!
    return r.unit ?? this.unitAt(r.range.start, r.range.end)?.unit ?? null
  }

  /**
   * The tree node on exactly `range`, added under the innermost node holding
   * it (none for an empty range). A range that partly overlaps another one
   * is a conflict.
   */
  node(range: Range, by: string): RangeNode | null {
    const { start, end } = range
    if (end <= start) {
      return null
    }
    const hit = this.nodeOn(range)
    if (hit !== null) {
      return hit
    }
    if (start < 0 || end > this.root.end) {
      throw new Error(
        `conflict: ${by} [${start}, ${end}) is outside the module [0, ${this.root.end})`,
      )
    }
    // the units (disjoint, in source order) are ranges of the tree too: they
    // hold no edit of their own, so they are checked here rather than kept
    // as nodes (a node on exactly a unit's range is one of an edit or a claim)
    let unit: RegionId | null = null
    const units = this.unitRegions
    for (
      let k = Math.max(0, this.lastUnitStartingBy(start));
      k < units.length;
      k++
    ) {
      const u = units[k]!.range
      if (u.start >= end) {
        break
      }
      if (u.start === start && u.end === end) {
        unit = units[k]!.id
      }
      if (
        u.end > start &&
        !(u.start <= start && u.end >= end) &&
        !(u.start >= start && u.end <= end)
      ) {
        throw new Error(
          `conflict: ${by} [${start}, ${end}) partially overlaps unit ${units[k]!.unit} [${u.start}, ${u.end})`,
        )
      }
    }
    let parent = this.root
    for (;;) {
      const c = parent.children[lastStartingBy(parent.children, start)]
      if (c === undefined || c.end < end) {
        break
      }
      parent = c
    }
    const siblings = parent.children
    const last = siblings[siblings.length - 1]
    if (last === undefined || last.end <= start) {
      // (after every child)
      const node: RangeNode = {
        start,
        end,
        parent,
        children: [],
        by,
        edits: null,
        claim: null,
        region: unit,
        marked: false,
      }
      siblings.push(node)
      this.index(node)
      this.nested = null
      return node
    }
    // the children inside the new range move under it; one cut by it conflicts
    let i = lastStartingBy(siblings, start)
    if (i < 0 || siblings[i]!.end <= start) {
      i++
    }
    let j = i
    while (j < siblings.length && siblings[j]!.start < end) {
      const c = siblings[j]!
      if (c.start < start || c.end > end) {
        throw new Error(
          `conflict: ${by} [${start}, ${end}) partially overlaps ${c.by} [${c.start}, ${c.end})`,
        )
      }
      j++
    }
    const node: RangeNode = {
      start,
      end,
      parent,
      children: siblings.splice(i, j - i),
      by,
      edits: null,
      claim: null,
      region: unit,
      marked: false,
    }
    siblings.splice(i, 0, node)
    for (const c of node.children) {
      c.parent = node
      node.marked ||= c.marked
    }
    this.index(node)
    this.nested = null
    return node
  }

  /** The tree node on exactly `range`, if any. */
  nodeOn(range: Range): RangeNode | null {
    const at = this.nodes.get(range.start)
    if (at === undefined) {
      return null
    }
    if (!Array.isArray(at)) {
      return at.end === range.end ? at : null
    }
    for (const n of at) {
      if (n.end === range.end) {
        return n
      }
    }
    return null
  }

  private index(node: RangeNode): void {
    const at = this.nodes.get(node.start)
    if (at === undefined) {
      this.nodes.set(node.start, node)
    } else if (Array.isArray(at)) {
      at.push(node)
    } else {
      this.nodes.set(node.start, [at, node])
    }
  }

  /** Whether the tree holds an edit or a claim at all. */
  get marked(): boolean {
    return this.root.marked
  }

  /** The module's node. */
  get module(): RangeNode {
    return this.root
  }

  /** Marks `node` and the nodes around it as holding an edit or a claim. */
  mark(node: RangeNode): void {
    for (
      let n: RangeNode | null = node;
      n !== null && !n.marked;
      n = n.parent
    ) {
      n.marked = true
    }
  }

  /** The innermost marked tree node holding the byte at `offset` (none past the module's end). */
  nodeAt(offset: number): RangeNode | null {
    if (offset < 0 || offset >= this.root.end) {
      return null
    }
    let node = this.root
    while (node.marked) {
      const children = node.children
      // (the last child starting at or before `offset`; a short list is read in order)
      let c: RangeNode | undefined
      if (children.length <= 8) {
        for (const x of children) {
          if (x.start > offset) {
            break
          }
          c = x
        }
      } else {
        c = children[lastStartingBy(children, offset)]
      }
      if (c === undefined || c.end <= offset || !c.marked) {
        break
      }
      node = c
    }
    return node
  }

  /** The innermost marked tree node holding `range` whole (the root at least). */
  nodeAround(range: Range): RangeNode {
    let node = this.root
    while (node.marked) {
      const c = node.children[lastStartingBy(node.children, range.start)]
      if (c === undefined || c.end < range.end || !c.marked) {
        break
      }
      node = c
    }
    return node
  }
}

/** The index of the last node starting at or before `offset` (-1: none). */
function lastStartingBy(
  nodes: ReadonlyArray<RangeNode>,
  offset: number,
): number {
  let lo = 0
  let hi = nodes.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (nodes[mid]!.start <= offset) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

// ---- edits ----------------------------------------------------------------

/**
 * The order of the core's edits of one range and of the inserts at one
 * position (`compareCoreEdits`): the lower is the outer edit and the first
 * insert. By band, then by `n` within it, then `nested`:
 * - `planner`: planner edits, `n` in call order;
 * - `claim`: a claim's placeholder, `n` its region, after the planners' so that
 *   a planner edit scoped to one output on exactly the claimed region replaces
 *   it there; an edit addressed to every output on exactly that region shares
 *   its `n` and is `nested` inside it;
 * - `lineEnd`: the line end a statement needs, before anything else generated
 *   at that position;
 * - `glueImports`: the core's glue imports;
 * - `core`: the core's own edits of an output (statement-level removals,
 *   generated units, export glue), `n` in call order.
 */
export const EditBand = {
  planner: 0,
  claim: 1,
  lineEnd: 2,
  glueImports: 3,
  core: 4,
} as const
export type EditBand = (typeof EditBand)[keyof typeof EditBand]

export interface EditOrder {
  band: EditBand
  n: number
  nested?: boolean
}

export function compareEditOrder(a: EditOrder, b: EditOrder): number {
  return (
    a.band - b.band ||
    a.n - b.n ||
    Number(a.nested === true) - Number(b.nested === true)
  )
}

/**
 * A core edit of one output, laid over its walk (`WalkOptions.core`): the
 * env module's statement-level edits, its generated units at their anchors,
 * its glue. Sorted by `compareCoreEdits`.
 */
export interface CoreEdit extends EditOrder {
  range: Range
  body: ReadonlyArray<Frag | GenFrag>
  by: string
  /** The generated unit whose body this is. */
  gen?: GenUnitId
}

/** The walk's order of core edits: by start, inserts first, the outer range first, then by band and number. */
export function compareCoreEdits(a: CoreEdit, b: CoreEdit): number {
  return (
    a.range.start - b.range.start ||
    Number(b.range.start === b.range.end) -
      Number(a.range.start === a.range.end) ||
    b.range.end - a.range.end ||
    compareEditOrder(a, b)
  )
}

/**
 * What a walk of an output's text meets at one level of the tree, in render
 * order (`OutputView.walk`).
 */
export interface WalkVisitor {
  /** The source text of `[start, end)` renders here. */
  source: (start: number, end: number) => void
  /** An active node renders here, whole: its place (`OutputView.placeOf`, else its text). */
  node: (n: RangeNode) => void
  /** An insert renders here. */
  insert: (e: PlannerEdit) => void
  /**
   * A node on exactly a region (a placement member) the walk would enter or
   * render: true when the visitor takes it (the walk goes past it).
   */
  member?: (n: RangeNode) => boolean
}

export interface WalkOptions {
  /** The inserts at this offset render before the edit whose body is walked (its start). */
  skipAt?: number | null
  /** What is inserted at the module's end renders too (the env module). */
  includeEnd?: boolean
  /** Core edits laid over the walk (sorted: `compareCoreEdits`), each rendered by `visit` at the level that holds it. */
  core?: {
    edits: ReadonlyArray<CoreEdit>
    visit: (x: CoreEdit, level: RangeNode) => void
  } | null
}

const NO_OPTIONS: WalkOptions = {}
const NO_CORE: ReadonlyArray<CoreEdit> = []

export class RewriteSet {
  readonly edits: Array<PlannerEdit> = []
  /** The inserts (zero-width edits), by position then call order. */
  readonly inserts: Array<PlannerEdit> = []
  readonly generated: Array<GeneratedUnit> = []
  readonly claims = new Map<RegionId, RegionClaim>()
  /** The nodes holding two edits or more (`checkConflicts`). */
  private readonly shared: Array<RangeNode> = []
  private nextEdit = 0
  private changes = 0
  private views = new Map<OutputId, OutputView>()
  private envView: OutputView | undefined
  private owners: { version: number; owners: ReadonlySet<GenUnitId> } | null =
    null

  constructor(readonly regions: RegionTable) {}

  add(edit: Edit): void {
    const e = { ...edit, n: this.nextEdit++ }
    if (edit.range.end <= edit.range.start) {
      // (after the inserts at its position: in call order)
      const inserts = this.inserts
      let lo = 0
      let hi = inserts.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (inserts[mid]!.range.start <= e.range.start) {
          lo = mid + 1
        } else {
          hi = mid
        }
      }
      inserts.splice(lo, 0, e)
    } else {
      const node = this.regions.node(edit.range, edit.by)!
      const edits = (node.edits ??= [])
      edits.push(e)
      if (edits.length === 2) {
        this.shared.push(node)
      }
      this.regions.mark(node)
    }
    this.edits.push(e)
    this.bump()
  }

  addGenerated(unit: Omit<GeneratedUnit, 'id'>): GenUnitId {
    if (typeof unit.home === 'object') {
      const own = new Set(
        unit.imports?.flatMap((i) => i.names.map((n) => n.local)),
      )
      const readsOwn = unit.body.every(
        (f) =>
          f.k === 'text' &&
          f.parts.every((p) => typeof p === 'string' || own.has(p.sym)),
      )
      if (unit.declares.length > 0 || unit.env || !readsOwn) {
        throw new Error(
          `generated unit of ${unit.by}: a unit for the env module's readers declares nothing and reads only its own imports`,
        )
      }
    }
    const id = this.generated.length
    this.generated.push({ ...unit, id })
    this.bump()
    return id
  }

  claim(claim: RegionClaim): void {
    if (typeof this.generated[claim.owner]!.home === 'object') {
      throw new Error(
        `region ${claim.region}: a unit for the env module's readers owns no claim (${claim.by})`,
      )
    }
    const prev = this.claims.get(claim.region)
    if (prev) {
      throw new Error(
        `region ${claim.region} is claimed twice (by ${prev.by} and ${claim.by})`,
      )
    }
    const node = this.regions.node(
      this.regions.get(claim.region).range,
      claim.by,
    )!
    if (node.claim !== null) {
      throw new Error(
        `conflict: two claims on [${node.start}, ${node.end}) (by ${node.claim.by} and ${claim.by})`,
      )
    }
    this.claims.set(claim.region, claim)
    node.claim = claim
    this.regions.mark(node)
    this.bump()
  }

  /** The claim on exactly `range`, if any (a second claim there is a conflict: `RegionClaim.subject`). */
  claimOn(range: Range): RegionClaim | undefined {
    return this.regions.nodeOn(range)?.claim ?? undefined
  }

  /** Rewrites one reference, context-aware (shorthand properties, import/export names, JSX tags, assignment targets). */
  ref(ref: ClassifiedRef, to: RefTarget, scope: EditScope, by: string): void {
    this.add({
      range: ref.range,
      body: [
        {
          k: 'ref',
          range: ref.range,
          to,
          ctx: ref.ctx,
          exportShorthand: ref.exportShorthand,
        },
      ],
      scope,
      by,
    })
  }

  /** Rewrites a declaration name (`declName` ctx; identifier targets only). */
  declName(range: Range, to: RefTarget, scope: EditScope, by: string): void {
    this.add({
      range,
      body: [{ k: 'ref', range, to, ctx: 'declName' }],
      scope,
      by,
    })
  }

  private bump(): void {
    this.changes++
  }

  /** Bumped by every change of the set (`OutputView` is read for one version). */
  get version(): number {
    return this.changes
  }

  /** Whether `output` is in `scope`. */
  static inScope(scope: EditScope, output: OutputId): boolean {
    return scope === 'all-outputs' || scope.includes(output)
  }

  /** What `output` renders of the source. */
  view(output: OutputId): OutputView {
    if (output === 'env') {
      return (this.envView ??= new OutputView(this, 'env'))
    }
    let view = this.views.get(output)
    if (view === undefined) {
      view = new OutputView(this, output)
      this.views.set(output, view)
    }
    return view
  }

  /**
   * Throws the conflict of two edits on one range that render differently
   * in one of `outputs`, rendered or not (the walk finds those it renders).
   */
  checkConflicts(outputs: Iterable<OutputId>): void {
    if (this.shared.length === 0) {
      return
    }
    for (const o of outputs) {
      const view = this.view(o)
      for (const node of this.shared) {
        view.textOf(node)
        view.placeOf(node)
      }
    }
  }

  /** The claim owners other generated code (another unit, another placeholder) reads a symbol of. */
  readOwners(): ReadonlySet<GenUnitId> {
    if (this.owners !== null && this.owners.version === this.version) {
      return this.owners.owners
    }
    const ownerOf = new Map<SymbolId, GenUnitId>()
    for (const { owner } of this.claims.values()) {
      for (const s of this.generated[owner]!.declares) {
        ownerOf.set(s, owner)
      }
    }
    const owners = new Set<GenUnitId>()
    const scan = (by: GenUnitId, frags: ReadonlyArray<Frag | GenFrag>) => {
      for (const f of frags) {
        if (f.k !== 'text') {
          continue
        }
        for (const p of f.parts) {
          const o = typeof p === 'string' ? undefined : ownerOf.get(p.sym)
          if (o !== undefined && o !== by) {
            owners.add(o)
          }
        }
      }
    }
    for (const g of this.generated) {
      scan(g.id, g.body)
    }
    for (const c of this.claims.values()) {
      scan(c.owner, c.placeholder)
    }
    this.owners = { version: this.version, owners }
    return owners
  }

  liveness(output: OutputId): LivenessView {
    const view = this.view(output)
    return {
      live: (ref) => !view.isErasedAt(ref.range.start),
      isErased: (range) => view.isErasedRange(range),
    }
  }
}

export interface LivenessView {
  live: (ref: ClassifiedRef) => boolean
  isErased: (range: Range) => boolean
}

function fragsEqual(
  a: ReadonlyArray<Frag | GenFrag>,
  b: ReadonlyArray<Frag | GenFrag>,
): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** Whether a body erases the original byte at `offset` of its range (no slice or reference of it keeps it). */
export function erases(
  body: ReadonlyArray<Frag | GenFrag>,
  offset: number,
): boolean {
  for (const f of body) {
    if (
      (f.k === 'slice' || f.k === 'ref') &&
      f.range.start <= offset &&
      offset < f.range.end
    ) {
      return false
    }
  }
  return true
}

/** How much of `range` a body keeps (its slices and references). */
function keeps(
  body: ReadonlyArray<Frag>,
  range: Range,
): 'all' | 'none' | 'partial' {
  let any = false
  for (const f of body) {
    if (f.k !== 'slice' && f.k !== 'ref') {
      continue
    }
    if (f.range.start <= range.start && range.end <= f.range.end) {
      return 'all'
    }
    if (f.range.start < range.end && range.start < f.range.end) {
      any = true
    }
  }
  return any ? 'partial' : 'none'
}

/** The index of the first item starting at or after `offset`. */
function firstFrom(
  items: ReadonlyArray<{ range: Range }>,
  offset: number,
): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid]!.range.start < offset) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/**
 * What one output renders of the source, read on the region tree.
 *
 * Per node: its text (`textOf`: an edit's body, else its source with the
 * nodes inside it) and its place (`placeOf`: what stands where it is
 * written; a kept claim's placeholder, or the edit scoped to this output
 * that replaces it). A claim is kept unless an erasing edit strictly
 * encloses its occurrence; one whose owner other generated code reads
 * (`readOwners`: the provider's hoisted server fn its RPC wrapper calls) is a
 * declaration in its own right and stays then, without its placeholder (read
 * elsewhere). An edit addressed to every output on exactly a claimed region
 * is the region's text: it renders where the region does, inside its owner.
 *
 * Source text enters the output through one walk (`walk`): the renderer,
 * placement's reads and the erased parts are its visitors. The point
 * questions (`isErasedAt`, …) climb from a position's innermost range to the
 * root, reading the same edits and claims (memoised per claim for one
 * version of the set).
 */
export class OutputView {
  private version = -1
  /** Per claim: an erasing edit strictly encloses its occurrence. */
  private readonly erasedClaims = new Map<RegionClaim, boolean>()
  /** `erasedParts`, for this version. */
  private erased: Array<Range> | null = null

  constructor(
    private readonly set: RewriteSet,
    readonly output: OutputId,
  ) {}

  private sync(): void {
    if (this.version !== this.set.version) {
      this.version = this.set.version
      this.erasedClaims.clear()
      this.erased = null
    }
  }

  // ---- what a node renders ------------------------------------------------

  /**
   * The body a node's text is in this output (null: its source): the edit in
   * scope on exactly its range, or, on a claimed region, the edit addressed
   * to every output (it travels with the region). Two that differ conflict.
   */
  textOf(n: RangeNode): ReadonlyArray<Frag> | null {
    const edits = n.edits
    if (edits === null) {
      return null
    }
    const claimed = n.claim !== null
    let found: PlannerEdit | null = null
    for (const e of edits) {
      if (
        claimed
          ? e.scope !== 'all-outputs'
          : !RewriteSet.inScope(e.scope, this.output)
      ) {
        continue
      }
      found = same(found, e, n)
    }
    return found === null ? null : found.body
  }

  /**
   * What stands at a claimed node's place in this output (null: its text):
   * the edit scoped to this output on exactly the region, else the
   * placeholder of a kept claim.
   */
  placeOf(n: RangeNode): ReadonlyArray<Frag> | null {
    const claim = n.claim
    if (claim === null) {
      return null
    }
    let found: PlannerEdit | null = null
    for (const e of n.edits ?? NO_EDITS) {
      if (e.scope !== 'all-outputs' && e.scope.includes(this.output)) {
        found = same(found, e, n)
      }
    }
    if (found !== null) {
      return found.body
    }
    return this.keeps(claim) ? claim.placeholder : null
  }

  /** Whether a node renders otherwise than its source: a walk renders it whole, never through it. */
  active(n: RangeNode): boolean {
    return (
      (n.edits !== null || n.claim !== null) &&
      (this.placeOf(n) !== null || this.textOf(n) !== null)
    )
  }

  // ---- the walk -------------------------------------------------------------

  /**
   * Walks `[start, end)` of node `level`'s text (its source, or a slice an
   * edit of it keeps) in render order: the source between the nodes inside
   * it, the active nodes whole (`placeOf`/`textOf` say what), the inserts
   * belonging to it. A node that renders as its source is walked through
   * (its source continues the text around it). An insert belongs to the
   * innermost node strictly holding its position (the module holds its two
   * ends). A slice that cuts an active node is a conflict: it would copy the
   * text that node rewrites.
   */
  walk(
    level: RangeNode,
    start: number,
    end: number,
    v: WalkVisitor,
    opts: WalkOptions = NO_OPTIONS,
  ): void {
    const st = { pos: start }
    this.walkLevel(level, start, end, v, opts, st)
    if (end > st.pos) {
      v.source(st.pos, end)
    }
  }

  private walkLevel(
    level: RangeNode,
    a: number,
    b: number,
    v: WalkVisitor,
    opts: WalkOptions,
    st: { pos: number },
  ): void {
    const output = this.output
    const root = level.parent === null
    const children = level.children
    const inserts = this.set.inserts
    const core = opts.core?.edits ?? NO_CORE
    const skipAt = opts.skipAt ?? null
    // the zero-width items rendering at this level of the span start in
    // `[a, lastAt]` (from `a`: the cursors start there), but at `skipAt` and,
    // inside the module, at the level's ends (they belong to the level around)
    const lastAt = root && opts.includeEnd === true ? b : b - 1
    const ownStart = root ? -1 : level.start
    const ownEnd = root ? -1 : level.end
    let ci =
      children.length === 0 ? 0 : Math.max(0, lastStartingBy(children, a))
    let ii = inserts.length === 0 ? 0 : firstFrom(inserts, a)
    let xi = core.length === 0 ? 0 : firstFrom(core, a)
    /** Where what this level walked ends: an item starting before it is inside it. */
    let cover = a
    /** The active node walked last (a core edit on exactly its range is the same edit or a conflict). */
    let last: RangeNode | null = null
    for (;;) {
      let c: RangeNode | undefined
      while (ci < children.length) {
        const x = children[ci]!
        if (x.end <= a || !x.marked) {
          ci++
          continue
        }
        if (x.start < b) {
          c = x
        }
        break
      }
      let ins: PlannerEdit | undefined = inserts[ii]
      if (ins !== undefined && ins.range.start > b) {
        ins = undefined
      }
      let x: CoreEdit | undefined = core[xi]
      if (
        x !== undefined &&
        (x.range.start > b ||
          (x.range.start === b && x.range.end > x.range.start))
      ) {
        x = undefined
      }
      if (c === undefined && ins === undefined && x === undefined) {
        return
      }
      // the next item: by position, inserts first (the planners' before the
      // core's), then the outer range (an active node before a core edit on
      // exactly its range, a core edit before a node it renders through)
      const xZero = x !== undefined && x.range.end === x.range.start
      let pick: 'insert' | 'core' | 'child'
      const pIns = ins?.range.start ?? Infinity
      const pX = x?.range.start ?? Infinity
      const pC = c?.start ?? Infinity
      const p = Math.min(pIns, pX, pC)
      if (pIns === p) {
        pick = 'insert'
      } else if (pX === p && xZero) {
        pick = 'core'
      } else if (pX === p && pC === p) {
        pick =
          x!.range.end > c!.end || (x!.range.end === c!.end && !this.active(c!))
            ? 'core'
            : 'child'
      } else {
        pick = pX === p ? 'core' : 'child'
      }
      if (pick === 'insert') {
        ii++
        const at = ins!.range.start
        if (
          at >= cover &&
          at <= lastAt &&
          at !== skipAt &&
          at !== ownStart &&
          at !== ownEnd &&
          RewriteSet.inScope(ins!.scope, output)
        ) {
          if (at > st.pos) {
            v.source(st.pos, at)
            st.pos = at
          }
          v.insert(ins!)
        }
        continue
      }
      if (pick === 'core') {
        xi++
        const { start, end } = x!.range
        if (xZero) {
          if (
            start >= cover &&
            start <= lastAt &&
            start !== skipAt &&
            start !== ownStart &&
            start !== ownEnd
          ) {
            if (start > st.pos) {
              v.source(st.pos, start)
              st.pos = start
            }
            opts.core!.visit(x!, level)
          }
          continue
        }
        if (start < cover) {
          if (end > cover) {
            throw new Error(
              `conflict: ${x!.by} [${start}, ${end}) partially overlaps what renders before it [${a}, ${cover})`,
            )
          }
          if (
            last !== null &&
            last.start === start &&
            last.end === end &&
            !fragsEqual((this.placeOf(last) ?? this.textOf(last))!, x!.body)
          ) {
            throw new Error(
              `conflict: ${last.by} and ${x!.by} both rewrite [${start}, ${end}) with different bodies`,
            )
          }
          continue
        }
        if (start < a || end > b) {
          if (start <= a && end >= b) {
            continue // (the core edit whose body is walked)
          }
          throw new Error(
            `conflict: ${x!.by} [${start}, ${end}) partially overlaps [${a}, ${b})`,
          )
        }
        if (start > st.pos) {
          v.source(st.pos, start)
        }
        opts.core!.visit(x!, level)
        st.pos = end
        cover = end
        continue
      }
      ci++
      const n = c!
      if (n.start < a || n.end > b) {
        if (this.active(n)) {
          throw new Error(
            `conflict: the text [${a}, ${b}) cuts ${n.by} [${n.start}, ${n.end}), which renders otherwise`,
          )
        }
        this.walkLevel(n, Math.max(a, n.start), Math.min(b, n.end), v, opts, st)
        cover = Math.min(b, n.end)
        continue
      }
      if (n.start < cover) {
        if (n.end <= cover) {
          continue // (inside a core edit walked before it)
        }
        throw new Error(
          `conflict: ${n.by} [${n.start}, ${n.end}) partially overlaps what renders before it [${a}, ${cover})`,
        )
      }
      if (n.region !== null && v.member !== undefined) {
        if (n.start > st.pos) {
          v.source(st.pos, n.start)
          st.pos = n.start
        }
        if (v.member(n)) {
          st.pos = n.end
          cover = n.end
          continue
        }
      }
      if (this.active(n)) {
        if (n.start > st.pos) {
          v.source(st.pos, n.start)
          st.pos = n.start
        }
        v.node(n)
        st.pos = n.end
        last = n
      } else {
        this.walkLevel(n, n.start, n.end, v, opts, st)
      }
      cover = n.end
    }
  }

  // ---- the parts that render nowhere ---------------------------------------

  /** The erased parts of this output (for provenance; found once per version). */
  erasedParts(): ReadonlyArray<Range> {
    this.sync()
    this.erased ??= this.findErasedParts()
    return this.erased
  }

  /**
   * The walk of the module, keeping what renders nowhere: the parts of an
   * active node's range its body does not keep. A kept claim's text renders
   * inside its owner (relocation, no erasure): it is walked as text, and so
   * is one read elsewhere inside an erased part.
   */
  private findErasedParts(): Array<Range> {
    const out: Array<Range> = []
    if (!this.set.regions.marked) {
      return out
    }
    const text = (n: RangeNode) => {
      const body = this.textOf(n)
      if (body !== null) {
        erasedBy(n, body)
      } else {
        this.walk(n, n.start, n.end, visitor)
      }
    }
    /** `[s, e)` of `n` renders nowhere, but the kept claims inside it (read elsewhere: their text renders in their owners). */
    const erased = (n: RangeNode, s: number, e: number) => {
      let pos = s
      const within = (x: RangeNode) => {
        for (const c of x.children) {
          if (!c.marked || c.end <= pos || c.start >= e) {
            continue
          }
          if (
            c.start >= pos &&
            c.end <= e &&
            c.claim !== null &&
            this.keeps(c.claim)
          ) {
            if (c.start > pos) {
              out.push({ start: pos, end: c.start })
            }
            text(c)
            pos = c.end
            continue
          }
          within(c)
        }
      }
      within(n)
      if (e > pos) {
        out.push({ start: pos, end: e })
      }
    }
    const erasedBy = (n: RangeNode, body: ReadonlyArray<Frag>) => {
      const kept: Array<Range> = []
      for (const f of body) {
        if (f.k === 'slice' || f.k === 'ref') {
          kept.push(f.range)
        }
      }
      kept.sort((x, y) => x.start - y.start)
      let pos = n.start
      for (const k of kept) {
        if (k.start > pos) {
          erased(n, pos, k.start)
        }
        if (k.end > pos) {
          pos = k.end
        }
      }
      if (n.end > pos) {
        erased(n, pos, n.end)
      }
      for (const f of body) {
        if (f.k === 'slice') {
          this.walk(n, f.range.start, f.range.end, visitor)
        }
      }
    }
    const visitor: WalkVisitor = {
      source: () => {},
      insert: () => {},
      node: (n) => {
        if (n.claim !== null && this.keeps(n.claim)) {
          text(n)
        } else {
          erasedBy(n, (this.placeOf(n) ?? this.textOf(n))!)
        }
      },
    }
    const root = this.set.regions.module
    this.walk(root, 0, root.end, visitor)
    return out
  }

  /**
   * How much of a range what encloses it lets render: `own` is the node on
   * exactly the range (its edits are the range's text), `around` the first
   * node strictly holding it; they decide as for a position (`decide`).
   * `partial`: ask the positions.
   */
  encloses(
    range: Range,
    own: RangeNode | null,
    around: RangeNode | null,
  ): 'all' | 'none' | 'partial' {
    const output = this.output
    if (own !== null && own.claim !== null && this.readElsewhere(own.claim)) {
      return 'all'
    }
    for (let x = around; x !== null; x = x.parent) {
      const claim = x.claim
      const edits = x.edits
      if (claim !== null) {
        for (const e of edits ?? NO_EDITS) {
          if (e.scope === 'all-outputs') {
            const k = keeps(e.body, range)
            if (k !== 'all') {
              return k
            }
          }
        }
        if (this.readElsewhere(claim)) {
          return 'all'
        }
      }
      for (const e of claim === null ? (edits ?? NO_EDITS) : NO_EDITS) {
        if (RewriteSet.inScope(e.scope, output)) {
          const k = keeps(e.body, range)
          if (k !== 'all') {
            return k
          }
        }
      }
    }
    return 'all'
  }

  // ---- point questions ------------------------------------------------------

  /** Whether the original byte at `offset` renders in no text of this output. */
  isErasedAt(offset: number): boolean {
    return this.erasedBy(offset) === true
  }

  /**
   * What decides whether the byte at `offset` renders: an edit erasing it
   * (true), a claim read elsewhere inside which it renders (false), or
   * nothing of the tree (null: it renders unless an edit outside the tree
   * removes it).
   */
  erasedBy(offset: number): boolean | null {
    return this.decide(offset, this.set.regions.nodeAt(offset))
  }

  /** Whether the byte at `range.start` is erased by what strictly encloses `range` (an edit on exactly the range does not count). */
  isErasedAround(range: Range): boolean {
    const own = this.set.regions.nodeOn(range)
    return (
      this.decide(
        range.start,
        own !== null ? own.parent : this.set.regions.nodeAround(range),
      ) === true
    )
  }

  /** Whether every byte of `range` is erased. */
  isErasedRange(range: Range): boolean {
    if (range.end <= range.start) {
      return this.isErasedAt(range.start)
    }
    // erasure is piecewise over the boundaries of the ranges and kept parts
    // inside the range
    const points = new Set<number>([range.start])
    const add = (p: number) => {
      if (p > range.start && p < range.end) {
        points.add(p)
      }
    }
    const addParts = (node: RangeNode) => {
      for (const e of node.edits ?? []) {
        for (const f of e.body) {
          if (f.k === 'slice' || f.k === 'ref') {
            add(f.range.start)
            add(f.range.end)
          }
        }
      }
    }
    const around = this.set.regions.nodeAround(range)
    for (let n: RangeNode | null = around; n !== null; n = n.parent) {
      addParts(n)
    }
    const work: Array<RangeNode> = []
    const top = around.children
    for (
      let i = Math.max(0, lastStartingBy(top, range.start));
      i < top.length && top[i]!.start < range.end;
      i++
    ) {
      work.push(top[i]!)
    }
    while (work.length > 0) {
      const n = work.pop()!
      if (!n.marked || n.end <= range.start || n.start >= range.end) {
        continue
      }
      add(n.start)
      add(n.end)
      addParts(n)
      work.push(...n.children)
    }
    for (const p of points) {
      if (!this.isErasedAt(p)) {
        return false
      }
    }
    return true
  }

  /** Whether this output keeps the claim of `region` (its placeholder, or its owner when read elsewhere). */
  hasClaim(region: RegionId): boolean {
    const claim = this.set.claims.get(region)
    return claim !== undefined && this.keeps(claim)
  }

  /** Whether this output keeps the claim: its occurrence renders, or other generated code reads its owner. */
  private keeps(claim: RegionClaim): boolean {
    return (
      !this.occurrenceErased(claim) || this.set.readOwners().has(claim.owner)
    )
  }

  /** Whether a claim is read elsewhere: kept, its occurrence erased (its text renders inside its owner, decided there). */
  private readElsewhere(claim: RegionClaim): boolean {
    return (
      this.occurrenceErased(claim) && this.set.readOwners().has(claim.owner)
    )
  }

  /** Whether an erasing edit strictly encloses the claim's occurrence (outside the claims read elsewhere, inside which it is decided). */
  private occurrenceErased(claim: RegionClaim): boolean {
    this.sync()
    let erased = this.erasedClaims.get(claim)
    if (erased === undefined) {
      erased = this.isErasedAround(this.set.regions.get(claim.region).range)
      this.erasedClaims.set(claim, erased)
    }
    return erased
  }

  /**
   * Climbs from `from` to the root: the first edit of this output erasing
   * the byte at `offset` in a node's text (`textOf`) decides it erased, the
   * first claim read elsewhere decides it renders, inner first; null when
   * nothing does. (What stands at a claimed node's place is no part of its
   * text.)
   */
  private decide(offset: number, from: RangeNode | null): boolean | null {
    const output = this.output
    for (let x = from; x !== null; x = x.parent) {
      const claim = x.claim
      const edits = x.edits
      if (claim !== null) {
        // edits addressed to every output nest inside the claim
        if (edits !== null) {
          for (const e of edits) {
            if (e.scope === 'all-outputs' && erases(e.body, offset)) {
              return true
            }
          }
        }
        if (this.readElsewhere(claim)) {
          return false
        }
      }
      if (edits !== null && claim === null) {
        for (const e of edits) {
          if (RewriteSet.inScope(e.scope, output) && erases(e.body, offset)) {
            return true
          }
        }
      }
    }
    return null
  }
}

/** `found`, or `e` when it is the first: two edits of one range that differ conflict. */
function same(
  found: PlannerEdit | null,
  e: PlannerEdit,
  n: RangeNode,
): PlannerEdit {
  if (found === null) {
    return e
  }
  if (!fragsEqual(found.body, e.body)) {
    throw new Error(
      `conflict: ${found.by} and ${e.by} both rewrite [${n.start}, ${n.end}) with different bodies`,
    )
  }
  return found
}

const NO_EDITS: ReadonlyArray<PlannerEdit> = []
