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
/** The outputs an insert, a placeholder or a claim applies in (a planner's edit applies in every output). */
export type EditScope =
  | 'all-outputs'
  | ReadonlyArray<OutputId>
  | { readonly except: ReadonlyArray<OutputId> }
export type RefTarget =
  | { sym: SymbolId }
  | { member: [SymbolId, ...Array<string>] }
/** How a `SymRef` renders the binding's name: as an expression, a callee or a JSX tag. */
export type SymRefContext = 'expr' | 'callee' | 'jsxTag'
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
}

/**
 * A fragment of what stands at a place (a placeholder, a claim's): generated
 * text only. A place names no source text: the region's text renders in its
 * owner, or nowhere.
 */
export type PlaceFrag = Exclude<Frag, { k: 'slice' } | { k: 'ref' }>

/** A claimed region, whole: its text, rendered by its owner. */
export type RegionFrag = { k: 'region'; id: RegionId }

/**
 * A fragment of a generated unit. It names source text only as a region it
 * claims (`RegionFrag`), never as a slice: the region renders with every edit
 * of the output inside it.
 */
export type GenFrag = Exclude<Frag, { k: 'slice' }> | RegionFrag

export interface Edit {
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
  placeholder: ReadonlyArray<PlaceFrag>
  /** The outputs whose place of the region holds the placeholder (default: every output). */
  scope?: EditScope
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
 * (`RegionTable.parentOf`, `innermostAt`; placement indexes the nesting once
 * per plan).
 */
export interface Region {
  id: RegionId
  range: Range
  kind: RegionKind
  unit: UnitId | null
}

/** What a planner puts at a region's place in some outputs (`RewriteSet.placeholder`). */
export interface Placeholder extends Edit {
  body: ReadonlyArray<PlaceFrag>
}

/** Server-only source text a client compile removes (`RewriteSet.serverOnly`). */
export interface ServerOnlyText {
  range: Range
  /** What the text is, for the server-code check's message ("the server function's handler"). */
  subject: string
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
  /** The edits of this range's text (a planner's address every output, the core's orphan cleanup some), in call order. */
  edits: Array<Edit> | null
  /** The placeholders standing at this range's place in some outputs, in call order. */
  places: Array<Placeholder> | null
  /** The claim of the region on exactly this range (a second one is a conflict). */
  claim: RegionClaim | null
  /** The region on exactly this range, if any (a placement member). */
  region: RegionId | null
  /** Whether this node or one inside it holds an edit, a placeholder or a claim (the others decide nothing: every walk skips them). */
  marked: boolean
}

/**
 * The regions of one plan and its region tree. Each unit is the region of
 * its id; planners register sub-regions (`register`), the rewrite set the
 * ranges of its edits (`node`). Registering a range that partly overlaps
 * another one throws, whatever outputs their edits are scoped to.
 *
 * Placement reads the regions (units and sub-regions, each under the
 * innermost region holding it: `parentOf`, `innermostAt`); the ranges of
 * edits are tree nodes only.
 */
export class RegionTable {
  readonly regions: Array<Region> = []
  /** Unit regions sorted by start (disjoint). */
  private readonly unitRegions: Array<Region> = []
  /** Sub-regions by `start:end` (one region per range). */
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
      places: null,
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

