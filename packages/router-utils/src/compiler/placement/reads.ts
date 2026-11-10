/**
 * Placement, stage 2: what each cluster reads, per output. A cluster's
 * reads in an output are what the walk of its members' text there renders
 * (`OutputView.walk`): the references of the source it renders, the symbols
 * the generated text and the placeholders it renders name; its successors
 * are the clusters those reads lead to. Memoised per output: a pure
 * function of the cluster and the output's tree.
 */
import { RewriteSet } from '../rewrite'
import { NEED_KINDS, symRefsOf } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { RegionId } from '../units'
import type {
  Frag,
  GenFrag,
  OutputId,
  PlannerEdit,
  RangeNode,
  Region,
  WalkVisitor,
} from '../rewrite'
import type { PlacementInput } from '../reach'

const NO_REFS: ReadonlyArray<ClassifiedRef> = []

/** The index of the first node starting at or after `offset`. */
function firstNodeFrom(
  nodes: ReadonlyArray<RangeNode>,
  offset: number,
): number {
  let lo = 0
  let hi = nodes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (nodes[mid]!.start < offset) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/** The index of the first insert at or after `offset`. */
function firstInsertFrom(
  inserts: ReadonlyArray<PlannerEdit>,
  offset: number,
): number {
  let lo = 0
  let hi = inserts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (inserts[mid]!.range.start < offset) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

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
}

interface MemberReads {
  syms: Array<SymbolId>
  children: Array<RegionId>
}

export function readIndex(
  input: PlacementInput,
  graph: ClusterGraph,
): ReadIndex {
  const { t1, rewrites } = input
  const { refs, symbols } = t1
  const { regions } = rewrites
  const { clusters, clusterOfRegion, clusterOfSym, ownedRefs } = graph
  const { viewOf, isLive } = graph
  const regionCount = regions.regions.length
  const gens = rewrites.generated

  // ---- member reads -----------------------------------------------------
  // members: regions by id, then generated units (`regionCount + id`); per
  // output (live reads) or for the dead walk, an array indexed by member
  const memberReadsByOutput = new Map<
    OutputId,
    Array<MemberReads | undefined>
  >()
  const deadMemberReads: Array<MemberReads | undefined> = []
  /** Pushes the module-level reads of a body (its `SymRef`s and reference targets). */
  const bodyReads = (
    body: ReadonlyArray<Frag | GenFrag>,
    into: MemberReads,
  ) => {
    for (const s of symRefsOf(body)) {
      into.syms.push(s)
    }
  }
  /** Pushes the references of `refs` (sorted) starting in `[s, e)` that `keep` lets through. */
  const refReads = (
    list: ReadonlyArray<ClassifiedRef>,
    s: number,
    e: number,
    keep: ((ref: ClassifiedRef) => boolean) | null,
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
      if (NEED_KINDS.has(ref.kind) && (keep === null || keep(ref))) {
        into.syms.push(ref.sym)
      }
    }
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
  /** Per region: the node on exactly its range, and the node its walk starts in (that one, or the first marked one around it). */
  const nodesOf: Array<
    { own: RangeNode | null; around: RangeNode } | undefined
  > = []
  const nodesOfRegion = (r: Region) => {
    let hit = nodesOf[r.id]
    if (hit === undefined) {
      const own = regions.nodeOn(r.range)
      hit = { own, around: own ?? regions.nodeAround(r.range) }
      nodesOf[r.id] = hit
    }
    return hit
  }

  function regionReads(r: Region, o: OutputId, into: MemberReads): void {
    for (const cid of regions.childrenOf(r.id)) {
      if (!rewrites.claims.has(cid)) {
        into.children.push(cid)
      }
    }
    const view = viewOf(o)
    const { own, around } = nodesOfRegion(r)
    const verdict = view.encloses(
      r.range,
      own,
      own !== null ? own.parent : around,
    )
    if (verdict === 'none') {
      return
    }
    const partial = verdict === 'partial'
    const owned = ownedRefs.get(r.id) ?? NO_REFS
    const liveRef = partial ? (ref: ClassifiedRef) => isLive(ref, o) : null
    /** What a body standing for node `n` reads. */
    const read = (n: RangeNode, body: ReadonlyArray<Frag>) => {
      bodyReads(body, into)
      for (const f of body) {
        if (f.k === 'slice') {
          view.walk(n, f.range.start, f.range.end, visitor)
        } else if (f.k === 'ref') {
          // (a rewritten reference keeps the one it rewrites)
          refReads(owned, f.range.start, f.range.end, liveRef, into)
        }
      }
    }
    const visitor: WalkVisitor = {
      source: (s, e) => refReads(owned, s, e, liveRef, into),
      node: (n) => {
        if (!(partial && view.isErasedAt(n.start))) {
          read(n, (view.placeOf(n) ?? view.textOf(n))!)
        }
      },
      insert: (e) => {
        if (!partial || !view.isErasedAt(e.range.start)) {
          bodyReads(e.body, into)
        }
      },
      member: (n) => {
        if (n === own) {
          return false
        }
        // a claimed region's text is its owner's: what stands at its place
        // is read here (the placeholder, or the edit replacing it and what
        // that keeps of the region)
        const place = rewrites.claims.has(n.region!) ? view.placeOf(n) : null
        if (place !== null && !(partial && view.isErasedAt(n.start))) {
          bodyReads(place, into)
          for (const f of place) {
            if (f.k === 'slice' || f.k === 'ref') {
              refReads(
                refs.refsIn(f.range),
                f.range.start,
                f.range.end,
                liveRef,
                into,
              )
            }
          }
        }
        return true
      },
    }
    const text = own === null ? null : view.textOf(own)
    if (text !== null) {
      read(own!, text)
    } else {
      view.walk(around, r.range.start, r.range.end, visitor)
    }
  }

  /**
   * What a region's text names, rendered or not (the env module's source:
   * provenance and the export companions): the references it owns, the
   * bodies of the edits and inserts of `o` inside it, the placeholders of the
   * claimed regions nested in it.
   */
  function sourceReads(r: Region, o: OutputId, into: MemberReads): void {
    refReads(
      ownedRefs.get(r.id) ?? NO_REFS,
      r.range.start,
      r.range.end,
      null,
      into,
    )
    const { start, end } = r.range
    const { own, around } = nodesOfRegion(r)
    const visit = (n: RangeNode) => {
      for (const e of n.edits ?? []) {
        if (RewriteSet.inScope(e.scope, o)) {
          bodyReads(e.body, into)
        }
      }
      for (const c of n.children) {
        if (!c.marked || c.end <= start || c.start >= end) {
          continue
        }
        if (c.region !== null && c.region !== r.id) {
          const claim = rewrites.claims.get(c.region)
          if (claim !== undefined) {
            bodyReads(claim.placeholder, into)
          }
          continue
        }
        visit(c)
      }
    }
    if (own !== null) {
      visit(own)
    } else {
      // (the nodes inside the region, under the node around it)
      const children = around.children
      for (let i = firstNodeFrom(children, start); i < children.length; i++) {
        const c = children[i]!
        if (c.start >= end) {
          break
        }
        if (!c.marked || c.end > end) {
          continue
        }
        if (c.region !== null) {
          const claim = rewrites.claims.get(c.region)
          if (claim !== undefined) {
            bodyReads(claim.placeholder, into)
          }
        } else {
          visit(c)
        }
      }
    }
    for (
      let i = firstInsertFrom(rewrites.inserts, start);
      i < rewrites.inserts.length;
      i++
    ) {
      const e = rewrites.inserts[i]!
      if (e.range.start >= end) {
        break
      }
      if (
        RewriteSet.inScope(e.scope, o) &&
        regions.innermostAt(e.range.start) === r.id
      ) {
        bodyReads(e.body, into)
      }
    }
    for (const cid of regions.childrenOf(r.id)) {
      if (!rewrites.claims.has(cid)) {
        into.children.push(cid)
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
    const into: MemberReads = { syms: [], children: [] }
    if (m < regionCount) {
      if (live) {
        regionReads(regions.get(m), o, into)
      } else {
        sourceReads(regions.get(m), o, into)
      }
    } else {
      // (a claimed region it names reads itself: the same cluster)
      bodyReads(gens[m - regionCount]!.body, into)
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

  return { clusterReads, successors, reach }
}
