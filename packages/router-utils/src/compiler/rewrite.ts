/**
 * The rewrite tree (see README.md, "Units, regions, edits").
 *
 * Planners emit `Edit`s against original ranges whose bodies are fragments:
 * retained slices (rendered with their own nested edits), structured text
 * (string parts and `SymRef`s), glue specifier literals (`spec`) and
 * context-aware reference rewrites (`ref`). Generated units own claimed
 * regions; the region renders inside the owner wherever the owner is homed
 * and a placeholder renders at the original occurrence.
 *
 * Per output the set builds a `RenderTree`: the scoped edits sorted, nested,
 * conflict-checked, plus the live claims as placeholder edits. Liveness is
 * a function of that tree.
 */
import type { Range } from './header'
import type { ClassifiedRef, RefContext } from './analysis'
import type { SymbolId } from './symbols'
import type { RegionId, RegionTable, UnitId } from './units'

export type OutputId = 'env' | `derived:${string}`
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

export interface Edit {
  range: Range
  body: ReadonlyArray<Frag>
  scope: EditScope
  by: string
  reason?: string
}

export type GenUnitId = number

export type Anchor =
  | { k: 'after-header' }
  | { k: 'before-unit' | 'after-unit'; unit: UnitId }
  | { k: 'end' }

export type SubstEnv = ReadonlyMap<SymbolId, RefTarget>

export interface GeneratedUnit {
  id: GenUnitId
  body: ReadonlyArray<Frag>
  declares: ReadonlyArray<SymbolId>
  effectful: boolean
  anchor: Anchor
  home: 'auto' | OutputId
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

export interface RegionClaim {
  region: RegionId
  owner: GenUnitId
  placeholder: ReadonlyArray<Frag>
  by: string
}

const NO_EDITS: ReadonlySet<TreeEdit> = new Set()

/** An internal edit of a render tree: a planner edit or a claim placeholder. */
export interface TreeEdit {
  range: Range
  body: ReadonlyArray<Frag>
  by: string
  seq: number
  /** The claimed region when this edit is a claim placeholder. */
  claim: RegionId | null
  /** Frozen core edits (DCE / export keyword) are internal. */
  internal: boolean
}

export class RewriteSet {
  readonly edits: Array<Edit & { seq: number }> = []
  readonly generated: Array<GeneratedUnit> = []
  readonly claims = new Map<RegionId, RegionClaim>()
  private seq = 0
  private version = 0
  private trees = new Map<string, { version: number; tree: RenderTree }>()

  constructor(private readonly regions: RegionTable) {}

  add(edit: Edit): void {
    this.edits.push({ ...edit, seq: this.seq++ })
    this.bump()
  }

  addGenerated(unit: Omit<GeneratedUnit, 'id'>): GenUnitId {
    const id = this.generated.length
    this.generated.push({ ...unit, id })
    this.bump()
    return id
  }

  claim(claim: RegionClaim): void {
    const prev = this.claims.get(claim.region)
    if (prev) {
      throw new Error(
        `region ${claim.region} is claimed twice (by ${prev.by} and ${claim.by})`,
      )
    }
    this.claims.set(claim.region, claim)
    this.bump()
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
    this.version++
  }

  /** Whether `output` is in `scope`. */
  static inScope(scope: EditScope, output: OutputId): boolean {
    return scope === 'all-outputs' || scope.includes(output)
  }

