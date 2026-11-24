/**
 * The clusters placement moves as one: units, the regions planners
 * registered and generated units, joined when they declare one symbol, a
 * claimed region with the generated unit owning it, an unclaimed
 * sub-region with the region around it; nothing else (one cluster per
 * unit). Also the module's write table: the assignments of its bindings.
 */
import type { ClassifiedRef } from './analysis'
import type { SymbolId } from './symbols'
import type { Range } from './header'
import type { RegionId, Unit, UnitId } from './units'
import type {
  Frag,
  GenFrag,
  GenUnitId,
  GeneratedUnit,
  OutputId,
  OutputView,
} from './rewrite'
import type { PlacementInput } from './placement'

export type ClusterId = number

export interface Cluster {
  id: ClusterId
  regions: Array<RegionId>
  gens: Array<GenUnitId>
  units: Array<UnitId>
  declares: Set<SymbolId>
  kind:
    | 'import'
    | 'import-effect'
    | 'declaration'
    | 'type'
    | 'export'
    | 'effect'
    | 'gen'
    | 'region'
}

/**
 * An assignment of a module binding a unit or a generated unit declares
 * (`x = …`, `x++`, `x += …`, a Solid `ref={x}` that may assign it), with the
 * evaluation holding it: the unit, or the claimed region (an option value a
 * chunk owns), around it.
 */
export interface Write {
  sym: SymbolId
  at: number
  owner: RegionId | null
  /** A Solid `ref={x}` on a binding holding a callback (`ClassifiedRef.assigns`): it assigns only beside a kept explicit write. */
  callback?: true
}

/**
 * Whether `w` assigns its binding in an output (`isErasedAt`: that output's
 * erasure): not in erased text, and a Solid ref on a callback binding only
 * where an explicit write of the binding is kept too.
 */
export function writeAssigns(
  graph: Pick<ClusterGraph, 'writesOfSym'>,
  w: Write,
  isErasedAt: (at: number) => boolean,
): boolean {
  return (
    !isErasedAt(w.at) &&
    (!w.callback ||
      (graph.writesOfSym.get(w.sym) ?? []).some(
        (o) => !o.callback && o !== w && !isErasedAt(o.at),
      ))
  )
}

export interface ClusterGraph {
  clusters: Array<Cluster>
  clusterOfRegion: Map<RegionId, ClusterId>
  clusterOfGen: Map<GenUnitId, ClusterId>
  /** The cluster declaring each module-level symbol (generated declarations and imports included). */
  clusterOfSym: Map<SymbolId, ClusterId>
  /** The references of each region (the innermost region holding them). */
  ownedRefs: Map<RegionId, Array<ClassifiedRef>>
  writes: Array<Write>
  writesOfSym: Map<SymbolId, Array<Write>>
  /** What an output renders of the source (`OutputView`). */
  viewOf: (o: OutputId) => OutputView
}

class UnionFind {
  private parent: Int32Array
  constructor(n: number) {
    const parent = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      parent[i] = i
    }
    this.parent = parent
  }
  find(x: number): number {
    const parent = this.parent
    let r = x
    while (parent[r] !== r) {
      r = parent[r]!
    }
    while (parent[x] !== r) {
      const next = parent[x]!
      parent[x] = r
      x = next
    }
    return r
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) {
      this.parent[Math.max(ra, rb)] = Math.min(ra, rb)
    }
  }
}

export const READ_KINDS = new Set(['value', 'jsxTag', 'exportSpecifier'])
/**
 * References an output needs the binding for: reads, and writes (an output
 * cannot assign a binding it neither declares nor may import — `x = 1` and
 * `x++` alone make a region depend on `x`).
 */
export const NEED_KINDS = new Set([...READ_KINDS, 'write'])

/** The symbols generated text reads (its `SymRef`s and reference rewrites), pushed into `out`. */
export function symRefsOf(
  frags: ReadonlyArray<Frag | GenFrag>,
  out: Array<SymbolId> = [],
): Array<SymbolId> {
  for (const f of frags) {
    if (f.k === 'text') {
      for (const p of f.parts) {
        if (typeof p !== 'string') {
          out.push(p.sym)
        }
      }
    } else if (f.k === 'ref') {
      out.push('sym' in f.to ? f.to.sym : f.to.member[0])
    }
  }
  return out
}

/** A generated unit that only imports: no text, no declaration, no effect. */
const importsOnly = (g: GeneratedUnit): boolean =>
  g.body.length === 0 &&
  g.declares.length === 0 &&
  !g.effectful &&
  (g.imports?.length ?? 0) > 0

