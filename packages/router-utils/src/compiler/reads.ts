/**
 * What each cluster reads, per output. A cluster's reads in an output are
 * what the walk of its members' text there renders (`OutputView.walk`): the
 * references of the source it renders, the symbols the generated text and
 * the placeholders it renders name; its successors are the clusters those
 * reads lead to. Memoised per output: a pure function of the cluster and
 * the output's tree.
 */
import { NEED_KINDS, symRefsOf } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ClassifiedRef } from './analysis'
import type { SymbolId } from './symbols'
import type { RegionId } from './units'
import type {
  Edit,
  Frag,
  GenFrag,
  OutputId,
  OutputView,
  RangeNode,
  Region,
  WalkVisitor,
} from './rewrite'
import type { PlacementInput } from './placement'

const NO_REFS: ReadonlyArray<ClassifiedRef> = []

/** The symbols a cluster reads in one output. */
export type ClusterReads = ReadonlySet<SymbolId>

export interface ReadIndex {
  /**
   * What cluster `c` reads in output `o`: `live`, what renders there;
   * otherwise every reference of its text, erased or not (the env module's
   * source, for provenance).
   */
  clusterReads: (c: ClusterId, o: OutputId, live: boolean) => ClusterReads
  /** The clusters `c`'s reads in `o` lead to (`live` as for `clusterReads`). */
  successors: (
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ) => ReadonlyArray<ClusterId>
  /**
   * The rewrite tree changed (the core wrote its removals): what renders is
   * read anew. What a text names in the source does not change with them
   * (a removal's body names nothing).
   */
  treeChanged: () => void
}

/** The symbols a member (a region, a generated unit) reads, with repeats. */
type MemberReads = Array<SymbolId>

/**
 * Per region, derived once per plan from the tree's nodes and the inserts:
 * where a unit is in the tree, what its own text holds of the tree in walk order
 * (the nodes whose edits and placeholders are its text's, and the claimed
 * regions nested in it) and the inserts it holds
 * (`RegionTable.insertOwnerAt`).
 */
interface RegionIndex {
  /** Per unit region: the node on exactly its range (none: undefined). */
  ownNode: Array<RangeNode | undefined>
  /** Per unit region: the first marked node holding it whole (none: undefined, the module). */
  aroundNode: Array<RangeNode | undefined>
  text: Array<Array<RangeNode> | undefined>
  inserts: Array<Array<Edit> | undefined>
}

const NO_NODES: ReadonlyArray<RangeNode> = []
const NO_INSERTS: ReadonlyArray<Edit> = []