  /**
   * The render tree of an output: planner edits in scope plus `extra`
   * internal edits (statement-level DCE, export keyword drops) plus live
   * claim placeholders. Cached by version when `extra` is empty.
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
    // An edit addressed to every output on exactly a claimed region travels
    // with the region: it nests inside the claim (its seq above the claim's)
    const claimed: Array<{ range: Range; seq: number }> = []
    for (const claim of this.claims.values()) {
      claimed.push({
        range: this.regions.get(claim.region).range,
        seq: claimSeq(claim.region),
      })
    }
    for (const e of this.edits) {
      if (RewriteSet.inScope(e.scope, output)) {
        let seq = e.seq
        if (e.scope === 'all-outputs') {
          for (const c of claimed) {
            if (
              c.range.start === e.range.start &&
              c.range.end === e.range.end
            ) {
              seq = c.seq + 0.5
              break
            }
          }
        }
        edits.push({
          range: e.range,
          body: e.body,
          by: e.by,
          seq,
          claim: null,
          internal: false,
        })
      }
    }
    for (const x of extra) {
      edits.push(x)
    }
    // Claims: live iff the region's occurrence is not erased by an edit
    // strictly enclosing it. An edit scoped to this output on exactly the
    // region replaces the placeholder here (it sorts before the claim); one
    // addressed to every output nests inside the claim and renders where the
    // region does, inside its owner.
    const base = new RenderTree(edits, this.regions)
    for (const claim of this.claims.values()) {
      const region = this.regions.get(claim.region)
      if (base.isErasedAt(region.range.start, null, region.range)) {
        continue
      }
      edits.push({
        range: region.range,
        body: claim.placeholder,
        by: claim.by,
        seq: claimSeq(claim.region),
        claim: claim.region,
        internal: false,
      })
    }
    const tree = new RenderTree(edits, this.regions)
    if (cacheable) {
      this.trees.set(output, { version: this.version, tree })
    }
    return tree
  }

  /** Whether a claim is live in `output` (its region's occurrence renders there: an erased ancestor suppresses it). */
  claimLive(region: RegionId, output: OutputId): boolean {
    return this.tree(output).hasClaim(region)
  }

  liveness(output: OutputId): LivenessView {
    const tree = this.tree(output)
    return {
      live: (ref) => !tree.isErasedAt(ref.range.start),
      isErased: (range) => tree.isErasedRange(range),
    }
  }
}

export interface LivenessView {
  live: (ref: ClassifiedRef) => boolean
  isErased: (range: Range) => boolean
}

/** The sequence of a claim's placeholder edit: above every planner edit, so that an edit on exactly the claimed region nests inside it (or, scoped, replaces it). */
function claimSeq(region: RegionId): number {
  return 1e9 + region
}

function fragsEqual(a: ReadonlyArray<Frag>, b: ReadonlyArray<Frag>): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Edits of one output sorted by (start asc, zero-width first, end desc,
 * seq asc), nested by containment and conflict-checked.
 */
export class RenderTree {
  readonly edits: Array<TreeEdit>
  private readonly claimRegions = new Set<RegionId>()

  constructor(
    edits: Array<TreeEdit>,
    private readonly regions: RegionTable,
  ) {
    const sorted = [...edits].sort(
      (a, b) =>
        a.range.start - b.range.start ||
        Number(b.range.start === b.range.end) -
          Number(a.range.start === a.range.end) ||
        b.range.end - a.range.end ||
        a.seq - b.seq,
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
      if (e.claim !== null) {
        this.claimRegions.add(e.claim)
      }
    }
    this.edits = out
  }

  hasClaim(region: RegionId): boolean {
    return this.claimRegions.has(region)
  }

  /** Whether `e` replaces the placeholder of a live claimed region (an edit on exactly the region, outside the claim). */
  private overridesClaim(e: TreeEdit): boolean {
    for (const region of this.claimRegions) {
      const r = this.regions.get(region).range
      if (r.start === e.range.start && r.end === e.range.end) {
        return this.overrideOf(region) === e
      }
    }
    return false
  }

  /** Whether the claim's placeholder renders here (live and not overridden by an edit on exactly the region). */
  placeholderRenders(region: RegionId): boolean {
    return this.claimRegions.has(region) && this.overrideOf(region) === null
  }

