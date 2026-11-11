/**
 * Placement, stage 2: what each cluster reads, per output, and what each
 * member's evaluation runs. A cluster's reads in an output are what the
 * walk of its members' text there renders (`OutputView.walk`): the
 * references of the source it renders, the symbols the generated text and
 * the placeholders it renders name; its successors are the clusters those
 * reads lead to. Memoised per output: a pure function of the cluster and
 * the output's tree. What a member runs when it evaluates (`runs`) is the
 * same walk of its text in the env module, read for its references.
 */
import { visitRuns } from '../analysis'
import { RewriteSet } from '../rewrite'
import { callsWhenEvaluated } from '../units'
import { NEED_KINDS, symRefsOf } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { EvaluatedCalls, RegionId, UnitId } from '../units'
import type {
  Frag,
  OutputId,
  OutputView,
  PlannerEdit,
  RangeNode,
  Region,
  WalkVisitor,
} from '../rewrite'
import type { PlacementInput } from '../reach'
import type { Range } from '../header'

const NO_REFS: ReadonlyArray<ClassifiedRef> = []

export interface ClusterReads {
  syms: Set<SymbolId>
  children: Set<ClusterId>
}

export interface ReadIndex {
  /**
   * What cluster `c` reads in output `o`: `live`, what renders there;
   * otherwise every reference of its text, erased or not (the env module's
   * source, for provenance and the export companions).
   */
  clusterReads: (c: ClusterId, o: OutputId, live: boolean) => ClusterReads
  /** The clusters `c`'s reads in `o` lead to (`live` as for `clusterReads`). */
  successors: (
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ) => ReadonlyArray<ClusterId>
  /**
   * The clusters output `o` reaches from `roots` over live reads. A cluster
   * in `stopAt` is reached but not followed (`o` imports it from its own
   * output); `readsOutput` names the output whose tree decides a cluster's
   * reads (default `o`'s).
   */
  reach: (
    o: OutputId,
    roots: Iterable<ClusterId>,
    stopAt?: ReadonlySet<ClusterId> | null,
    readsOutput?: ((c: ClusterId) => OutputId) | null,
  ) => Set<ClusterId>
  /**
   * What evaluating region `r` in the env module runs (`visitRuns`, the one
   * definition): the references of its text there (a region nested in it
   * that the env module does not claim is its text, a claimed one
   * evaluates with its owner), the functions it passes to a call and the
   * bodies it may call. A function declaration evaluates nothing. `visit`
   * sees each reference with where it runs; true ends the walk (the
   * result).
   */
  runs: (r: RegionId, visit: RunVisitor) => boolean
  /** `runs` of every region of cluster `c` (its generated units are the compiler's: they run nothing of the source). */
  clusterRuns: (c: ClusterId, visit: RunVisitor) => boolean
}

/** Sees a reference an evaluation runs, with where it runs; true ends the walk. */
export type RunVisitor = (ref: ClassifiedRef, at: number) => boolean

interface MemberReads {
  syms: Array<SymbolId>
  children: Array<RegionId>
  /** In the env module (live): the references of the text the walk renders (what `runs` reads; the children's are theirs). */
  refs: Array<ClassifiedRef> | null
}

/**
 * Per region, derived once per plan from the sub-regions, the tree's nodes
 * and the inserts: the regions nesting directly in it (source order), where
 * a unit is in the tree, what its own text holds of the tree in walk order
 * (the nodes whose edits and placeholders are its text's, and the claimed
 * regions nested in it) and the inserts it holds
 * (`RegionTable.insertOwnerAt`).
 */
interface RegionIndex {
  children: Array<Array<RegionId> | undefined>
  /** Per unit region: the node on exactly its range (none: undefined). */
  ownNode: Array<RangeNode | undefined>
  /** Per unit region: the first marked node holding it whole (none: undefined, the module). */
  aroundNode: Array<RangeNode | undefined>
  text: Array<Array<RangeNode> | undefined>
  inserts: Array<Array<PlannerEdit> | undefined>
}

const NO_REGIONS: ReadonlyArray<RegionId> = []
const NO_NODES: ReadonlyArray<RangeNode> = []
const NO_INSERTS: ReadonlyArray<PlannerEdit> = []