export function buildClusters(input: PlacementInput): ClusterGraph {
  const { t1, rewrites } = input
  const { units, refs } = t1
  const { regions } = rewrites
  const regionCount = regions.regions.length
  const gens = rewrites.generated
  // union-find members: regions by id, then generated units
  const memberOfGen = (g: GenUnitId) => regionCount + g
  const uf = new UnionFind(regionCount + gens.length)

  const viewOf = (o: OutputId): OutputView => rewrites.view(o)

  // ---- owner index: refs by owning region --------------------------------
  const ownedRefs = new Map<RegionId, Array<ClassifiedRef>>()
  for (const ref of refs.all) {
    const owner = regions.innermostAt(ref.range.start, ref.range.end)
    if (owner === null) {
      continue
    }
    let list = ownedRefs.get(owner)
    if (!list) {
      list = []
      ownedRefs.set(owner, list)
    }
    list.push(ref)
  }

  // ---- declaring members per symbol ---------------------------------------
  const declMember = new Map<SymbolId, number>()
  for (const [sym, us] of t1.declaringUnits) {
    declMember.set(sym, units[us[0]!]!.region)
  }
  for (const g of gens) {
    for (const s of g.declares) {
      declMember.set(s, memberOfGen(g.id))
    }
    for (const gi of g.imports ?? []) {
      for (const n of gi.names) {
        declMember.set(n.local, memberOfGen(g.id))
      }
    }
  }

  // ---- units declaring the same symbol ------------------------------------
  for (const us of t1.declaringUnits.values()) {
    for (let i = 1; i < us.length; i++) {
      uf.union(units[us[0]!]!.region, units[us[i]!]!.region)
    }
  }
  // claimed regions travel with their owner
  for (const claim of rewrites.claims.values()) {
    uf.union(claim.region, memberOfGen(claim.owner))
  }
  // an unclaimed sub-region is its unit's text
  for (const r of regions.regions) {
    const parent = regions.parentOf(r.id)
    if (r.unit === null && parent !== null && !rewrites.claims.has(r.id)) {
      uf.union(r.id, parent)
    }
  }

  // ---- writes: every assignment of a module binding, one table ------------
  const writes: Array<Write> = []
  const writesOfSym = new Map<SymbolId, Array<Write>>()
  // the evaluation owning a write: the innermost unit or claimed region
  // holding it (an unclaimed region is its unit's text)
  const claimedRegions = new Set<RegionId>()
  for (const claim of rewrites.claims.values()) {
    claimedRegions.add(claim.region)
  }
  const evaluationAt = (range: Range): RegionId | null => {
    let r = regions.innermostAt(range.start, range.end)
    while (
      r !== null &&
      regions.get(r).unit === null &&
      !claimedRegions.has(r)
    ) {
      r = regions.parentOf(r)
    }
    return r
  }
  for (const ref of refs.all) {
    if (
      (ref.kind !== 'write' && ref.assigns === undefined) ||
      !declMember.has(ref.sym)
    ) {
      continue
    }
    const w: Write = {
      sym: ref.sym,
      at: ref.range.start,
      owner: evaluationAt(ref.range),
      ...(ref.assigns === 'callback' && { callback: true as const }),
    }
    writes.push(w)
    let list = writesOfSym.get(w.sym)
    if (!list) {
      list = []
      writesOfSym.set(w.sym, list)
    }
    list.push(w)
  }

  // ---- materialise clusters ------------------------------------------------
  const clusters: Array<Cluster> = []
  const clusterOfRoot = new Map<number, ClusterId>()
  const clusterOfMember = (m: number): ClusterId => {
    const root = uf.find(m)
    let c = clusterOfRoot.get(root)
    if (c === undefined) {
      c = clusters.length
      clusterOfRoot.set(root, c)
      clusters.push({
        id: c,
        regions: [],
        gens: [],
        units: [],
        declares: new Set(),
        kind: 'region',
      })
    }
    return c
  }
  const clusterOfRegion = new Map<RegionId, ClusterId>()
  const clusterOfGen = new Map<GenUnitId, ClusterId>()
  for (const r of regions.regions) {
    const c = clusterOfMember(r.id)
    clusterOfRegion.set(r.id, c)
    const cl = clusters[c]!
    cl.regions.push(r.id)
    if (r.unit !== null) {
      const u = units[r.unit]!
      cl.units.push(u.id)
      for (const s of u.declares) {
        cl.declares.add(s)
      }
    }
  }
  for (const g of gens) {
    const c = clusterOfMember(memberOfGen(g.id))
    clusterOfGen.set(g.id, c)
    const cl = clusters[c]!
    cl.gens.push(g.id)
    for (const s of g.declares) {
      cl.declares.add(s)
    }
  }
  for (const cl of clusters) {
    const kinds = (...ks: Array<Unit['kind']>) =>
      cl.units.some((u) => ks.includes(units[u]!.kind))
    if (cl.units.length === 0) {
      // generated units that only import (a planner's runtime helper, e.g.
      // the client stub's `createClientRpc`) are an import like one the
      // source wrote: each output that reads it imports it itself
      cl.kind =
        cl.gens.length === 0
          ? 'region'
          : cl.regions.length === 0 &&
              cl.gens.every((g) => importsOnly(gens[g]!))
            ? 'import'
            : 'gen'
    } else if (kinds('effect')) {
      cl.kind = 'effect'
    } else if (kinds('import-effect')) {
      cl.kind = 'import-effect'
    } else if (kinds('export-specifier', 'reexport', 'export-default')) {
      cl.kind = 'export'
    } else if (kinds('declaration')) {
      cl.kind = 'declaration'
    } else if (kinds('import-specifier')) {
      cl.kind = 'import'
    } else if (kinds('type')) {
      cl.kind = 'type'
    }
  }
  const clusterOfSym = new Map<SymbolId, ClusterId>()
  for (const [s, m] of declMember) {
    clusterOfSym.set(s, clusterOfMember(m))
  }
  return {
    clusters,
    clusterOfRegion,
    clusterOfGen,
    clusterOfSym,
    ownedRefs,
    writes,
    writesOfSym,
    viewOf,
  }
}
