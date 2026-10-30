/**
 * Placement, stage 1: the clusters. Units, the regions planners registered
 * and generated units are joined into the clusters placement moves as one:
 * the declarations of a symbol, a claimed region and the generated unit
 * owning it, a live top-level writer and what it writes, an eager reader of
 * an eagerly written binding and that binding (ordered evaluation). Also
 * the module's write table and the one mutation predicate every later rule
 * asks (`mutatedOutside`).
 */
import { writeKind } from '../mutation'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { RegionId, Unit, UnitId } from '../units'
import type { Frag, GenUnitId, OutputId, RenderTree } from '../rewrite'
import type { Fallback, PlacementInput } from '../reach'

export type ClusterId = number

export interface Cluster {
  id: ClusterId
  regions: Array<RegionId>
  gens: Array<GenUnitId>
  units: Array<UnitId>
  declares: Set<SymbolId>
  effectful: boolean
  /**
   * An effect observable without the cluster's declarations: an effectful
   * initialiser, an effect statement other than an augmentation of its own
   * declarations, an augmentation doing more than its writes
   * (`Page.x = track()`), an effectful generated unit. Such a cluster is
   * never an extracted export (its module could never be dropped as unused)
   * and clears an output's side-effect-free flag; a cluster whose effects
   * only write what it declares (`Page.displayName = …`) is unobservable
   * while nothing imports it.
   */
  sideEffects: boolean
  exported: boolean
  /** Source position for ordering (min start of members). */
  start: number
  /** Source positions of the cluster's first and last effectful units (its effects keep their order with the surviving effects on either side); Infinity/-Infinity when none (generated units are compiler code). */
  firstEffect: number
  lastEffect: number
  kind:
    | 'import'
    | 'import-effect'
    | 'declaration'
    | 'type'
    | 'export'
    | 'effect'
    | 'gen'
    | 'region'
  copyable: boolean
  envPinned: boolean
}

/**
 * A write of a module binding. The module's mutation model (`t1.mutation`:
 * every assignment of a binding and every write of a member of one, eager
 * or lazy) restricted to module-level bindings, with what placement adds:
 * `live` (not inside a range the env module erases), `augment` (a
 * top-level augmentation unit, `X.p = …`, `X.push(…)`, `X = …` as a
 * statement: its `owner` is the unit's region). Every rule that asks what
 * writes a binding reads this table: clustering (a live top-level writer
 * joins what it writes), ordered evaluation (an eager reader of a binding
 * written after it, or by lazy code, cannot move), the movable test's
 * "nothing outside writes it" and the one predicate `mutatedOutside`
 * ("something outside the reader writes what it reads eagerly") behind the
 * movable test, the pure-cluster gate and the option-value fallbacks.
 */