  /**
   * The planner edit on exactly a live claimed region that encloses the
   * claim (scoped to this output): it replaces the placeholder here (the
   * region's text stays relocated to its owner), so what it renders is read
   * where the placeholder would be. An edit nested inside the claim (one
   * addressed to every output) travels with the region instead.
   */
  overrideOf(region: RegionId): TreeEdit | null {
    if (!this.claimRegions.has(region)) {
      return null
    }
    const r = this.regions.get(region).range
    for (const e of this.edits) {
      if (e.range.start > r.start) {
        break
      }
      if (e.range.start !== r.start || e.range.end !== r.end) {
        continue
      }
      if (e.claim !== null) {
        return null
      }
      return e
    }
    return null
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
   * The chain of edits containing `offset`, outermost first. Claim
   * placeholders are transparent: relocation is not erasure — the
   * region's text renders inside its owner.
   */
  private containing(offset: number): Array<TreeEdit> {
    const out: Array<TreeEdit> = []
    for (const e of this.edits) {
      if (e.range.start > offset) {
        break
      }
      if (e.claim === null && e.range.start <= offset && offset < e.range.end) {
        out.push(e)
      }
    }
    return out
  }

  /**
   * Whether the original byte at `offset` renders in no output text (erased
   * by an edit). With `until`, only edits enclosing `until` are consulted
   * (does the text at `until`'s position render?).
   */
  isErasedAt(
    offset: number,
    until: TreeEdit | null = null,
    strictlyEnclosing: Range | null = null,
  ): boolean {
    const chain = this.containing(offset)
    for (const e of chain) {
      if (
        until !== null &&
        (e === until ||
          (e.range.start >= until.range.start &&
            e.range.end <= until.range.end &&
            e !== until &&
            e.seq >= until.seq))
      ) {
        break
      }
      if (
        strictlyEnclosing !== null &&
        e.range.start >= strictlyEnclosing.start &&
        e.range.end <= strictlyEnclosing.end
      ) {
        break
      }
      // Is offset covered by a slice frag of e's body?
      let covered = false
      for (const f of e.body) {
        if (
          f.k === 'slice' &&
          f.range.start <= offset &&
          offset < f.range.end
        ) {
          covered = true
          break
        }
        if (f.k === 'ref' && f.range.start <= offset && offset < f.range.end) {
          covered = true
          break
        }
      }
      if (!covered) {
        return true
      }
    }
    return false
  }

  /** Whether an edit of this tree renders (its position is not erased by an enclosing edit). */
  editRenders(e: TreeEdit): boolean {
    return !this.isErasedAt(e.range.start, e)
  }

  /** Whether every byte of `range` is erased. */
  isErasedRange(range: Range): boolean {
    if (range.end <= range.start) {
      return this.isErasedAt(range.start)
    }
    // Erasure is piecewise over edit boundaries; sample every boundary inside the range.
    const points = new Set<number>([range.start])
    for (const e of this.edits) {
      if (e.range.start >= range.end) {
        break
      }
      if (e.range.start > range.start && e.range.start < range.end) {
        points.add(e.range.start)
      }
      if (e.range.end > range.start && e.range.end < range.end) {
        points.add(e.range.end)
      }
      for (const f of e.body) {
        if (f.k === 'slice' || f.k === 'ref') {
          if (f.range.start > range.start && f.range.start < range.end) {
            points.add(f.range.start)
          }
          if (f.range.end > range.start && f.range.end < range.end) {
            points.add(f.range.end)
          }
        }
      }
    }
    for (const p of points) {
      if (!this.isErasedAt(p)) {
        return false
      }
    }
    return true
  }

  /** The erased parts of this tree inside `[start, end)` (for provenance). */
  erasedParts(start: number, end: number): Array<Range> {
    const out: Array<Range> = []
    // `excluded`: the edits on exactly the visited range already looked
    // through (a claim, its override, an edit whose slice keeps its whole
    // range), so that the edits nested under them are found
    const visit = (s: number, e: number, excluded: ReadonlySet<TreeEdit>) => {
      for (const ed of this.topLevelWithin(s, e, excluded)) {
        if (ed.range.start === ed.range.end) {
          continue
        }
        if (ed.claim !== null || this.overridesClaim(ed)) {
          // relocation, not erasure: look for erasing edits inside the region
          visit(ed.range.start, ed.range.end, new Set([...excluded, ed]))
          continue
        }
        let pos = ed.range.start
        const covered: Array<Range> = []
        for (const f of ed.body) {
          if (f.k === 'slice' || f.k === 'ref') {
            covered.push(f.range)
          }
        }
        covered.sort((a, b) => a.start - b.start)
        for (const c of covered) {
          if (c.start > pos) {
            out.push({ start: pos, end: c.start })
          }
          if (c.end > pos) {
            pos = c.end
          }
        }
        if (ed.range.end > pos) {
          out.push({ start: pos, end: ed.range.end })
        }
        for (const f of ed.body) {
          if (f.k === 'slice') {
            visit(
              f.range.start,
              f.range.end,
              f.range.start === ed.range.start && f.range.end === ed.range.end
                ? new Set([...excluded, ed])
                : NO_EDITS,
            )
          }
        }
      }
    }
    visit(start, end, NO_EDITS)
    return out
  }
}