export function readIndex(
  input: PlacementInput,
  graph: ClusterGraph,
): ReadIndex {
  const { t1, rewrites } = input
  const { symbols } = t1
  const { regions } = rewrites
  const { clusters, clusterOfSym, ownedRefs } = graph
  const { viewOf } = graph
  const regionCount = regions.regions.length
  const gens = rewrites.generated

  // ---- the regions' nesting and text, once per plan ----------------------
  let index: RegionIndex | null = null
  const regionIndex = (): RegionIndex => {
    if (index !== null) {
      return index
    }
    const text: RegionIndex['text'] = []
    const inserts: RegionIndex['inserts'] = []
    const push = <T>(lists: Array<Array<T> | undefined>, id: RegionId, x: T) =>
      (lists[id] ??= []).push(x)
    const unitRegions = regions.regions
      .filter((r) => r.unit !== null)
      .sort((x, y) => x.range.start - y.range.start)
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
    index = { text, inserts, ownNode, aroundNode }
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
  /** Pushes the reads of the references of `list` (sorted) starting in `[s, e)`. */
  const refReads = (
    list: ReadonlyArray<ClassifiedRef>,
    s: number,
    e: number,
    into: MemberReads,
  ) => {
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
      if (NEED_KINDS.has(ref.kind)) {
        into.push(ref.sym)
      }
    }
  }

  // ---- the live reads of a region: one walk of its text, one visitor ----
  // (the member being read; the walk does not re-enter a member's reads)
  let view!: OutputView
  let into!: MemberReads
  /** Its own node (the walk renders its text), if any. */
  let own: RangeNode | null = null
  /** The references of the text being walked: the member's, or those of a region nested in it claimed only for other outputs. */
  let owned: ReadonlyArray<ClassifiedRef> = NO_REFS
  /** Pushes what generated text names. */
  const named = (body: ReadonlyArray<Frag | GenFrag>) => {
    symRefsOf(body, into)
  }
  /** What a body standing for node `n` reads (its slices walked, its references among `owned`). */
  const read = (n: RangeNode, body: ReadonlyArray<Frag>) => {
    named(body)
    for (const f of body) {
      if (f.k === 'slice') {
        view.walk(n, f.range.start, f.range.end, reader)
      } else if (f.k === 'ref') {
        // (a rewritten reference keeps the one it rewrites)
        refReads(owned, f.range.start, f.range.end, into)
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
    source: (s, e) => refReads(owned, s, e, into),
    node: (n) => {
      if (n === own) {
        readOwn()
      } else {
        read(n, (view.placeOf(n) ?? view.textOf(n))!)
      }
    },
    insert: (e) => named(e.body),
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
        if (place !== null) {
          named(place)
        }
        return true
      }
      // claimed for other outputs: in this one its text is this member's
      const outer = owned
      owned = ownedRefs.get(cid) ?? NO_REFS
      const text = view.textOf(n)
      if (text === null) {
        view.walk(n, n.start, n.end, reader)
      } else {
        read(n, text)
      }
      owned = outer
      return true
    },
  }

  /**
   * What a region reads in output `o`: one walk of its text there
   * (`OutputView.walk`). The source it renders reads the references it owns
   * (inside it, outside the regions nested in it); an active node, an insert
   * and the place of a claimed region nested in it read what their bodies
   * name. Whether the text renders is decided around it
   * (`OutputView.encloses`), for all of it. An unclaimed region nested in it is in its cluster
   * (`clusters.ts`): its reads are the cluster's.
   */
  function regionReads(r: Region, o: OutputId, to: MemberReads): void {
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
    if (!view.encloses(r.range, own, own !== null ? own.parent : at)) {
      return
    }
    into = to
    owned = ownedRefs.get(id) ?? NO_REFS
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
   * provenance): the references it owns, the
   * bodies of the edits, placeholders and inserts of `o` in its text, the
   * places of the regions claimed in `o` nested in it (the text of one
   * claimed only for other outputs is its own).
   */
  function sourceReads(r: Region, o: OutputId, into: MemberReads): void {
    const { inserts } = regionIndex()
    refReads(ownedRefs.get(r.id) ?? NO_REFS, r.range.start, r.range.end, into)
    textReads(r.id, o, into)
    for (const e of inserts[r.id] ?? NO_INSERTS) {
      if (rewrites.inScope(e.scope, o)) {
        symRefsOf(e.body, into)
      }
    }
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
          symRefsOf(n.claim!.placeholder, into)
        } else {
          refReads(ownedRefs.get(nested) ?? NO_REFS, n.start, n.end, into)
          textReads(nested, o, into)
        }
        continue
      }
      for (const e of n.edits ?? []) {
        if (rewrites.inScope(e.scope, o)) {
          symRefsOf(e.body, into)
        }
      }
      for (const p of n.places ?? []) {
        if (rewrites.inScope(p.scope, o)) {
          symRefsOf(p.body, into)
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
    const into: MemberReads = []
    if (m < regionCount) {
      if (live) {
        regionReads(regions.get(m), o, into)
      } else {
        sourceReads(regions.get(m), o, into)
      }
    } else {
      // (a claimed region it names reads itself: the same cluster)
      symRefsOf(gens[m - regionCount]!.body, into)
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
    const reads = new Set<SymbolId>()
    const cl: Cluster = clusters[c]!
    for (const r of cl.regions) {
      for (const s of memberReads(r, o, live)) {
        reads.add(s)
      }
    }
    for (const g of cl.gens) {
      for (const s of memberReads(regionCount + g, o, live)) {
        reads.add(s)
      }
    }
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
    for (const s of clusterReads(c, o, live)) {
      if (!symbols.isModuleLevel(s)) {
        continue
      }
      const d = clusterOfSym.get(s)
      if (d !== undefined && d !== c && !out.includes(d)) {
        out.push(d)
      }
    }
    byCluster[c] = out
    return out
  }

  const treeChanged = () => {
    index = null
    memberReadsByOutput.clear()
    clusterReadsByOutput.clear()
    successorsByOutput.clear()
  }

  return { clusterReads, successors, treeChanged }
}
