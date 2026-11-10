/**
 * The regions and the rewrite tree (see README.md, "Units, regions, edits").
 *
 * Planners emit `Edit`s against original ranges whose bodies are fragments:
 * retained slices (rendered with their own nested edits), structured text
 * (string parts and `SymRef`s), glue specifier literals (`spec`) and
 * context-aware reference rewrites (`ref`). Generated units own claimed
 * regions; the region renders inside the owner wherever the owner is homed
 * and a placeholder renders at the original occurrence.
 *
 * The plan owns one region tree (`RegionTable`): the module, its regions and
 * the range of every edit, shared by every output, so that two ranges nest
 * or are disjoint whatever outputs their edits are scoped to. What an output
 * renders of the source (`OutputView`) is read on that tree, by climbing from
 * a position's innermost range. The renderer reads a `RenderTree` per output:
 * the scoped edits sorted, nested, conflict-checked, plus the claims the view
 * keeps as placeholder edits.
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

export type Frag =
  | { k: 'slice'; range: Range }
  | {
      k: 'text'
      parts: ReadonlyArray<string | SymRef>
      mapTo?: number
      declares?: ReadonlyArray<SymbolId>
    }
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
  body: ReadonlyArray<Frag>
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

export interface Region {
  id: RegionId
  range: Range
  kind: RegionKind
  unit: UnitId | null
  parent: RegionId | null
  children: Array<RegionId>
}

interface PlannerEdit extends Edit {
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
  /** The first claim of a region on exactly this range (a second is a conflict of the render tree). */
  claim: RegionClaim | null
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
      marked: false,
    }
    this.nodes.set(0, this.root)
    for (const u of units) {
      const r: Region = {
        id: this.regions.length,
        range: u.range,
        kind: 'unit',
        unit: u.id,
        parent: null,
        children: [],
      }
      this.regions.push(r)
      this.unitRegions.push(r)
    }
  }

  /** Registers a sub-region under the innermost region containing it. */
  register(range: Range, kind: Exclude<RegionKind, 'unit'>): RegionId {
    const key = `${range.start}:${range.end}:${kind}`
    const existing = this.subRegionByKey.get(key)
    if (existing !== undefined) {
      return existing
    }
    this.node(range, `a ${kind} region`)
    const parent = this.innermostAt(range.start, range.end)
    const id = this.regions.length
    const r: Region = { id, range, kind, unit: null, parent, children: [] }
    this.regions.push(r)
    this.subRegionByKey.set(key, id)
    if (parent !== null) {
      const p = this.regions[parent]!
      // existing children inside the new range are re-parented (regions may be registered inner-first)
      const kept: Array<RegionId> = []
      for (const cid of p.children) {
        const c = this.regions[cid]!
        if (c.range.start >= range.start && c.range.end <= range.end) {
          c.parent = id
          r.children.push(cid)
        } else {
          kept.push(cid)
        }
      }
      kept.push(id)
      p.children = kept.sort(
        (a, b) => this.regions[a]!.range.start - this.regions[b]!.range.start,
      )
      r.children.sort(
        (a, b) => this.regions[a]!.range.start - this.regions[b]!.range.start,
      )
    }
    return id
  }

  get(id: RegionId): Region {
    return this.regions[id]!
  }

  /** The innermost region containing `[start, end)` (end defaults to start + 1 semantics). */
  innermostAt(start: number, end: number = start): RegionId | null {
    const units = this.unitRegions
    let lo = 0
    let hi = units.length - 1
    let found: Region | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = units[mid]!
      if (r.range.start <= start) {
        found = r
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (found === null || Math.max(end, start + 1) > found.range.end) {
      return null
    }
    let cur = found
    for (;;) {
      let next: Region | null = null
      for (const cid of cur.children) {
        const c = this.regions[cid]!
        if (
          c.range.start <= start &&
          Math.max(end, start) <= c.range.end &&
          (end > start ? end <= c.range.end : start < c.range.end)
        ) {
          next = c
          break
        }
      }
      if (next === null) {
        return cur.id
      }
      cur = next
    }
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

  /** The unit region at the root of a region's chain. */
  unitOf(id: RegionId): UnitId | null {
    let cur: RegionId | null = id
    while (cur !== null) {
      const r: Region = this.regions[cur]!
      if (r.unit !== null) {
        return r.unit
      }
      cur = r.parent
    }
    return null
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
    // as nodes (a node on exactly a unit's range is one of an edit)
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
        marked: false,
      }
      siblings.push(node)
      this.index(node)
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
      marked: false,
    }
    siblings.splice(i, 0, node)
    for (const c of node.children) {
      c.parent = node
      node.marked ||= c.marked
    }
    this.index(node)
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
 * The order of the edits of one range and of the inserts at one position: the
 * lower is the outer edit (`RenderTree`) and the first insert. By band, then by
 * `n` within it, then `nested`:
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

interface EditOrder {
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

/** An internal edit of a render tree: a planner edit or a claim placeholder. */
export interface TreeEdit extends EditOrder {
  range: Range
  body: ReadonlyArray<Frag>
  by: string
  /** The claimed region when this edit is a claim placeholder. */
  claim: RegionId | null
}

export class RewriteSet {
  readonly edits: Array<PlannerEdit> = []
  readonly generated: Array<GeneratedUnit> = []
  readonly claims = new Map<RegionId, RegionClaim>()
  private nextEdit = 0
  private changes = 0
  private trees = new Map<string, { version: number; tree: RenderTree }>()
  private views = new Map<OutputId, OutputView>()
  private envView: OutputView | undefined
  private owners: { version: number; owners: ReadonlySet<GenUnitId> } | null =
    null

  constructor(readonly regions: RegionTable) {}

  add(edit: Edit): void {
    const e = { ...edit, n: this.nextEdit++ }
    const node = this.regions.node(edit.range, edit.by)
    if (node !== null) {
      ;(node.edits ??= []).push(e)
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
    this.claims.set(claim.region, claim)
    const node = this.regions.nodeOn(this.regions.get(claim.region).range)
    if (node !== null && node.claim === null) {
      node.claim = claim
      this.regions.mark(node)
    }
    this.bump()
  }

  /** The claim on exactly `range`, if any (a second claim there is a conflict: `RegionClaim.subject`). */
  claimOn(range: Range): RegionClaim | undefined {
    for (const claim of this.claims.values()) {
      const r = this.regions.get(claim.region).range
      if (r.start === range.start && r.end === range.end) {
        return claim
      }
    }
    return undefined
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

  /** Bumped by every change of the set (`OutputView` and the render trees are read for one version). */
  get version(): number {
    return this.changes
  }

  /** Whether `output` is in `scope`. */
  static inScope(scope: EditScope, output: OutputId): boolean {
    return scope === 'all-outputs' || scope.includes(output)
  }

  /** What `output` renders of the source (liveness). */
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
   * The render tree of an output: planner edits in scope plus `extra`
   * internal edits (statement-level DCE, export keyword drops) plus the
   * claims the output keeps (`OutputView.hasClaim`). Cached by version when
   * `extra` is empty.
   */
  tree(output: OutputId, extra: ReadonlyArray<TreeEdit> = []): RenderTree {
    const cacheable = extra.length === 0
    if (cacheable) {
      const hit = this.trees.get(output)
      if (hit && hit.version === this.version) {
        return hit.tree
      }
    }
    const edits: Array<TreeEdit> = []
    for (const e of this.edits) {
      if (RewriteSet.inScope(e.scope, output)) {
        // an edit addressed to every output on exactly a claimed region
        // travels with the region: it nests inside the claim
        const claim =
          e.scope === 'all-outputs'
            ? (this.regions.nodeOn(e.range)?.claim ?? null)
            : null
        edits.push({
          range: e.range,
          body: e.body,
          by: e.by,
          band: claim === null ? EditBand.planner : EditBand.claim,
          n: claim === null ? e.n : claim.region,
          nested: claim !== null,
          claim: null,
        })
      }
    }
    // The internal edits (`extra`) never decide a claim: placement drops a
    // statement it does not place, not the claimed regions in it, which
    // render inside their owners wherever those are placed (as reach saw
    // them).
    const view = this.view(output)
    for (const claim of this.claims.values()) {
      if (view.hasClaim(claim.region)) {
        edits.push(claimEdit(this.regions, claim))
      }
    }
    for (const x of extra) {
      edits.push(x)
    }
    const tree = new RenderTree(edits)
    if (cacheable) {
      this.trees.set(output, { version: this.version, tree })
    }
    return tree
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
    const scan = (by: GenUnitId, frags: ReadonlyArray<Frag>) => {
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

/** A claim's placeholder edit. */
function claimEdit(regions: RegionTable, claim: RegionClaim): TreeEdit {
  return {
    range: regions.get(claim.region).range,
    body: claim.placeholder,
    by: claim.by,
    band: EditBand.claim,
    n: claim.region,
    claim: claim.region,
  }
}

function fragsEqual(a: ReadonlyArray<Frag>, b: ReadonlyArray<Frag>): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Whether a body erases the original byte at `offset` of its range (no slice or reference of it keeps it). */
export function erases(body: ReadonlyArray<Frag>, offset: number): boolean {
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

/** One edit or claim of a node, as the render tree of an output holds it (`OutputView.erasedParts`). */
type NodeItem = PlannerEdit | RegionClaim

const isClaim = (it: NodeItem): it is RegionClaim => 'owner' in it

/**
 * What one output renders of the source, read on the region tree: whether
 * an original byte renders in some text of the output (an edit erases it,
 * or none does; relocation into a claim's owner is no erasure), and which
 * claims the output keeps.
 *
 * A claim is kept unless an erasing edit strictly encloses its occurrence.
 * One whose owner other generated code reads (`readOwners`: the provider's
 * hoisted server fn its RPC wrapper calls) is a declaration in its own
 * right and stays then, without its placeholder (read elsewhere): the owner
 * stays while placement reaches it, and inside its region what renders is
 * decided inside it. An edit scoped to this output on exactly a
 * claimed region replaces the placeholder here (it sorts before the claim);
 * one addressed to every output nests inside the claim and renders where
 * the region does, inside its owner.
 *
 * Every question climbs from the innermost range of a position to the root,
 * reading the edits and claims of each range (memoised per claim for one
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
    return this.decide(offset, this.set.regions.nodeAt(offset), null)
  }

  /** Whether the byte at `range.start` is erased by what strictly encloses `range` (an edit on exactly the range does not count). */
  isErasedAround(range: Range): boolean {
    let node = this.set.regions.nodeAt(range.start)
    while (
      node !== null &&
      node.start >= range.start &&
      node.end <= range.end
    ) {
      node = node.parent
    }
    return this.decide(range.start, node, null) === true
  }

  /** Whether an edit of this output's render tree renders (its position is not erased by what encloses it). */
  editRenders(e: TreeEdit): boolean {
    if (e.range.end <= e.range.start) {
      return !this.isErasedAt(e.range.start)
    }
    return (
      this.decide(e.range.start, this.set.regions.nodeOn(e.range), e) !== true
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
    const work = [...around.children]
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

  /** Whether the claim's placeholder renders here (kept, its occurrence not erased, and not overridden by an edit on exactly the region). */
  placeholderRenders(region: RegionId): boolean {
    const claim = this.set.claims.get(region)
    return (
      claim !== undefined &&
      !this.occurrenceErased(claim) &&
      this.overrideOf(region) === null
    )
  }

  /**
   * The planner edit on exactly a kept claimed region that encloses the
   * claim (scoped to this output): it replaces the placeholder here (the
   * region's text stays relocated to its owner), so what it renders is read
   * where the placeholder would be. An edit nested inside the claim (one
   * addressed to every output) travels with the region instead.
   */
  overrideOf(region: RegionId): TreeEdit | null {
    if (!this.hasClaim(region)) {
      return null
    }
    const node = this.set.regions.nodeOn(this.set.regions.get(region).range)
    for (const e of node?.edits ?? []) {
      if (e.scope !== 'all-outputs' && e.scope.includes(this.output)) {
        return {
          range: e.range,
          body: e.body,
          by: e.by,
          band: EditBand.planner,
          n: e.n,
          claim: null,
        }
      }
    }
    return null
  }

  /** The edits of this output's render tree. */
  get edits(): ReadonlyArray<TreeEdit> {
    return this.set.tree(this.output).edits
  }

  /** The erased parts of this output (for provenance; found once per version). */
  erasedParts(): ReadonlyArray<Range> {
    this.sync()
    this.erased ??= this.findErasedParts()
    return this.erased
  }

  private findErasedParts(): Array<Range> {
    const out: Array<Range> = []
    if (!this.set.regions.marked) {
      return out
    }
    const output = this.output
    let anyHidden = false
    for (const c of this.set.claims.values()) {
      if (this.occurrenceErased(c) && this.keeps(c)) {
        anyHidden = true
        break
      }
    }
    // the items of each node in the render tree's order (identical edits of
    // one range are one)
    const itemsOf = new Map<RangeNode, Array<NodeItem>>()
    const items = (node: RangeNode): ReadonlyArray<NodeItem> => {
      const { edits, claim } = node
      if (edits === null && claim === null) {
        return NO_NODE_ITEMS
      }
      if (
        claim === null &&
        edits!.length === 1 &&
        RewriteSet.inScope(edits![0]!.scope, output)
      ) {
        // (the common node: one edit)
        return edits!
      }
      let list = itemsOf.get(node)
      if (list !== undefined) {
        return list
      }
      list = []
      for (const e of edits ?? []) {
        if (
          RewriteSet.inScope(e.scope, output) &&
          !(claim !== null && e.scope === 'all-outputs')
        ) {
          list.push(e)
        }
      }
      if (claim !== null) {
        if (this.keeps(claim)) {
          list.push(claim)
        }
        for (const e of edits ?? []) {
          if (e.scope === 'all-outputs') {
            list.push(e)
          }
        }
      }
      list = list.filter((it, i) => {
        const prev = list![i - 1]
        return !(
          prev !== undefined &&
          !isClaim(it) &&
          !isClaim(prev) &&
          fragsEqual(prev.body, it.body)
        )
      })
      itemsOf.set(node, list)
      return list
    }
    /** Whether `it` is the edit replacing the placeholder of a kept claim on its range. */
    const overridesClaim = (node: RangeNode, it: NodeItem): boolean =>
      !isClaim(it) &&
      node.claim !== null &&
      this.keeps(node.claim) &&
      items(node)[0] === it
    // an erased part without the kept claims inside it read elsewhere
    // (relocated: their text renders inside their owners)
    const erased = (s: number, e: number, by: NodeItem) => {
      let pos = s
      const within = (c: RangeNode) => {
        if (!c.marked || c.end <= pos || c.start >= e) {
          return
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
          // (`by` may be on exactly the claim: it already erased what it erases)
          visit(c.start, c.end, new Set([c.claim, by]))
          pos = c.end
          return
        }
        for (const child of c.children) {
          within(child)
        }
      }
      if (anyHidden) {
        within(this.set.regions.nodeAround({ start: s, end: e }))
      }
      if (e > pos) {
        out.push({ start: pos, end: e })
      }
    }
    // the outermost items inside [s, e) but the excluded ones, in order (the
    // render tree's `topLevelWithin`): up to an item starting inside and
    // ending past `e`
    const topLevel = (
      s: number,
      e: number,
      excluded: ReadonlySet<NodeItem>,
    ): Array<{ node: RangeNode; item: NodeItem }> => {
      const found: Array<{ node: RangeNode; item: NodeItem }> = []
      const scan = (node: RangeNode): boolean => {
        if (node.start >= s && node.start < e) {
          const list = items(node)
          if (list.length > 0 && node.end > e) {
            return false
          }
          const first = list.find((it) => !excluded.has(it))
          if (first !== undefined) {
            found.push({ node, item: first })
            return true
          }
        }
        for (const c of node.children) {
          if (!c.marked || c.end <= s) {
            continue
          }
          if (c.start >= e) {
            break
          }
          if (!scan(c)) {
            return false
          }
        }
        return true
      }
      const around = this.set.regions.nodeAround({ start: s, end: e })
      for (let a = around.parent; a !== null && a.start === s; a = a.parent) {
        if (items(a).length > 0) {
          return found
        }
      }
      scan(around)
      return found
    }
    const visit = (s: number, e: number, excluded: ReadonlySet<NodeItem>) => {
      for (const { node, item } of topLevel(s, e, excluded)) {
        if (isClaim(item) || overridesClaim(node, item)) {
          // relocation, not erasure: look for erasing edits inside the region
          visit(node.start, node.end, new Set([...excluded, item]))
          continue
        }
        const body = item.body
        let pos = node.start
        const covered: Array<Range> = []
        for (const f of body) {
          if (f.k === 'slice' || f.k === 'ref') {
            covered.push(f.range)
          }
        }
        covered.sort((a, b) => a.start - b.start)
        for (const c of covered) {
          if (c.start > pos) {
            erased(pos, c.start, item)
          }
          if (c.end > pos) {
            pos = c.end
          }
        }
        if (node.end > pos) {
          erased(pos, node.end, item)
        }
        for (const f of body) {
          if (f.k === 'slice') {
            visit(
              f.range.start,
              f.range.end,
              f.range.start === node.start && f.range.end === node.end
                ? new Set([...excluded, item])
                : NO_ITEMS,
            )
          }
        }
      }
    }
    visit(0, Infinity, NO_ITEMS)
    return out
  }

  /** Whether this output keeps the claim: its occurrence renders, or other generated code reads its owner. */
  private keeps(claim: RegionClaim): boolean {
    return (
      !this.occurrenceErased(claim) || this.set.readOwners().has(claim.owner)
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
   * the byte at `offset` decides it erased, the first claim read elsewhere
   * (kept, its occurrence erased) decides it renders, inner first; null
   * when nothing does. On `from`, only what the render tree orders before
   * `until`.
   */
  private decide(
    offset: number,
    from: RangeNode | null,
    until: EditOrder | null,
  ): boolean | null {
    const output = this.output
    for (let x = from; x !== null; x = x.parent) {
      const bound = x === from ? until : null
      const claim = x.claim
      const edits = x.edits
      if (claim !== null) {
        // edits addressed to every output nest inside the claim
        if (
          edits !== null &&
          (bound === null ||
            compareEditOrder(
              { band: EditBand.claim, n: claim.region, nested: true },
              bound,
            ) < 0)
        ) {
          for (const e of edits) {
            if (e.scope === 'all-outputs' && erases(e.body, offset)) {
              return true
            }
          }
        }
        if (
          (bound === null ||
            compareEditOrder({ band: EditBand.claim, n: claim.region }, bound) <
              0) &&
          this.occurrenceErased(claim) &&
          this.set.readOwners().has(claim.owner)
        ) {
          return false
        }
      }
      if (edits !== null) {
        for (const e of edits) {
          if (
            !(claim !== null && e.scope === 'all-outputs') &&
            RewriteSet.inScope(e.scope, output) &&
            (bound === null ||
              compareEditOrder({ band: EditBand.planner, n: e.n }, bound) <
                0) &&
            erases(e.body, offset)
          ) {
            return true
          }
        }
      }
    }
    return null
  }
}

const NO_ITEMS: ReadonlySet<NodeItem> = new Set()
const NO_NODE_ITEMS: ReadonlyArray<NodeItem> = []

/**
 * Edits of one output sorted by (start asc, zero-width first, end desc,
 * `compareEditOrder`), nested by containment and conflict-checked.
 */
export class RenderTree {
  readonly edits: Array<TreeEdit>

  constructor(edits: Array<TreeEdit>) {
    const sorted = [...edits].sort(
      (a, b) =>
        a.range.start - b.range.start ||
        Number(b.range.start === b.range.end) -
          Number(a.range.start === a.range.end) ||
        b.range.end - a.range.end ||
        compareEditOrder(a, b),
    )
    // dedupe identical edits; detect conflicts
    const out: Array<TreeEdit> = []
    const stack: Array<TreeEdit> = []
    for (const e of sorted) {
      const prev = out[out.length - 1]
      if (
        prev &&
        prev.range.start === e.range.start &&
        prev.range.end === e.range.end &&
        e.range.start !== e.range.end
      ) {
        if (prev.claim !== null || e.claim !== null) {
          if (prev.claim !== null && e.claim !== null) {
            throw new Error(
              `conflict: two claims on region ${prev.claim} (by ${prev.by} and ${e.by})`,
            )
          }
          // an edit on exactly a claimed region nests inside the claim
        } else if (fragsEqual(prev.body, e.body)) {
          continue
        } else {
          throw new Error(
            `conflict: ${prev.by} and ${e.by} both rewrite [${e.range.start}, ${e.range.end}) with different bodies`,
          )
        }
      }
      while (
        stack.length > 0 &&
        stack[stack.length - 1]!.range.end <= e.range.start &&
        !(
          stack[stack.length - 1]!.range.end === e.range.start &&
          e.range.start === e.range.end &&
          stack[stack.length - 1]!.range.start < e.range.start
        )
      ) {
        stack.pop()
      }
      const top = stack[stack.length - 1]
      if (top && e.range.end > top.range.end && e.range.start < top.range.end) {
        throw new Error(
          `conflict: ${e.by} [${e.range.start}, ${e.range.end}) partially overlaps ${top.by} [${top.range.start}, ${top.range.end})`,
        )
      }
      out.push(e)
      if (e.range.end > e.range.start) {
        stack.push(e)
      }
    }
    this.edits = out
  }

  /**
   * The outermost edits inside `[start, end)`, optionally treating `exclude`
   * as absent (rendering a claimed region inside its owner, or the edits
   * inside one), and without the zero-width edits at `skipZeroWidthAt` (they precede the edit whose body
   * is rendered: its siblings, rendered before it).
   */
  topLevelWithin(
    start: number,
    end: number,
    exclude: TreeEdit | ReadonlySet<TreeEdit> | null = null,
    includeEnd = false,
    skipZeroWidthAt: number | null = null,
  ): Array<TreeEdit> {
    const edits = this.edits
    let lo = 0
    let hi = edits.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (edits[mid]!.range.start < start) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    const out: Array<TreeEdit> = []
    let coverEnd = -1
    for (let i = lo; i < edits.length; i++) {
      const e = edits[i]!
      if (e.range.start > end || (e.range.start === end && e.range.end > end)) {
        break
      }
      if (e.range.start === end && e.range.end === end && !includeEnd) {
        // zero-width edit at the end boundary belongs to the following text
        break
      }
      // an edit past `end` encloses the range or overlaps its end: no
      // rendered edit follows it here. One at `start` encloses it (a claim
      // around a copy of its left part) and hides the edits inside: no
      // planner copies part of an edit's range from its start over an edit,
      // and the renderer's copy check reports one that would (`editUnderCopy`)
      if (e.range.end > end) {
        break
      }
      if (e === exclude || (exclude instanceof Set && exclude.has(e))) {
        continue
      }
      if (
        e.range.start === skipZeroWidthAt &&
        e.range.end === skipZeroWidthAt
      ) {
        continue
      }
      if (e.range.start < coverEnd) {
        continue
      }
      out.push(e)
      if (e.range.end > coverEnd) {
        coverEnd = e.range.end
      }
    }
    return out
  }

  /**
   * The first edit of this tree under original text `[from, to)` that the
   * renderer copies as is: a gap, between the edits it applies, of the range
   * `[start, end)` it renders (`Renderer.renderRange`). Copied text applies
   * every edit of the output under it, so an edit found here would be lost
   * (only a compiler bug gets here: an owner copying the left part of its
   * claim, whose placeholder sorts first and ends `topLevelWithin`). Not lost:
   * `exclude` (a claim its owner renders), the edits enclosing the rendered
   * range (the edit whose body it is, a claim around it) and the inserts at
   * the copy's start (they precede the edit whose body renders); an insert at
   * `to` belongs to the text after it.
   */
  editUnderCopy(
    from: number,
    to: number,
    start: number,
    end: number,
    exclude: TreeEdit | null,
  ): TreeEdit | null {
    const edits = this.edits
    let lo = 0
    let hi = edits.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (edits[mid]!.range.start < from) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo; i < edits.length; i++) {
      const e = edits[i]!
      if (e.range.start >= to) {
        return null
      }
      if (
        e === exclude ||
        (e.range.start === e.range.end
          ? e.range.start === from
          : e.range.start <= start && e.range.end > end)
      ) {
        continue
      }
      return e
    }
    return null
  }
}