export interface Write {
  sym: SymbolId
  at: number
  eager: boolean
  live: boolean
  owner: RegionId | null
  augment: boolean
  /** A member write (`x.p = …`, `x.push(…)`), not an assignment of the binding. */
  member: boolean
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
  /** The sub-regions (not units) writing a module binding live, per written declaration (the single-writer rule). */
  subRegionWriters: Array<{ cluster: ClusterId; writers: Set<RegionId> }>
  /** Module-level symbols a sub-region writes (a cluster holding one is never an extracted export: the single-writer rule decides). */
  regionWrittenSyms: Set<SymbolId>
  /**
   * The clusters that eagerly read a module binding something outside them
   * writes (`mutatedOutside`): their value depends on when they evaluate, so
   * they never move to a lazy output, pure or not (`const initial = [n]`
   * next to `function inc() { n++ }` keeps the source's `[0]`).
   */
  mutableReaders: Set<ClusterId>
  /** `ordered-effect`: a relocated read (a claimed option value) of state something writes after it, or at an unknown time, keeps the option in place. */
  fallbacks: Array<Fallback>
  /** The render tree of an output (built once per output). */
  treeOf: (o: OutputId) => RenderTree
  /** Whether a reference renders in output `o` (it is not inside text `o` erases). */
  isLive: (ref: ClassifiedRef, o: OutputId) => boolean
  /** Whether a unit survives in the env module (its statement is not erased there). */
  unitSurvives: (u: UnitId) => boolean
  /**
   * The one mutation predicate: whether a read of `sym` evaluated at
   * `readAt` by cluster `by` observes state something else writes. A
   * surviving write by another cluster counts when it runs after the read
   * (an eager write further down the module: a relocated read would move
   * past it) or at an unknown time (a write inside a function: it may run
   * before a lazy output evaluates the read). A write by the reading
   * cluster itself does not (it travels with the read).
   */
  mutatedOutside: (sym: SymbolId, readAt: number, by: ClusterId) => boolean
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

export const READ_KINDS = new Set([
  'value',
  'jsxTag',
  'implicitJsxFactory',
  'exportSpecifier',
])
/**
 * References an output needs the binding for: reads, and writes (an output
 * cannot assign a binding it neither declares nor may import — `x = 1` and
 * `x++` alone make a region depend on `x`).
 */
export const NEED_KINDS = new Set([...READ_KINDS, 'write'])

/** The symbols generated text reads (its `SymRef`s and reference rewrites). */
export function symRefsOf(frags: ReadonlyArray<Frag>): Array<SymbolId> {
  const out: Array<SymbolId> = []
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

/**
 * Whether an effect unit only augments bindings its own cluster declares
 * (`Page.displayName = …` after `function Page`): the binding and its
 * writers are one cluster, moved or kept together.
 */
export function ownAugmentation(
  units: ReadonlyArray<Unit>,
  u: Unit,
  cl: Cluster,
): boolean {
  if (u.kind !== 'effect' || u.augments.length === 0) {
    return false
  }
  // an effectful initialiser among the augmentations (`init()` between
  // two `plugins.push`) keeps the whole cluster an effect root
  if (
    cl.units.some(
      (o) => units[o]!.kind === 'declaration' && units[o]!.effectful,
    )
  ) {
    return false
  }
  return u.augments.every((s) =>
    cl.units.some(
      (o) => units[o]!.kind === 'declaration' && units[o]!.declares.includes(s),
    ),
  )
}

export function buildClusters(input: PlacementInput): ClusterGraph {
  const { t1, rewrites } = input
  const { units, regions, refs, items } = t1
  const regionCount = regions.regions.length
  const gens = rewrites.generated
  // union-find members: regions by id, then generated units
  const memberOfGen = (g: GenUnitId) => regionCount + g
  const uf = new UnionFind(regionCount + gens.length)

  const trees = new Map<OutputId, RenderTree>()
  const treeOf = (o: OutputId): RenderTree => {
    let t = trees.get(o)
    if (!t) {
      t = rewrites.tree(o)
      trees.set(o, t)
    }
    return t
  }
  const envTree = treeOf('env')
  const isLive = (ref: ClassifiedRef, o: OutputId) =>
    !treeOf(o).isErasedAt(ref.range.start)
  const unitSurvives = (u: UnitId): boolean => {
    const unit = units[u]!
    const item = items[unit.item]!
    const probe =
      unit.range.start === item.range.start
        ? item.nodeRange.start
        : unit.range.start
    return !envTree.isErasedAt(probe)
  }

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

  // ---- writes: every write of a module binding, one table -----------------
  const writes: Array<Write> = []
  const writesOfSym = new Map<SymbolId, Array<Write>>()
  const addWrite = (w: Write) => {
    writes.push(w)
    let list = writesOfSym.get(w.sym)
    if (!list) {
      list = []
      writesOfSym.set(w.sym, list)
    }
    list.push(w)
  }
  for (const ref of refs.all) {
    const kind = writeKind(ref)
    if (kind === null || !declMember.has(ref.sym)) {
      continue
    }
    addWrite({
      sym: ref.sym,
      at: ref.range.start,
      eager: ref.eager,
      live: isLive(ref, 'env'),
      owner: regions.innermostAt(ref.range.start, ref.range.end),
      augment: false,
      member: kind === 'member',
    })
  }
  for (const u of units) {
    if (u.augments.length === 0) {
      continue
    }
    const live = !envTree.isErasedAt(items[u.item]!.nodeRange.start)
    for (const s of u.augments) {
      addWrite({
        sym: s,
        at: u.range.start,
        eager: true,
        live,
        owner: u.region,
        augment: true,
        member: false,
      })
    }
  }

  // ---- live writes and augmentations join the cluster they write -----------
  const writersOfMember = new Map<number, Set<RegionId>>() // declaring member → writer sub-regions
  const regionWrittenSyms = new Set<SymbolId>()
  for (const w of writes) {
    const d = declMember.get(w.sym)
    if (!w.live || w.member || d === undefined || w.owner === null) {
      continue
    }
    if (w.augment || regions.get(w.owner).kind === 'unit') {
      uf.union(w.owner, d)
    } else {
      regionWrittenSyms.add(w.sym)
      let set = writersOfMember.get(d)
      if (!set) {
        set = new Set()
        writersOfMember.set(d, set)
      }
      set.add(w.owner)
    }
  }

  // ---- ordered evaluation: eager readers of eagerly mutated clusters join them (a reader cannot move after the writes that follow it) ----
  // Every round that changes something merges two clusters, so the rounds
  // end (the union-find only grows) once no eager reader is left outside the
  // cluster it reads.
  // the eager live reads of written module bindings (a module without
  // writes has nothing to order: most route modules)
  const eagerReads: Array<ClassifiedRef> = []
  if (writes.length > 0) {
    for (const ref of refs.all) {
      if (
        ref.eager &&
        writesOfSym.has(ref.sym) &&
        READ_KINDS.has(ref.kind) &&
        declMember.has(ref.sym) &&
        isLive(ref, 'env')
      ) {
        eagerReads.push(ref)
      }
    }
  }
  for (;;) {
    let changed = false
    // mutated roots: clusters with an eager live top-level write
    const mutated = new Set<number>()
    for (const w of writes) {
      const d = declMember.get(w.sym)
      if (w.live && w.eager && d !== undefined) {
        mutated.add(uf.find(d))
      }
    }
    if (mutated.size === 0) {
      break
    }
    for (const ref of eagerReads) {
      const d = declMember.get(ref.sym)!
      if (!mutated.has(uf.find(d))) {
        continue
      }
      const owner = regions.innermostAt(ref.range.start, ref.range.end)
      if (
        owner !== null &&
        regions.get(owner).kind === 'unit' &&
        uf.find(owner) !== uf.find(d)
      ) {
        uf.union(owner, d)
        changed = true
      }
    }
    if (!changed) {
      break
    }
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
        effectful: false,
        sideEffects: false,
        exported: false,
        start: Infinity,
        firstEffect: Infinity,
        lastEffect: -Infinity,
        kind: 'region',
        copyable: false,
        envPinned: false,
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
    cl.start = Math.min(cl.start, r.range.start)
    if (r.unit !== null) {
      const u = units[r.unit]!
      cl.units.push(u.id)
      for (const s of u.declares) {
        cl.declares.add(s)
      }
      if (u.effectful && !envTree.isErasedAt(items[u.item]!.nodeRange.start)) {
        cl.effectful = true
        cl.firstEffect = Math.min(cl.firstEffect, u.range.start)
        cl.lastEffect = Math.max(cl.lastEffect, u.range.start)
      }
      cl.exported ||= u.exported.length > 0
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
    cl.effectful ||= g.effectful
  }
  for (const cl of clusters) {
    const kinds = (...ks: Array<Unit['kind']>) =>
      cl.units.some((u) => ks.includes(units[u]!.kind))
    if (cl.units.length === 0) {
      cl.kind = cl.gens.length > 0 ? 'gen' : 'region'
    } else if (
      cl.units.some(
        (u) =>
          units[u]!.kind === 'effect' && !ownAugmentation(units, units[u]!, cl),
      )
    ) {
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
    cl.copyable =
      cl.units.length === 1 &&
      cl.gens.length === 0 &&
      (units[cl.units[0]!]!.copyable ||
        units[cl.units[0]!]!.kind === 'import-specifier')
    if (cl.kind === 'type') {
      cl.envPinned = true
    }
    cl.sideEffects =
      cl.effectful &&
      (cl.kind !== 'declaration' ||
        cl.gens.some((g) => gens[g]!.effectful) ||
        cl.units.some((u) =>
          units[u]!.kind === 'effect'
            ? units[u]!.augmentEffects
            : units[u]!.effectful,
        ))
  }
  const clusterOfSym = new Map<SymbolId, ClusterId>()
  for (const [s, m] of declMember) {
    clusterOfSym.set(s, clusterOfMember(m))
  }
  const subRegionWriters: ClusterGraph['subRegionWriters'] = []
  for (const [d, writers] of writersOfMember) {
    subRegionWriters.push({ cluster: clusterOfMember(d), writers })
  }

  // ---- readers of mutable state ----------------------------------------------
  // (a claimed region is in its owner's cluster: a write there is the owner's)
  const mutatedOutside = (
    sym: SymbolId,
    readAt: number,
    by: ClusterId,
  ): boolean => {
    const list = writesOfSym.get(sym)
    if (list === undefined) {
      return false
    }
    for (const w of list) {
      if (!w.live || (w.eager && w.at <= readAt)) {
        continue
      }
      if (w.owner === null || clusterOfRegion.get(w.owner) !== by) {
        return true
      }
    }
    return false
  }
  // over the eager live reads of written bindings (few), not over every
  // reference of every cluster
  const mutableReaders = new Set<ClusterId>()
  const orderedEffectRegions = new Set<RegionId>()
  for (const ref of eagerReads) {
    const owner = regions.innermostAt(ref.range.start, ref.range.end)
    if (owner === null) {
      continue
    }
    const reader = clusterOfRegion.get(owner)!
    if (
      clusterOfSym.get(ref.sym) === reader ||
      !mutatedOutside(ref.sym, ref.range.start, reader)
    ) {
      continue
    }
    mutableReaders.add(reader)
    // a relocated read (a claimed option value) of state something writes
    // after it, or at an unknown time, keeps the option in place
    if (regions.get(owner).kind !== 'unit') {
      orderedEffectRegions.add(owner)
    }
  }
  const fallbacks: Array<Fallback> = []
  for (const r of orderedEffectRegions) {
    fallbacks.push({ region: r, reason: 'ordered-effect' })
  }

  return {
    clusters,
    clusterOfRegion,
    clusterOfGen,
    clusterOfSym,
    ownedRefs,
    writes,
    writesOfSym,
    subRegionWriters,
    regionWrittenSyms,
    mutableReaders,
    fallbacks,
    treeOf,
    isLive,
    unitSurvives,
    mutatedOutside,
  }
}