  /** Registers a sub-region: its node of the tree (one region per range: another kind there is a conflict). */
  register(range: Range, kind: Exclude<RegionKind, 'unit'>): RegionId {
    const key = `${range.start}:${range.end}`
    const existing = this.subRegionByKey.get(key)
    if (existing !== undefined) {
      const other = this.regions[existing]!.kind
      if (other !== kind) {
        throw new Error(
          `conflict: a ${kind} region [${range.start}, ${range.end}) is the ${other} region there`,
        )
      }
      return existing
    }
    const node = this.node(range, `a ${kind} region`)!
    // a region nests in one unit (on exactly its range at most): one holding
    // statements would own their references, which no unit would then read
    const k = this.lastUnitStartingBy(range.end - 1)
    const last = k < 0 ? null : this.unitRegions[k]!
    if (
      last !== null &&
      last.range.start >= range.start &&
      last.range.end <= range.end &&
      (last.range.start !== range.start || last.range.end !== range.end)
    ) {
      throw new Error(
        `conflict: a ${kind} region [${range.start}, ${range.end}) holds unit ${last.unit} [${last.range.start}, ${last.range.end}): a region stands inside one statement`,
      )
    }
    const id = this.regions.length
    this.regions.push({ id, range, kind, unit: null })
    this.subRegionByKey.set(key, id)
    // (a sub-region on exactly a unit's range is the innermost of the two)
    if (node.region === null || this.regions[node.region]!.unit !== null) {
      node.region = id
    }
    return id
  }

  get(id: RegionId): Region {
    return this.regions[id]!
  }