export function readIndex(
  input: PlacementInput,
  graph: ClusterGraph,
): ReadIndex {
  const { t1, rewrites } = input
  const { symbols } = t1
  const { regions } = rewrites
  const { clusters, clusterOfRegion, clusterOfSym, ownedRefs } = graph
  const { viewOf, isLive } = graph
  const regionCount = regions.regions.length
  const gens = rewrites.generated

  // ---- the regions' nesting and text, once per plan ----------------------
  let index: RegionIndex | null = null
  const regionIndex = (): RegionIndex => {
    if (index !== null) {
      return index
    }
    const children: RegionIndex['children'] = []
    const text: RegionIndex['text'] = []
    const inserts: RegionIndex['inserts'] = []
    const push = <T>(lists: Array<Array<T> | undefined>, id: RegionId, x: T) =>
      (lists[id] ??= []).push(x)
    const unitRegions = regions.regions
      .filter((r) => r.unit !== null)
      .sort((x, y) => x.range.start - y.range.start)
    const subRegions = regions.regions
      .filter((r) => r.unit === null)
      .sort(
        (x, y) => x.range.start - y.range.start || y.range.end - x.range.end,
      )
    for (const r of subRegions) {
      const parent = regions.parentOf(r.id)
      if (parent !== null) {
        push(children, parent, r.id)
      }
    }
    // one walk of the marked nodes: a node with a region starts that
    // region's text (a claimed one is read where it nests), the others are
    // the text of the region around them
    const visit = (n: RangeNode, around: RegionId | null) => {
      let holder = around
      if (n.region !== null && n.region !== around) {
        if (around !== null && rewrites.claims.has(n.region)) {
          push(text, around, n)
        }
        holder = n.region
      }
      if (holder !== null && (n.edits !== null || n.places !== null)) {
        push(text, holder, n)
      }
      for (const c of n.children) {
        if (c.marked) {
          visit(c, holder ?? regions.unitAt(c.start, c.end)?.id ?? null)
        }
      }
    }
    visit(regions.module, null)
    for (const e of rewrites.inserts) {
      // (`RewriteSet` refused an insert without an owner)
      push(inserts, regions.insertOwnerAt(e.range.start)!.region, e)
    }
    // where each unit is: a merge of the units with the module's nodes (both
    // in source order); a unit no node holds has none inside or around it
    // but the module's
    const ownNode: RegionIndex['ownNode'] = []
    const aroundNode: RegionIndex['aroundNode'] = []
    const top = regions.module.children
    let k = 0
    for (const r of unitRegions) {
      const { start, end } = r.range
      while (k < top.length && top[k]!.end <= start) {
        k++
      }
      const c = top[k]
      if (c !== undefined && c.start <= start && c.end >= end) {
        const n = regions.nodeOn(r.range)
        ownNode[r.id] = n ?? undefined
        aroundNode[r.id] = n ?? regions.nodeAround(r.range)
      }
    }
    index = { children, text, inserts, ownNode, aroundNode }
    return index
  }

  // ---- member reads -----------------------------------------------------
  // members: regions by id, then generated units (`regionCount + id`); per
  // output (live reads) or for the dead walk, an array indexed by member
  const memberReadsByOutput = new Map<
    OutputId,
    Array<MemberReads | undefined>
  >()
  const deadMemberReads: Array<MemberReads | undefined> = []
  /**
   * Pushes the reads of the references of `list` (sorted) starting in
   * `[s, e)`, those live in `live` only when given; and, in the env module,
   * the references themselves (`MemberReads.refs`, every kind).
   */
  const refReads = (
    list: ReadonlyArray<ClassifiedRef>,
    s: number,
    e: number,
    live: OutputId | null,
    into: MemberReads,
  ) => {
    const refs = into.refs
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid]!.range.start < s) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo; i < list.length; i++) {
      const ref = list[i]!
      if (ref.range.start >= e) {
        break
      }
      if (live !== null && !isLive(ref, live)) {
        continue
      }
      if (refs !== null) {
        refs.push(ref)
      }
      if (NEED_KINDS.has(ref.kind)) {
        into.syms.push(ref.sym)
      }
    }
  }

  /** Pushes the regions nested in `id` that no output claims (its successors). */
  const pushChildren = (id: RegionId, into: MemberReads) => {
    for (const cid of regionIndex().children[id] ?? NO_REGIONS) {
      if (!rewrites.claims.has(cid)) {
        into.children.push(cid)
      }
    }
  }

  // ---- the live reads of a region: one walk of its text, one visitor ----
  // (the member being read; the walk does not re-enter a member's reads)
  let view!: OutputView
  let output!: OutputId
  let into!: MemberReads
  /** Its own node (the walk renders its text), if any. */
  let own: RangeNode | null = null
  /** The references of the text being walked: the member's, or those of a region nested in it claimed only for other outputs. */
  let owned: ReadonlyArray<ClassifiedRef> = NO_REFS
  /** Only part of its text renders: each read asks its position. */
  let partial = false
  /** What a body standing for node `n` reads (its slices walked, its references among `owned`). */
  const read = (n: RangeNode, body: ReadonlyArray<Frag>) => {
    symRefsOf(body, into.syms)
    for (const f of body) {
      if (f.k === 'slice') {
        view.walk(n, f.range.start, f.range.end, reader)
      } else if (f.k === 'ref') {
        // (a rewritten reference keeps the one it rewrites)
        refReads(
          owned,
          f.range.start,
          f.range.end,
          partial ? output : null,
          into,
        )
      }
    }
  }
  /** The member's own node: its text (an unclaimed one's place, when a placeholder stands for it). */
  const readOwn = () => {
    const n = own!
    const body = view.isClaimed(n)
      ? view.textOf(n)
      : (view.placeOf(n) ?? view.textOf(n))
    if (body !== null) {
      read(n, body)
    } else {
      view.walk(n, n.start, n.end, reader)
    }
  }
  const reader: WalkVisitor = {
    source: (s, e) => refReads(owned, s, e, partial ? output : null, into),
    node: (n) => {
      if (n === own) {
        readOwn()
      } else if (!(partial && view.isErasedAt(n.start))) {
        read(n, (view.placeOf(n) ?? view.textOf(n))!)
      }
    },
    insert: (e) => {
      if (!partial || !view.isErasedAt(e.range.start)) {
        symRefsOf(e.body, into.syms)
      }
    },
    member: (n) => {
      if (n === own) {
        return false
      }
      const cid = n.region!
      if (!rewrites.claims.has(cid)) {
        return true // (a successor)
      }
      if (view.isClaimed(n)) {
        // its text is its owner's: what stands at its place is read here
        const place = view.placeOf(n)
        if (place !== null && !(partial && view.isErasedAt(n.start))) {
          symRefsOf(place, into.syms)
        }
        return true
      }
      // claimed for other outputs: in this one its text is this member's
      const outer = owned
      owned = ownedRefs.get(cid) ?? NO_REFS
      const text = view.textOf(n)
      if (text === null) {
        view.walk(n, n.start, n.end, reader)
      } else if (!(partial && view.isErasedAt(n.start))) {
        read(n, text)
      }
      owned = outer
      pushChildren(cid, into)
      return true
    },
  }

  /**
   * What a region reads in output `o`: one walk of its text there
   * (`OutputView.walk`). The source it renders reads the references it owns
   * (inside it, outside the regions nested in it); an active node, an insert
   * and the place of a claimed region nested in it read what their bodies
   * name. Whether the text renders at all is decided around it
   * (`OutputView.encloses`); when only part of it does, each read asks its
   * position. The regions nested in it are its successors, unless claimed.
   */
  function regionReads(r: Region, o: OutputId, to: MemberReads): void {
    pushChildren(r.id, to)
    const { ownNode, aroundNode } = regionIndex()
    const id = r.id
    let at: RangeNode
    if (r.unit !== null) {
      own = ownNode[id] ?? null
      at = aroundNode[id] ?? regions.module
    } else {
      own = regions.nodeOn(r.range)
      at = own!
    }
    view = viewOf(o)
    const verdict = view.encloses(r.range, own, own !== null ? own.parent : at)
    if (verdict === 'none') {
      return
    }
    output = o
    into = to
    owned = ownedRefs.get(id) ?? NO_REFS
    partial = verdict === 'partial'
    if (own === null) {
      view.walk(at, r.range.start, r.range.end, reader)
    } else if (r.unit !== null && own.parent !== null) {
      // (from the level around it: an insert at a unit's start is the unit's)
      view.walk(own.parent, r.range.start, r.range.end, reader)
    } else {
      readOwn()
    }
  }

  /**
   * What a region's text names, rendered or not (the env module's source:
   * provenance and the export companions): the references it owns, the
   * bodies of the edits, placeholders and inserts of `o` in its text, the
   * places of the regions claimed in `o` nested in it (the text of one
   * claimed only for other outputs is its own).
   */
  function sourceReads(r: Region, o: OutputId, into: MemberReads): void {
    const { inserts } = regionIndex()
    refReads(
      ownedRefs.get(r.id) ?? NO_REFS,
      r.range.start,
      r.range.end,
      null,
      into,
    )
    textReads(r.id, o, into)
    for (const e of inserts[r.id] ?? NO_INSERTS) {
      if (RewriteSet.inScope(e.scope, o)) {
        symRefsOf(e.body, into.syms)
      }
    }
    pushChildren(r.id, into)
  }

  /** What the tree holds in region `id`'s text in `o` (`sourceReads`). */
  function textReads(id: RegionId, o: OutputId, into: MemberReads): void {
    const view = viewOf(o)
    for (const n of regionIndex().text[id] ?? NO_NODES) {
      const nested = n.region
      if (nested !== null && nested !== id) {
        // a claimed region nested in it: its place, or its text when
        // claimed only for other outputs
        if (view.isClaimed(n)) {
          const place = view.placeholderAt(n)!
          symRefsOf(
            'owner' in place ? place.placeholder : place.body,
            into.syms,
          )
        } else {
          refReads(ownedRefs.get(nested) ?? NO_REFS, n.start, n.end, null, into)
          textReads(nested, o, into)
          pushChildren(nested, into)
        }
        continue
      }
      for (const e of n.edits ?? []) {
        if (RewriteSet.inScope(e.scope, o)) {
          symRefsOf(e.body, into.syms)
        }
      }
      for (const p of n.places ?? []) {
        if (RewriteSet.inScope(p.scope, o)) {
          symRefsOf(p.body, into.syms)
        }
      }
    }
  }

  function memberReads(m: number, o: OutputId, live: boolean): MemberReads {
    let byMember: Array<MemberReads | undefined>
    if (live) {
      const hit = memberReadsByOutput.get(o)
      if (hit) {
        byMember = hit
      } else {
        byMember = []
        memberReadsByOutput.set(o, byMember)
      }
    } else {
      byMember = deadMemberReads
    }
    const hit = byMember[m]
    if (hit) {
      return hit
    }
    const into: MemberReads = {
      syms: [],
      children: [],
      refs: live && o === 'env' && m < regionCount ? [] : null,
    }
    if (m < regionCount) {
      if (live) {
        regionReads(regions.get(m), o, into)
      } else {
        sourceReads(regions.get(m), o, into)
      }
    } else {
      // (a claimed region it names reads itself: the same cluster)
      symRefsOf(gens[m - regionCount]!.body, into.syms)
    }
    byMember[m] = into
    return into
  }

  // ---- reads per (cluster, output) -----------------------------------------
  // per output (live reads) or for the dead walk, an array indexed by cluster id
  const clusterReadsByOutput = new Map<
    OutputId,
    Array<ClusterReads | undefined>
  >()
  const deadClusterReads: Array<ClusterReads | undefined> = []
  function clusterReads(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): ClusterReads {
    let byCluster: Array<ClusterReads | undefined>
    if (live) {
      const hit = clusterReadsByOutput.get(o)
      if (hit) {
        byCluster = hit
      } else {
        byCluster = []
        clusterReadsByOutput.set(o, byCluster)
      }
    } else {
      byCluster = deadClusterReads
    }
    const hit = byCluster[c]
    if (hit) {
      return hit
    }
    const syms = new Set<SymbolId>()
    const children = new Set<ClusterId>()
    const cl: Cluster = clusters[c]!
    const add = (reads: MemberReads) => {
      for (const s of reads.syms) {
        syms.add(s)
      }
      for (const ch of reads.children) {
        children.add(clusterOfRegion.get(ch)!)
      }
    }
    for (const r of cl.regions) {
      add(memberReads(r, o, live))
    }
    for (const g of cl.gens) {
      add(memberReads(regionCount + g, o, live))
    }
    const reads: ClusterReads = { syms, children }
    byCluster[c] = reads
    return reads
  }

  // the clusters a cluster's reads lead to, per output whose tree decided
  // them (a pure function of the cluster and that output: cached as such,
  // whatever output asked)
  const successorsByOutput = new Map<
    OutputId,
    Array<ReadonlyArray<ClusterId> | undefined>
  >()
  const deadSuccessors: Array<ReadonlyArray<ClusterId> | undefined> = []
  function successors(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): ReadonlyArray<ClusterId> {
    let byCluster: Array<ReadonlyArray<ClusterId> | undefined>
    if (live) {
      const hit = successorsByOutput.get(o)
      if (hit) {
        byCluster = hit
      } else {
        byCluster = []
        successorsByOutput.set(o, byCluster)
      }
    } else {
      byCluster = deadSuccessors
    }
    const hit = byCluster[c]
    if (hit) {
      return hit
    }
    const out: Array<ClusterId> = []
    const { syms, children } = clusterReads(c, o, live)
    for (const s of syms) {
      if (!symbols.isModuleLevel(s)) {
        continue
      }
      const d = clusterOfSym.get(s)
      if (d !== undefined && d !== c && !out.includes(d)) {
        out.push(d)
      }
    }
    for (const ch of children) {
      if (ch !== c && !out.includes(ch)) {
        out.push(ch)
      }
    }
    byCluster[c] = out
    return out
  }

  function reach(
    o: OutputId,
    roots: Iterable<ClusterId>,
    stopAt: ReadonlySet<ClusterId> | null = null,
    readsOutput: ((c: ClusterId) => OutputId) | null = null,
  ): Set<ClusterId> {
    const included = new Set<ClusterId>()
    const work = [...roots]
    while (work.length > 0) {
      const c = work.pop()!
      if (included.has(c)) {
        continue
      }
      included.add(c)
      if (stopAt !== null && stopAt.has(c)) {
        continue // imported from its own output: its dependencies are that output's
      }
      const next = successors(
        c,
        readsOutput === null ? o : readsOutput(c),
        true,
      )
      for (let i = 0; i < next.length; i++) {
        work.push(next[i]!)
      }
    }
    return included
  }

  // ---- what an evaluation runs: the references of its reads' walk --------
  /**
   * Per region: the references of its text in the env module, those of the
   * unclaimed regions nested in it with them (its successors there: their
   * text evaluates with it). The env module's walk of its reads gives them.
   */
  const textOfRegion: Array<ReadonlyArray<ClassifiedRef> | undefined> = []
  function regionText(id: RegionId): ReadonlyArray<ClassifiedRef> {
    const hit = textOfRegion[id]
    if (hit !== undefined) {
      return hit
    }
    const own = memberReads(id, 'env', true)
    let text: ReadonlyArray<ClassifiedRef> = own.refs!
    if (own.children.length > 0) {
      text = [...text]
      for (const c of own.children) {
        ;(text as Array<ClassifiedRef>).push(...regionText(c))
      }
    }
    textOfRegion[id] = text
    return text
  }
  /** Per unit: what its evaluation calls (`callsWhenEvaluated`). */
  const callsOfUnit: Array<EvaluatedCalls | undefined> = []
  const unitCalls = (u: UnitId): EvaluatedCalls =>
    (callsOfUnit[u] ??= callsWhenEvaluated(t1.units[u]!.node))
  /**
   * What a region nested in a unit calls when it evaluates: the unit's
   * calls inside it, but for those inside a function it holds that only a
   * call around it receives (`createServerFn().handler(() => …)`: the
   * handler's region evaluates a function, the call around it may run it).
   */
  const callsOfRegion: Array<EvaluatedCalls | null | undefined> = []
  const regionCalls = (r: Region, unit: UnitId): EvaluatedCalls | null => {
    const hit = callsOfRegion[r.id]
    if (hit !== undefined) {
      return hit
    }
    const all = unitCalls(unit)
    const { start, end } = r.range
    const inside = (x: Range) => x.start >= start && x.end <= end
    const held = all.callbacks.filter((f) => inside(f) && !inside(f.call))
    const own = (x: Range) =>
      inside(x) && !held.some((f) => x.start >= f.start && x.end <= f.end)
    const calls = all.calls.filter(own)
    const result: EvaluatedCalls | null =
      calls.length === 0
        ? null
        : {
            calls,
            callbacks: all.callbacks.filter((f) => own(f) && inside(f.call)),
          }
    callsOfRegion[r.id] = result
    return result
  }
  const bodyOf = (u: UnitId) => regionText(t1.units[u]!.region)
  function runs(id: RegionId, visit: RunVisitor): boolean {
    const r = regions.get(id)
    let calls: EvaluatedCalls | null = null
    if (r.unit !== null) {
      const all = unitCalls(r.unit)
      calls = all.calls.length > 0 ? all : null
    } else {
      const unit = regions.unitAt(r.range.start, r.range.end)?.unit
      calls = unit === undefined || unit === null ? null : regionCalls(r, unit)
    }
    return visitRuns(t1, regionText(id), calls, bodyOf, visit)
  }
  function clusterRuns(c: ClusterId, visit: RunVisitor): boolean {
    for (const r of clusters[c]!.regions) {
      if (runs(r, visit)) {
        return true
      }
    }
    return false
  }

  return { clusterReads, successors, reach, runs, clusterRuns }
}
