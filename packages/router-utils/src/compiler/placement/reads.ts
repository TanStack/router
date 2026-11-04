/**
 * Placement, stage 2: what each cluster reads, per output. A cluster's
 * reads in an output are the live references of its regions there (not
 * inside text that output erases), the symbols the generated text rendered
 * there declares it reads, and the placeholders of claimed regions (or the
 * edits replacing them); its successors are the clusters those reads lead
 * to. Memoised per output: a pure function of the cluster and the output's
 * render tree.
 */
import { NEED_KINDS, symRefsOf } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { SymbolId } from '../symbols'
import type { Region, RegionId } from '../units'
import type { Frag, OutputId } from '../rewrite'
import type { PlacementInput } from '../reach'

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
  const { regions, refs, symbols } = t1
  const { clusters, clusterOfRegion, clusterOfSym, ownedRefs } = graph
  const { treeOf, isLive } = graph
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
  // regions by range, for the slices generated code retains (built on the first slice)
  const rangeKey = (start: number, end: number) => start * 0x4000000 + end
  let regionByRange: Map<number, Region> | null = null
  const regionOfRange = (start: number, end: number): Region | undefined => {
    if (regionByRange === null) {
      regionByRange = new Map()
      for (const r of regions.regions) {
        regionByRange.set(rangeKey(r.range.start, r.range.end), r)
      }
    }
    return regionByRange.get(rangeKey(start, end))
  }

  function regionReads(
    r: Region,
    o: OutputId,
    live: boolean,
    into: MemberReads,
  ): void {
    for (const ref of ownedRefs.get(r.id) ?? []) {
      if (!NEED_KINDS.has(ref.kind)) {
        continue
      }
      if (live && !isLive(ref, o)) {
        continue
      }
      into.syms.push(ref.sym)
    }
    // generated text inside the region declares its reads structurally (symbol fragments)
    const tree = treeOf(o)
    for (const e of tree.edits) {
      if (e.range.start >= r.range.end) {
        break
      }
      if (
        e.claim !== null ||
        e.range.start < r.range.start ||
        e.range.end > r.range.end
      ) {
        continue
      }
      const owner = regions.innermostAt(
        e.range.start,
        Math.max(e.range.end, e.range.start + 1),
      )
      if (owner !== r.id || (live && !tree.editRenders(e))) {
        continue
      }
      into.syms.push(...symRefsOf(e.body))
    }
    for (const cid of r.children) {
      const claim = rewrites.claims.get(cid)
      if (claim) {
        // the placeholder's reads belong to the enclosing region where it
        // renders; an edit on exactly the claimed region replaces the
        // placeholder in this output, and what it renders (its SymRefs and
        // the parts of the region it keeps) is read by this region there
        if (!live || tree.placeholderRenders(cid)) {
          into.syms.push(...symRefsOf(claim.placeholder))
        } else {
          const override = tree.overrideOf(cid)
          if (override && tree.editRenders(override)) {
            fragReads(override.body, o, live, into)
          }
        }
      } else {
        into.children.push(cid)
      }
    }
  }
  function fragReads(
    frags: ReadonlyArray<Frag>,
    o: OutputId,
    live: boolean,
    into: MemberReads,
  ): void {
    for (const f of frags) {
      if (f.k === 'text') {
        for (const p of f.parts) {
          if (typeof p !== 'string') {
            into.syms.push(p.sym)
          }
        }
      } else if (f.k === 'ref') {
        into.syms.push('sym' in f.to ? f.to.sym : f.to.member[0])
      } else if (f.k === 'slice') {
        const region = regionOfRange(f.range.start, f.range.end)
        if (region) {
          regionReads(region, o, live, into)
        } else {
          for (const ref of refs.refsIn(f.range)) {
            if (NEED_KINDS.has(ref.kind) && (!live || isLive(ref, o))) {
              into.syms.push(ref.sym)
            }
          }
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
    const into: MemberReads = { syms: [], children: [] }
    if (m < regionCount) {
      regionReads(regions.get(m), o, live, into)
    } else {
      fragReads(gens[m - regionCount]!.body, o, live, into)
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