  /** The unit region holding `[start, end)` (a zero-width range: the byte at `start`), if any. */
  unitAt(start: number, end: number): Region | null {
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

  /**
   * The one owner of an insert at `at`: the text holding its position, the
   * innermost node strictly holding it. Its `level` renders the insert (the
   * innermost marked such node, the module's root when none: `OutputView.walk`)
   * and its `region` reads what the insert names (the innermost region
   * strictly holding the position, else the unit holding the byte there: an
   * insert at a unit's start is the unit's). A position no unit holds (a
   * statement's keyword, between statements, the module's end) has none:
   * `RewriteSet` refuses an insert there.
   */
  insertOwnerAt(at: number): { level: RangeNode; region: RegionId } | null {
    const unit = this.unitAt(at, at)
    if (unit === null) {
      return null
    }
    let region = unit.id
    let level = this.root
    let node = this.root
    for (;;) {
      const c = node.children[lastStartingBy(node.children, at - 1)]
      if (c === undefined || at >= c.end) {
        return { level, region }
      }
      if (c.region !== null) {
        region = c.region
      }
      if (c.marked) {
        level = c
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
        places: null,
        claim: null,
        region: unit,
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
      places: null,
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
 * What a walk of an output's text meets at one level of the tree, in render
 * order (`OutputView.walk`).
 */
export interface WalkVisitor {
  /** The source text of `[start, end)` renders here. */
  source: (start: number, end: number) => void
  /** An active node renders here, whole: its place (`OutputView.placeOf`, else its text). */
  node: (n: RangeNode) => void
  /** An insert renders here. */
  insert: (e: Edit) => void
  /**
   * A node on exactly a region (a placement member) the walk would enter or
   * render: true when the visitor takes it (the walk goes past it).
   */
  member?: (n: RangeNode) => boolean
}

export interface WalkOptions {
  /**
   * The inserts at this offset rendered before the text walked: at the
   * start of an edit whose body is walked, or of a piece of the env module
   * after the text before it (`includeEnd`).
   */
  skipAt?: number | null
  /** The inserts at the span's end render too (the env module's text up to its next piece, or to its end). */
  includeEnd?: boolean
}

const NO_OPTIONS: WalkOptions = {}

export class RewriteSet {
  /** The edits of text and the inserts, in call order. */
  readonly edits: Array<Edit> = []
  /** The inserts (zero-width edits), by position then call order. */
  readonly inserts: Array<Edit> = []
  /** The placeholders, in call order. */
  readonly places: Array<Placeholder> = []
  readonly generated: Array<GeneratedUnit> = []
  readonly claims = new Map<RegionId, RegionClaim>()
  /** The server-only text a client compile removes (what the server-code check reads). */
  readonly serverOnlyText: Array<ServerOnlyText> = []
  /** The node of each claim. */
  readonly claimNodes = new Map<RegionClaim, RangeNode>()
  /** The nodes holding two items or more: edits, placeholders, a claim (`checkConflicts`). */
  private readonly shared: Array<RangeNode> = []
  private changes = 0
  private views = new Map<OutputId, OutputView>()
  private envView: OutputView | undefined
  private owners: { version: number; owners: ReadonlySet<GenUnitId> } | null =
    null
  /** The level each insert renders at (`insertLevel`), for one version of the set. */
  private levels: {
    version: number
    of: Map<Edit, RangeNode>
  } | null = null

  constructor(readonly regions: RegionTable) {}

  /**
   * The text of `range` in every output where it renders: `body` in place
   * of its source (an empty range: an insert in every output).
   */
  edit(edit: { range: Range; body: ReadonlyArray<Frag>; by: string }): void {
    this.add({ ...edit, scope: 'all-outputs' })
  }

  /**
   * The core's orphan cleanup only (not on `PlanContext`): an edit of the
   * text in some outputs, where the code it removes is orphaned.
   */
  scopedEdit(edit: Edit): void {
    this.add(edit)
  }

  /**
   * Text inserted at `at` in `scope` (default: every output where the
   * position renders). The text holding the byte at `at` owns it
   * (`RegionTable.insertOwnerAt`): a position no statement's text holds is
   * refused, and so is the end of a declarator (`const a = f(1)` ends
   * before its line's end: the byte there is not its text), where an
   * expression statement's end is its own; only an edit of its last
   * expression appends to a declaration.
   */
  insert(insert: {
    at: number
    body: ReadonlyArray<Frag>
    by: string
    scope?: EditScope
  }): void {
    this.add({
      range: { start: insert.at, end: insert.at },
      body: insert.body,
      scope: insert.scope ?? 'all-outputs',
      by: insert.by,
    })
  }

  /**
   * What stands at the place of `range` in the outputs of `scope`: `body`,
   * generated text, while the range's text renders nowhere there (or in its
   * owner, when another output's claim has one). A claim in scope there too
   * is a conflict.
   */
  placeholder(place: {
    range: Range
    body: ReadonlyArray<PlaceFrag>
    scope: EditScope
    by: string
  }): void {
    const p: Placeholder = { ...place }
    const node = this.regions.node(place.range, place.by)
    if (node === null) {
      throw new Error(
        `placeholder of ${place.by} at [${place.range.start}, ${place.range.end}): a place is a range`,
      )
    }
    ;(node.places ??= []).push(p)
    this.share(node)
    this.regions.mark(node)
    this.places.push(p)
    this.bump()
  }

  /**
   * Server-only text of a client compile: what the server-code check reads
   * (`server-code.ts`), replaced in every output by `placeholder` when given
   * (else erased by another edit: an isomorphic call's `.server()`
   * implementation).
   */
  serverOnly(text: {
    range: Range
    subject: string
    by: string
    placeholder?: ReadonlyArray<PlaceFrag>
  }): void {
    this.serverOnlyText.push({ range: text.range, subject: text.subject })
    if (text.placeholder !== undefined) {
      this.placeholder({
        range: text.range,
        body: text.placeholder,
        scope: 'all-outputs',
        by: text.by,
      })
    }
  }

  private add(edit: Edit): void {
    const e = { ...edit }
    if (edit.range.end <= edit.range.start) {
      if (this.regions.unitAt(edit.range.start, edit.range.start) === null) {
        throw new Error(
          `conflict: an insert of ${edit.by} at ${edit.range.start} stands in no statement's text (no unit holds its position): nothing would read what it names`,
        )
      }
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
      ;(node.edits ??= []).push(e)
      this.share(node)
      this.regions.mark(node)
    }
    this.edits.push(e)
    this.bump()
  }

  /** Records a node that now holds two items (an edit, a placeholder, a claim) or more. */
  private share(node: RangeNode): void {
    if (
      (node.edits?.length ?? 0) +
        (node.places?.length ?? 0) +
        (node.claim === null ? 0 : 1) ===
      2
    ) {
      this.shared.push(node)
    }
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

  /**
   * Claims a region for a generated unit: the owner renders its text
   * (`{ k: 'region' }`) and the placeholder stands at its place, in the
   * outputs of `scope` (default: every output). In another output a
   * placeholder of that output stands at the place, or the region's text.
   */
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
    this.claimNodes.set(claim, node)
    node.claim = claim
    this.share(node)
    this.regions.mark(node)
    this.bump()
  }

  /** Rewrites one reference, context-aware (shorthand properties, import/export names, JSX tags, assignment targets). */
  ref(ref: ClassifiedRef, to: RefTarget, by: string): void {
    this.edit({
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
      by,
    })
  }

  /** Rewrites a declaration name (`declName` ctx; identifier targets only). */
  declName(range: Range, to: RefTarget, by: string): void {
    this.edit({
      range,
      body: [{ k: 'ref', range, to, ctx: 'declName' }],
      by,
    })
  }

  private bump(): void {
    this.changes++
  }

  /** The node whose level renders an insert: its owner's (`RegionTable.insertOwnerAt`). */
  insertLevel(e: Edit): RangeNode {
    if (this.levels === null || this.levels.version !== this.version) {
      this.levels = { version: this.version, of: new Map() }
    }
    let level = this.levels.of.get(e)
    if (level === undefined) {
      // (`add` refused an insert without an owner)
      level = this.regions.insertOwnerAt(e.range.start)!.level
      this.levels.of.set(e, level)
    }
    return level
  }

  /** Bumped by every change of the set (`OutputView` is read for one version). */
  get version(): number {
    return this.changes
  }

  /** Whether `output` is in `scope`. */
  static inScope(scope: EditScope, output: OutputId): boolean {
    if (scope === 'all-outputs') {
      return true
    }
    return 'except' in scope
      ? !scope.except.includes(output)
      : scope.includes(output)
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
    // (what a placeholder names is read where it stands, as a claim's)
    for (const p of this.places) {
      scan(-1, p.body)
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

/** The rewrite set as planners see it (`PlanContext.rewrites`): the core's scoped edit is its own. */
export type PlannerRewrites = Omit<RewriteSet, 'scopedEdit'>

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
 * Per node, two answers (the only readers of its tables): its text
 * (`editOf`: the edit in scope, else its source with the nodes inside it)
 * and its place (`placeholderOf`: what stands where it is written, else its
 * text). A place is a planner's placeholder, which has no owner and erases
 * the text there, or a claim's, whose owner renders the text: the claim is
 * kept unless an erasing edit strictly encloses its occurrence, and one
 * whose owner other generated code reads (`readOwners`: the provider's
 * hoisted server fn its RPC wrapper calls) is a declaration in its own right
 * and stays then, without its placeholder (read elsewhere). A region claimed
 * for other outputs is claimed in this one too when a placeholder of this
 * output stands at its place (its text renders in its owner, if read), and
 * otherwise its text stands at its place, as unclaimed text.
 *
 * Source text enters the output through one walk (`walk`): the renderer,
 * placement's reads and the erased parts are its visitors. The point
 * questions (`isErasedAt`, …) climb from a position's innermost range to the
 * root, asking each node the same two questions (memoised per claim for one
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

  /** The edit of node `n`'s text in this output (null: its source). Two that differ conflict. */
  editOf(n: RangeNode): Edit | null {
    const edits = n.edits
    if (edits === null) {
      return null
    }
    let found: Edit | null = null
    for (const e of edits) {
      if (RewriteSet.inScope(e.scope, this.output)) {
        found = same(found, e, n)
      }
    }
    return found
  }

  /**
   * What stands at node `n`'s place in this output (null: its text): a
   * planner's placeholder in scope, or the claim in scope while this output
   * keeps it. A placeholder and a claim both in scope conflict.
   */
  placeholderOf(n: RangeNode): Placeholder | RegionClaim | null {
    const own = this.ownPlaceholder(n)
    const claim = n.claim
    if (claim === null || !this.applies(claim)) {
      return own
    }
    if (own !== null) {
      throw new Error(
        `conflict: ${own.by} and ${claim.by} both put text at the place of [${n.start}, ${n.end})`,
      )
    }
    return this.keeps(claim) ? claim : null
  }

  /** The text of node `n` in this output (null: its source). */
  textOf(n: RangeNode): ReadonlyArray<Frag> | null {
    return this.editOf(n)?.body ?? null
  }

  /** What renders at node `n`'s place in this output (null: its text). */
  placeOf(n: RangeNode): ReadonlyArray<PlaceFrag> | null {
    const p = this.placeholderOf(n)
    return p === null ? null : 'owner' in p ? p.placeholder : p.body
  }

  /**
   * Whether node `n`'s region is claimed in this output: its text is its
   * owner's (a claim in scope, or a placeholder of this output at the place
   * of a region claimed for others), not part of the text around it.
   */
  isClaimed(n: RangeNode): boolean {
    const claim = n.claim
    return (
      claim !== null && (this.applies(claim) || this.ownPlaceholder(n) !== null)
    )
  }

  /** What a planner put at exactly `range`'s place for this output, kept or not: a claim in scope, or a placeholder. */
  placeholderAt(range: Range): Placeholder | RegionClaim | null {
    const n = this.set.regions.nodeOn(range)
    if (n === null) {
      return null
    }
    return n.claim !== null && this.applies(n.claim)
      ? n.claim
      : this.ownPlaceholder(n)
  }

  /** The planner's placeholder in scope at node `n`'s place (two that differ conflict). */
  private ownPlaceholder(n: RangeNode): Placeholder | null {
    const places = n.places
    if (places === null) {
      return null
    }
    let found: Placeholder | null = null
    for (const p of places) {
      if (RewriteSet.inScope(p.scope, this.output)) {
        found = same(found, p, n)
      }
    }
    return found
  }

  /** Whether the claim's placeholder belongs at its place in this output. */
  private applies(claim: RegionClaim): boolean {
    return (
      claim.scope === undefined || RewriteSet.inScope(claim.scope, this.output)
    )
  }

  /** Whether a node renders otherwise than its source: a walk renders it whole, never through it. */
  active(n: RangeNode): boolean {
    return (
      (n.edits !== null || n.places !== null || n.claim !== null) &&
      (this.placeholderOf(n) !== null || this.editOf(n) !== null)
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
    const skipAt = opts.skipAt ?? null
    // the inserts rendering at this level of the span are those it owns
    // (`RegionTable.insertOwnerAt`) at `[a, lastAt]` (from `a`: the cursors
    // start there), but at `skipAt`; with `includeEnd`, those at `b` too
    // where it is no end of the level
    const lastAt =
      opts.includeEnd === true && (root || b < level.end) ? b : b - 1
    let ci =
      children.length === 0 ? 0 : Math.max(0, lastStartingBy(children, a))
    let ii = inserts.length === 0 ? 0 : firstFrom(inserts, a)
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
      let ins: Edit | undefined = inserts[ii]
      if (ins !== undefined && ins.range.start > b) {
        ins = undefined
      }
      if (c === undefined && ins === undefined) {
        return
      }
      // the next item by position, an insert before a node at its position
      if (
        ins !== undefined &&
        (c === undefined || ins.range.start <= c.start)
      ) {
        ii++
        const at = ins.range.start
        if (
          at <= lastAt &&
          at !== skipAt &&
          this.set.insertLevel(ins) === level &&
          RewriteSet.inScope(ins.scope, output)
        ) {
          if (at > st.pos) {
            v.source(st.pos, at)
            st.pos = at
          }
          v.insert(ins)
        }
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
        continue
      }
      if (n.region !== null && v.member !== undefined) {
        if (n.start > st.pos) {
          v.source(st.pos, n.start)
          st.pos = n.start
        }
        if (v.member(n)) {
          st.pos = n.end
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
      } else {
        this.walkLevel(n, n.start, n.end, v, opts, st)
      }
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
    /**
     * `[s, e)` of `n` renders nowhere, but the kept claims inside it (read
     * elsewhere: their text renders in their owners), which the walk of it
     * finds (an active node inside is erased whole, but for those).
     */
    const erased = (n: RangeNode, s: number, e: number) => {
      let from = s
      const v: WalkVisitor = {
        source: () => {},
        insert: () => {},
        node: (c) => {
          if (c.claim !== null && this.keeps(c.claim)) {
            if (c.start > from) {
              out.push({ start: from, end: c.start })
            }
            text(c)
            from = c.end
          } else {
            this.walk(c, c.start, c.end, v)
          }
        },
      }
      this.walk(n, s, e, v)
      if (e > from) {
        out.push({ start: from, end: e })
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
   * exactly the range (its claim in this output relocates the range's text,
   * whose edits the caller reads), `around` the first node strictly holding
   * it; they decide as for a position (`decide`). `partial`: ask the
   * positions.
   */
  encloses(
    range: Range,
    own: RangeNode | null,
    around: RangeNode | null,
  ): 'all' | 'none' | 'partial' {
    if (own !== null && own.claim !== null) {
      const d = this.decides(own)
      if (d !== null) {
        return d === 'owner' ? 'all' : 'none'
      }
    }
    for (let x = around; x !== null; x = x.parent) {
      const e = this.editOf(x)
      if (e !== null) {
        const k = keeps(e.body, range)
        if (k !== 'all') {
          return k
        }
      }
      const d = this.decides(x)
      if (d !== null) {
        return d === 'owner' ? 'all' : 'none'
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

  /**
   * Whether this output keeps the claim: its placeholder in scope and its
   * occurrence renders, or other generated code reads its owner (in scope,
   * or with a placeholder of this output at its place).
   */
  private keeps(claim: RegionClaim): boolean {
    if (this.applies(claim)) {
      return (
        !this.occurrenceErased(claim) || this.set.readOwners().has(claim.owner)
      )
    }
    return (
      this.ownPlaceholder(this.set.claimNodes.get(claim)!) !== null &&
      this.set.readOwners().has(claim.owner)
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
   * What node `x`'s place decides about the text inside it, its edit
   * aside: `owner`, it renders in the owner of the claim read elsewhere
   * (kept, its occurrence's text not rendered here); `erased`, a place
   * without an owner stands for it; null, what is around it decides (an
   * unclaimed node; a kept claim's text renders where its occurrence does).
   */
  private decides(x: RangeNode): 'owner' | 'erased' | null {
    const p = this.placeholderOf(x)
    const claim = x.claim
    if (claim !== null && (p !== null || this.applies(claim))) {
      if (p !== null && p !== claim) {
        // (the placeholder of this output at the place of a region claimed for others)
        return this.set.readOwners().has(claim.owner) ? 'owner' : 'erased'
      }
      return this.occurrenceErased(claim) &&
        this.set.readOwners().has(claim.owner)
        ? 'owner'
        : null
    }
    return p !== null ? 'erased' : null
  }

  /**
   * Climbs from `from` to the root: inner first, the first node whose
   * edit erases the byte at `offset` decides it erased, the first whose
   * place decides (`decides`) decides; null when nothing does.
   */
  private decide(offset: number, from: RangeNode | null): boolean | null {
    for (let x = from; x !== null; x = x.parent) {
      if (x.edits !== null) {
        const e = this.editOf(x)
        if (e !== null && erases(e.body, offset)) {
          return true
        }
      }
      if (x.places !== null || x.claim !== null) {
        const d = this.decides(x)
        if (d !== null) {
          return d === 'erased'
        }
      }
    }
    return null
  }
}

/** `found`, or `e` when it is the first: two edits of one range that differ conflict. */
function same<T extends Edit>(found: T | null, e: T, n: RangeNode): T {
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
