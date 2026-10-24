/**
 * Clusters, reachability, provenance-based orphans, the movable-effect test,
 * ordered evaluation and needers/homes (DESIGN §3.1, §3.4, §3.5.2; R1, R6,
 * R7, R29, R31). A generic service: planners supply roots and derived
 * outputs; the core decides what each output contains and what it imports.
 */
import { deriveId } from './identity'
import type { ClassifiedRef, Tier1 } from './analysis'
import type { SymbolId } from './symbols'
import type { Region, RegionId, UnitId } from './units'
import type {
  Frag,
  GenUnitId,
  GeneratedUnit,
  OutputId,
  RenderTree,
  RewriteSet,
} from './rewrite'

export type RootRef =
  | { t: 'unit'; id: UnitId }
  | { t: 'region'; id: RegionId }
  | { t: 'gen'; id: GenUnitId }

export type OutputKind =
  | 'env'
  | 'split'
  | 'shared'
  | 'export'
  | 'hydrate'
  | 'provider'
  | 'custom'

export interface HeaderPolicy {
  dropDirectives?: ReadonlyArray<string>
  addDirective?: string
}

export interface OutputDecl {
  id: OutputId
  kind: OutputKind
  /** Short key for shared-module ids and diagnostics (`component`, `h1`, …). */
  key: string
  /** The derived canonical id (null for env). */
  derivedId: string | null
  roots: Array<RootRef>
  header?: HeaderPolicy
  /** Whether this output is side-effect free (host hint). Default false. */
  sideEffectFree?: boolean
}

export type ClusterId = number

export interface Cluster {
  id: ClusterId
  regions: Array<RegionId>
  gens: Array<GenUnitId>
  units: Array<UnitId>
  declares: Set<SymbolId>
  effectful: boolean
  exported: boolean
  /** Source position for ordering (min start of members). */
  start: number
  /** Index of the last item of the cluster (for R31 (d)); -1 for generated-only clusters. */
  lastItem: number
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

export type Home = OutputId | 'duplicate' | 'removed'

export interface Fallback {
  region: RegionId
  reason: 'shared-writer' | 'multi-writer' | 'ordered-effect' | 'hydrate-writer'
  cluster: ClusterId
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  routeModule: boolean
  benignEffects: ReadonlySet<UnitId>
  /** Exported symbols a planner allows into an extracted-export output (§3.5.3). */
  extractions?: ReadonlyMap<SymbolId, OutputId>
}

export interface ExtractedExport {
  cluster: ClusterId
  output: OutputId
  /** The exported symbols of the cluster (the env module re-exports them from `output`). */
  syms: Array<SymbolId>
}

export interface Placement {
  clusters: Array<Cluster>
  clusterOfRegion: Map<RegionId, ClusterId>
  clusterOfGen: Map<GenUnitId, ClusterId>
  clusterOfSym: Map<SymbolId, ClusterId>
  needers: Map<ClusterId, Set<OutputId>>
  home: Map<ClusterId, Home>
  /** Clusters each output contains (homed or duplicated). */
  included: Map<OutputId, Set<ClusterId>>
  /** o → (home output → symbols o imports from it). */
  imports: Map<OutputId, Map<OutputId, Set<SymbolId>>>
  /** Symbols each output must export for other outputs. */
  exportsNeeded: Map<OutputId, Set<SymbolId>>
  orphaned: Set<ClusterId>
  movable: Set<ClusterId>
  fallbacks: Array<Fallback>
  /** Outputs created by placement (lazy shared modules). */
  created: Array<OutputDecl>
  /** Exported clusters homed in an extracted-export output (the env module re-exports them). */
  extracted: Array<ExtractedExport>
  /** Live reads per (output, cluster) — syms read by the cluster's members in that output. */
  readsIn: (output: OutputId, cluster: ClusterId) => Set<SymbolId>
}

class UnionFind {
  private parent: Array<number>
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    let r = x
    while (this.parent[r] !== r) {
      r = this.parent[r]!
    }
    while (this.parent[x] !== r) {
      const next = this.parent[x]!
      this.parent[x] = r
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

const READ_KINDS = new Set([
  'value',
  'jsxTag',
  'implicitJsxFactory',
  'exportSpecifier',
])

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

export function computePlacement(input: PlacementInput): Placement {
  const { t1, rewrites, outputs, routeModule, benignEffects } = input
  const extractions = input.extractions ?? new Map<SymbolId, OutputId>()
  const { units, regions, refs, symbols, items } = t1
  const regionCount = regions.regions.length
  const gens = rewrites.generated
  const memberOfRegion = (r: RegionId) => r
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
    const u = units[us[0]!]!
    declMember.set(sym, memberOfRegion(u.region))
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

  // ---- 1. units declaring the same symbol ---------------------------------
  for (const us of t1.declaringUnits.values()) {
    for (let i = 1; i < us.length; i++) {
      uf.union(units[us[0]!]!.region, units[us[i]!]!.region)
    }
  }
  // claimed regions travel with their owner
  for (const claim of rewrites.claims.values()) {
    uf.union(memberOfRegion(claim.region), memberOfGen(claim.owner))
  }
  // ---- 2. live writes and augmentations (env liveness) --------------------
  const writerConstraints = new Map<number, Set<RegionId>>() // decl member root → writer sub-regions
  for (const ref of refs.all) {
    if (
      ref.kind !== 'write' ||
      !isLive(ref, 'env') ||
      !symbols.isModuleLevel(ref.sym)
    ) {
      continue
    }
    const d = declMember.get(ref.sym)
    if (d === undefined) {
      continue
    }
    const owner = regions.innermostAt(ref.range.start, ref.range.end)
    if (owner === null) {
      continue
    }
    const region = regions.get(owner)
    if (region.kind === 'unit') {
      uf.union(owner, d)
    } else {
      let set = writerConstraints.get(d)
      if (!set) {
        set = new Set()
        writerConstraints.set(d, set)
      }
      set.add(owner)
    }
  }
  for (const u of units) {
    if (
      u.augments.length === 0 ||
      envTree.isErasedAt(items[u.item]!.nodeRange.start)
    ) {
      continue
    }
    for (const s of u.augments) {
      const d = declMember.get(s)
      if (d !== undefined) {
        uf.union(u.region, d)
      }
    }
  }

  // ---- member reads -----------------------------------------------------
  const readsCache = new Map<
    string,
    { syms: Array<SymbolId>; children: Array<RegionId> }
  >()
  const regionByRange = new Map<string, Region>()
  for (const r of regions.regions) {
    regionByRange.set(`${r.range.start}:${r.range.end}`, r)
  }

  function regionReads(
    r: Region,
    o: OutputId,
    live: boolean,
    into: { syms: Array<SymbolId>; children: Array<RegionId> },
  ): void {
    for (const ref of ownedRefs.get(r.id) ?? []) {
      if (!READ_KINDS.has(ref.kind)) {
        continue
      }
      if (live && !isLive(ref, o)) {
        continue
      }
      into.syms.push(ref.sym)
    }
    // generated text inside the region declares its reads structurally (R39)
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
        // the placeholder's reads belong to the enclosing region where it renders;
        // an edit overriding the placeholder contributes its own SymRefs (edits loop below)
        if (!live || treeOf(o).placeholderRenders(cid)) {
          into.syms.push(...symRefsOf(claim.placeholder))
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
    into: { syms: Array<SymbolId>; children: Array<RegionId> },
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
        const region = regionByRange.get(`${f.range.start}:${f.range.end}`)
        if (region) {
          regionReads(region, o, live, into)
        } else {
          for (const ref of refs.refsIn(f.range)) {
            if (READ_KINDS.has(ref.kind) && (!live || isLive(ref, o))) {
              into.syms.push(ref.sym)
            }
          }
        }
      }
    }
  }
  function memberReads(
    m: number,
    o: OutputId,
    live: boolean,
  ): { syms: Array<SymbolId>; children: Array<RegionId> } {
    const key = `${m}|${live ? o : '*'}`
    const hit = readsCache.get(key)
    if (hit) {
      return hit
    }
    const into = {
      syms: [] as Array<SymbolId>,
      children: [] as Array<RegionId>,
    }
    if (m < regionCount) {
      regionReads(regions.get(m), o, live, into)
    } else {
      const g = gens[m - regionCount]!
      fragReads(g.body, o, live, into)
    }
    readsCache.set(key, into)
    return into
  }

  // ---- 5. ordered evaluation (R7): eager readers of mutated clusters join them ----
  const fallbacks: Array<Fallback> = []
  const orderedEffectRegions = new Set<RegionId>()
  for (let round = 0; round < 8; round++) {
    let changed = false
    // mutated roots: clusters with an eager live top-level write/augmentation
    const mutated = new Set<number>()
    for (const ref of refs.all) {
      if (
        ref.kind === 'write' &&
        ref.eager &&
        isLive(ref, 'env') &&
        symbols.isModuleLevel(ref.sym)
      ) {
        const d = declMember.get(ref.sym)
        if (d !== undefined) {
          mutated.add(uf.find(d))
        }
      }
    }
    for (const u of units) {
      if (
        u.augments.length > 0 &&
        !envTree.isErasedAt(items[u.item]!.nodeRange.start)
      ) {
        for (const s of u.augments) {
          const d = declMember.get(s)
          if (d !== undefined) {
            mutated.add(uf.find(d))
          }
        }
      }
    }
    if (mutated.size === 0) {
      break
    }
    for (const ref of refs.all) {
      if (
        !ref.eager ||
        !READ_KINDS.has(ref.kind) ||
        !isLive(ref, 'env') ||
        !symbols.isModuleLevel(ref.sym)
      ) {
        continue
      }
      const d = declMember.get(ref.sym)
      if (d === undefined || !mutated.has(uf.find(d))) {
        continue
      }
      const owner = regions.innermostAt(ref.range.start, ref.range.end)
      if (owner === null || uf.find(owner) === uf.find(d)) {
        continue
      }
      const region = regions.get(owner)
      if (region.kind === 'unit') {
        uf.union(owner, d)
        changed = true
      } else {
        orderedEffectRegions.add(owner)
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
        exported: false,
        start: Infinity,
        lastItem: -1,
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
      cl.effectful ||=
        u.effectful && !envTree.isErasedAt(items[u.item]!.nodeRange.start)
      cl.exported ||= u.exported.length > 0
      cl.lastItem = Math.max(cl.lastItem, u.item)
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
    const kinds = new Set(cl.units.map((u) => units[u]!.kind))
    if (cl.units.length === 0) {
      cl.kind = cl.gens.length > 0 ? 'gen' : 'region'
    } else if (kinds.has('effect')) {
      cl.kind = 'effect'
    } else if (kinds.has('import-effect')) {
      cl.kind = 'import-effect'
    } else if (
      kinds.has('export-specifier') ||
      kinds.has('reexport') ||
      kinds.has('export-default')
    ) {
      cl.kind = 'export'
    } else if (kinds.has('declaration')) {
      cl.kind = 'declaration'
    } else if (kinds.has('import-specifier')) {
      cl.kind = 'import'
    } else if (kinds.has('type')) {
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
    if (
      cl.kind === 'import' &&
      !routeModule &&
      [...cl.declares].every((s) => refs.valueRefsOf(s).length === 0)
    ) {
      cl.envPinned = true
    }
  }
  const clusterOfSym = new Map<SymbolId, ClusterId>()
  for (const [s, m] of declMember) {
    clusterOfSym.set(s, clusterOfMember(m))
  }
  for (const r of orderedEffectRegions) {
    fallbacks.push({
      region: r,
      reason: 'ordered-effect',
      cluster: clusterOfRegion.get(r)!,
    })
  }

  // ---- reads per (cluster, output) -----------------------------------------
  const clusterReadsCache = new Map<string, Set<SymbolId>>()
  const clusterChildren = new Map<string, Set<ClusterId>>()
  function clusterReads(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): { syms: Set<SymbolId>; children: Set<ClusterId> } {
    const key = `${c}|${live ? o : '*'}`
    let syms = clusterReadsCache.get(key)
    let children = clusterChildren.get(key)
    if (syms && children) {
      return { syms, children }
    }
    syms = new Set()
    children = new Set()
    const cl = clusters[c]!
    for (const r of cl.regions) {
      const reads = memberReads(r, o, live)
      for (const s of reads.syms) {
        syms.add(s)
      }
      for (const ch of reads.children) {
        children.add(clusterOfRegion.get(ch)!)
      }
    }
    for (const g of cl.gens) {
      const reads = memberReads(memberOfGen(g), o, live)
      for (const s of reads.syms) {
        syms.add(s)
      }
      for (const ch of reads.children) {
        children.add(clusterOfRegion.get(ch)!)
      }
    }
    clusterReadsCache.set(key, syms)
    clusterChildren.set(key, children)
    return { syms, children }
  }
  function successors(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): Set<ClusterId> {
    const out = new Set<ClusterId>()
    const { syms, children } = clusterReads(c, o, live)
    for (const s of syms) {
      if (!symbols.isModuleLevel(s)) {
        continue
      }
      const d = clusterOfSym.get(s)
      if (d !== undefined && d !== c) {
        out.add(d)
      }
    }
    for (const ch of children) {
      if (ch !== c) {
        out.add(ch)
      }
    }
    return out
  }
  function reach(
    o: OutputId,
    roots: Iterable<ClusterId>,
    stopAt: ReadonlySet<ClusterId> | null = null,
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
      for (const d of successors(c, o, true)) {
        work.push(d)
      }
    }
    return included
  }

  // ---- extracted exports (§3.5.3): candidates and their export companions -------
  // A candidate is a pure, unwritten exported declaration cluster a planner
  // allowed out; its companions are the export-specifier / `export default x`
  // clusters that only read it. Neither is an env root for now: the decision
  // (extract, or keep in the env module) is taken once env liveness is known.
  const extractCandidates = new Map<
    ClusterId,
    { output: OutputId; syms: Set<SymbolId>; companions: Set<ClusterId> }
  >()
  for (const [sym, output] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined) {
      continue
    }
    const cl = clusters[c]!
    if (cl.kind !== 'declaration' || cl.effectful || cl.gens.length > 0) {
      continue
    }
    let e = extractCandidates.get(c)
    if (!e) {
      e = { output, syms: new Set(), companions: new Set() }
      extractCandidates.set(c, e)
    } else if (e.output !== output) {
      continue
    }
    e.syms.add(sym)
  }
  const extractRelated = new Set<ClusterId>()
  if (extractCandidates.size > 0) {
    for (const cl of clusters) {
      if (
        cl.kind !== 'export' ||
        !cl.units.every((u) => {
          const k = units[u]!.kind
          return k === 'export-specifier' || k === 'export-default'
        })
      ) {
        continue
      }
      const targets = new Set<ClusterId>()
      for (const s of clusterReads(cl.id, 'env', false).syms) {
        if (!symbols.isModuleLevel(s)) {
          continue
        }
        const d = clusterOfSym.get(s)
        if (d !== undefined && d !== cl.id) {
          targets.add(d)
        }
      }
      if (targets.size !== 1) {
        continue
      }
      const [target] = targets
      const e = extractCandidates.get(target!)
      if (e) {
        e.companions.add(cl.id)
        extractRelated.add(cl.id)
      }
    }
    for (const c of extractCandidates.keys()) {
      extractRelated.add(c)
    }
  }

  // ---- dead claims (ancestor erasure, R37): the owner contributes nothing ----
  const deadGens = new Set<GenUnitId>()
  for (const claim of rewrites.claims.values()) {
    const g = gens[claim.owner]!
    const o: OutputId = g.home === 'auto' ? 'env' : g.home
    if (!treeOf(o).hasClaim(claim.region)) {
      deadGens.add(claim.owner)
    }
  }
  const deadClusters = new Set<ClusterId>()
  for (const g of deadGens) {
    deadClusters.add(clusterOfGen.get(g)!)
  }
  // fixed-home generated units pin their cluster
  const pinned = new Map<ClusterId, OutputId>()
  for (const g of gens) {
    if (g.home === 'auto' || deadGens.has(g.id)) {
      continue
    }
    const c = clusterOfGen.get(g.id)!
    const prev = pinned.get(c)
    if (prev !== undefined && prev !== g.home) {
      throw new Error(
        `generated units ${g.by} pin one cluster to two outputs (${prev}, ${g.home})`,
      )
    }
    pinned.set(c, g.home)
  }

  // ---- roots -----------------------------------------------------------------
  const rootCluster = (r: RootRef): ClusterId | undefined => {
    switch (r.t) {
      case 'unit':
        return clusterOfRegion.get(units[r.id]!.region)
      case 'region':
        return clusterOfRegion.get(r.id)
      case 'gen':
        return clusterOfGen.get(r.id)
    }
  }
  const unitSurvives = (u: UnitId): boolean => {
    const unit = units[u]!
    const item = items[unit.item]!
    const probe =
      unit.range.start === item.range.start
        ? item.nodeRange.start
        : unit.range.start
    return !envTree.isErasedAt(probe)
  }
  const envRoots = new Set<ClusterId>()
  for (const u of units) {
    if (!unitSurvives(u.id)) {
      continue
    }
    const c = clusterOfRegion.get(u.region)!
    if (u.kind === 'effect' || u.kind === 'import-effect') {
      envRoots.add(c)
    } else if (
      u.kind === 'export-specifier' ||
      u.kind === 'reexport' ||
      u.kind === 'export-default' ||
      u.exported.length > 0
    ) {
      if (!extractRelated.has(c)) {
        envRoots.add(c)
      }
    }
  }
  for (const g of gens) {
    if (g.effectful && g.home === 'auto' && !deadGens.has(g.id)) {
      envRoots.add(clusterOfGen.get(g.id)!)
    }
  }

  const envDecl = outputs.get('env')
  for (const r of envDecl?.roots ?? []) {
    const c = rootCluster(r)
    if (c !== undefined) {
      envRoots.add(c)
    }
  }
  const derivedRoots = new Map<OutputId, Set<ClusterId>>()
  for (const [id, decl] of outputs) {
    if (id === 'env') {
      continue
    }
    const set = new Set<ClusterId>()
    for (const r of decl.roots) {
      const c = rootCluster(r)
      if (c !== undefined) {
        set.add(c)
      }
    }
    derivedRoots.set(id, set)
  }
  for (const g of gens) {
    if (g.home !== 'auto' && !deadGens.has(g.id)) {
      let set = derivedRoots.get(g.home)
      if (!set) {
        set = new Set()
        derivedRoots.set(g.home, set)
      }
      set.add(clusterOfGen.get(g.id)!)
    }
  }

  // ---- provenance: clusters reachable in G0 from erased reads -------------
  const erasedParts = envTree.erasedParts(0, t1.tail.end)
  const erasedSeeds = new Set<ClusterId>()
  for (const part of erasedParts) {
    for (const ref of refs.refsIn(part)) {
      if (!READ_KINDS.has(ref.kind) || !symbols.isModuleLevel(ref.sym)) {
        continue
      }
      const d = clusterOfSym.get(ref.sym)
      if (d !== undefined) {
        erasedSeeds.add(d)
      }
    }
  }
  const fromErased = new Set<ClusterId>()
  {
    const work = [...erasedSeeds]
    while (work.length > 0) {
      const c = work.pop()!
      if (fromErased.has(c)) {
        continue
      }
      fromErased.add(c)
      for (const d of successors(c, 'env', false)) {
        work.push(d)
      }
    }
  }

  // ---- derived reach (provisional), movable test, env roots fixpoint ------
  const derivedReach = new Map<OutputId, Set<ClusterId>>()
  for (const [id, roots] of derivedRoots) {
    derivedReach.set(id, reach(id, roots))
  }
  // rule 5: a pure declaration cluster nobody reads (and no derived output roots) is harmless in the
  // env module and keeps what it reads alive
  for (const cl of clusters) {
    if (
      cl.kind !== 'declaration' ||
      cl.effectful ||
      cl.exported ||
      !cl.units.every(unitSurvives)
    ) {
      continue
    }
    if (![...cl.declares].every((s) => refs.valueRefsOf(s).length === 0)) {
      continue
    }
    let derivedNeeds = false
    for (const set of derivedReach.values()) {
      if (set.has(cl.id)) {
        derivedNeeds = true
      }
    }
    if (derivedNeeds) {
      continue
    }
    // dead code that would keep a chunk's dependency in the env module (an
    // unused function rendering the split component) is dropped instead
    let pulls = false
    for (const c of reach('env', [cl.id])) {
      if (c === cl.id) {
        continue
      }
      for (const set of derivedReach.values()) {
        if (set.has(c)) {
          pulls = true
          break
        }
      }
      if (pulls) {
        break
      }
    }
    if (!pulls) {
      envRoots.add(cl.id)
    }
  }
  const movable = new Set<ClusterId>()
  const orphaned = new Set<ClusterId>()
  const pure = (c: ClusterId) => !clusters[c]!.effectful
  // Clusters mutated by top-level code: an augmentation unit, or a live write
  // owned by a unit region of the cluster other than a declaration unit.
  const mutatedClusters = new Set<ClusterId>()
  for (const cl of clusters) {
    let hasMutator = cl.units.some((u) => units[u]!.augments.length > 0)
    if (!hasMutator) {
      for (const r of cl.regions) {
        const region = regions.get(r)
        if (region.kind !== 'unit' || region.unit === null) {
          continue
        }
        const unit = units[region.unit]!
        for (const ref of ownedRefs.get(r) ?? []) {
          if (
            ref.kind === 'write' &&
            isLive(ref, 'env') &&
            cl.declares.has(ref.sym) &&
            !unit.declares.includes(ref.sym)
          ) {
            hasMutator = true
            break
          }
        }
        if (hasMutator) {
          break
        }
      }
    }
    if (hasMutator) {
      mutatedClusters.add(cl.id)
    }
  }
  let liveEnv = new Set<ClusterId>()
  for (let round = 0; round < 10; round++) {
    liveEnv = reach('env', envRoots)
    let added = false
    for (const cl of clusters) {
      if (
        liveEnv.has(cl.id) ||
        cl.kind !== 'declaration' ||
        !cl.effectful ||
        cl.exported
      ) {
        continue
      }
      if (envRoots.has(cl.id)) {
        continue
      }
      if (isMovable(cl)) {
        movable.add(cl.id)
        continue
      }
      if (fromErased.has(cl.id)) {
        continue // orphaned by us: removable with its initialiser effects
      }
      envRoots.add(cl.id)
      added = true
    }
    if (!added) {
      break
    }
  }
  for (const cl of clusters) {
    if (!liveEnv.has(cl.id) && fromErased.has(cl.id) && !cl.envPinned) {
      orphaned.add(cl.id)
    }
  }

  function isMovable(cl: Cluster): boolean {
    // (a) exactly one derived needer
    const needs: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(cl.id)) {
        needs.push(id)
      }
    }
    if (needs.length !== 1) {
      return false
    }
    // (b) no ordered-evaluation constraint: nothing mutates it, and it reads nothing mutated
    if (mutatedClusters.has(cl.id)) {
      return false
    }
    if (cl.units.some((u) => units[u]!.kind !== 'declaration')) {
      return false
    }
    for (const r of cl.regions) {
      for (const ref of ownedRefs.get(r) ?? []) {
        if (
          !ref.eager ||
          !READ_KINDS.has(ref.kind) ||
          !isLive(ref, 'env') ||
          !symbols.isModuleLevel(ref.sym)
        ) {
          continue
        }
        const d = clusterOfSym.get(ref.sym)
        if (d === undefined || d === cl.id) {
          continue
        }
        if (mutatedClusters.has(d)) {
          return false
        }
        const dc = clusters[d]!
        // (c) imports used by no other output, or pure module clusters
        if (dc.kind === 'import') {
          for (const [id, set] of derivedReach) {
            if (id !== needs[0] && set.has(d)) {
              return false
            }
          }
          if (liveEnv.has(d)) {
            return false
          }
        } else if (!pure(d)) {
          return false
        }
      }
    }
    // (d) no surviving effectful unit after it in the env module (benign ones excepted)
    for (const u of units) {
      if (
        u.item <= cl.lastItem ||
        !u.effectful ||
        benignEffects.has(u.id) ||
        !unitSurvives(u.id)
      ) {
        continue
      }
      if (clusterOfRegion.get(u.region) === cl.id) {
        continue
      }
      if (u.kind === 'type') {
        continue
      }
      return false
    }
    return true
  }

  // ---- extracted exports: decide ----------------------------------------------
  const extracted: Array<ExtractedExport> = []
  if (extractCandidates.size > 0) {
    let cancelled = false
    for (const [c, e] of extractCandidates) {
      let ok = !liveEnv.has(c)
      if (ok) {
        let derivedNeeds = false
        for (const set of derivedReach.values()) {
          if (set.has(c)) {
            derivedNeeds = true
            break
          }
        }
        ok = derivedNeeds
      }
      if (ok) {
        // an eager read of something the env module keeps would evaluate in a
        // cycle (the env module re-exports the extracted module): stay
        for (const r of clusters[c]!.regions) {
          for (const ref of ownedRefs.get(r) ?? []) {
            if (
              !ref.eager ||
              !READ_KINDS.has(ref.kind) ||
              !symbols.isModuleLevel(ref.sym)
            ) {
              continue
            }
            const d = clusterOfSym.get(ref.sym)
            if (d === undefined || d === c) {
              continue
            }
            if (liveEnv.has(d) || clusters[d]!.envPinned) {
              ok = false
              break
            }
          }
          if (!ok) {
            break
          }
        }
      }
      if (ok) {
        pinned.set(c, e.output)
        for (const k of e.companions) {
          deadClusters.add(k) // rendered as the env module's re-export glue
        }
        extracted.push({ cluster: c, output: e.output, syms: [...e.syms] })
      } else {
        envRoots.add(c)
        for (const k of e.companions) {
          envRoots.add(k)
        }
        cancelled = true
      }
    }
    if (cancelled) {
      liveEnv = reach('env', envRoots)
    }
    if (extracted.length > 0) {
      // chunks import an extracted cluster from its output: their reach stops
      // there; the extracted output reaches what its cluster reads
      const stop = new Set(extracted.map((e) => e.cluster))
      for (const [id, roots] of derivedRoots) {
        derivedReach.set(id, reach(id, roots, stop))
      }
      for (const e of extracted) {
        const others = new Set([...stop].filter((c) => c !== e.cluster))
        derivedRoots.set(e.output, new Set([e.cluster]))
        derivedReach.set(e.output, reach(e.output, [e.cluster], others))
      }
    }
  }

  // ---- needers and homes -----------------------------------------------------
  const needers = new Map<ClusterId, Set<OutputId>>()
  for (const cl of clusters) {
    const set = new Set<OutputId>()
    if (liveEnv.has(cl.id)) {
      set.add('env')
    }
    for (const [id, r] of derivedReach) {
      if (r.has(cl.id)) {
        set.add(id)
      }
    }
    needers.set(cl.id, set)
  }
  const home = new Map<ClusterId, Home>()
  const created: Array<OutputDecl> = []
  const sharedByKey = new Map<string, OutputId>()
  const keyOf = (o: OutputId) => outputs.get(o)?.key ?? o
  for (const cl of clusters) {
    const S = needers.get(cl.id)!
    const derivedNeeds = [...S].some((o) => o !== 'env')
    if (deadClusters.has(cl.id) || (orphaned.has(cl.id) && !derivedNeeds)) {
      // orphaned by an env erasure and needed by no derived output: gone;
      // still needed by a chunk (an erased option value named it): homed below
      home.set(cl.id, 'removed')
      continue
    }
    const pin = pinned.get(cl.id)
    if (pin !== undefined) {
      home.set(cl.id, pin)
      continue
    }
    if (cl.envPinned) {
      home.set(cl.id, 'env')
      continue
    }
    if (S.has('env')) {
      home.set(cl.id, cl.copyable && S.size > 1 ? 'duplicate' : 'env')
      continue
    }
    const derived = [...S].filter((o) => o !== 'env')
    if (derived.length === 0) {
      // nobody needs it: a gen unit disappears; an unread import of a route
      // module is dropped (J2.5); a pure unexported declaration that was not
      // rooted (dead code that would pull a chunk's dependency) is dropped;
      // other source stays in the env module (harmless) unless orphaned
      const dead =
        cl.kind === 'gen' ||
        (cl.kind === 'import' && routeModule) ||
        (cl.kind === 'declaration' && !cl.effectful && !cl.exported)
      home.set(cl.id, dead ? 'removed' : 'env')
      continue
    }
    if (derived.length === 1) {
      if (
        cl.copyable ||
        pure(cl.id) ||
        movable.has(cl.id) ||
        cl.kind === 'gen'
      ) {
        home.set(cl.id, derived[0]!)
      } else {
        home.set(cl.id, 'env')
      }
      continue
    }
    if (cl.copyable) {
      home.set(cl.id, 'duplicate')
      continue
    }
    if (!pure(cl.id)) {
      home.set(cl.id, 'env')
      continue
    }
    const key = derived.map(keyOf).sort().join('+')
    let shared = sharedByKey.get(key)
    if (!shared) {
      const id = deriveId(input.canonicalId, { kind: 'shared', value: key })
      shared = `derived:${id}`
      sharedByKey.set(key, shared)
      created.push({
        id: shared,
        kind: 'shared',
        key: `shared~${key}`,
        derivedId: id,
        roots: [],
      })
    }
    home.set(cl.id, shared)
  }
  // effectful clusters homed in env because a derived output needs them become env roots (table rows 4/7)
  for (const cl of clusters) {
    if (home.get(cl.id) === 'env' && !liveEnv.has(cl.id) && cl.effectful) {
      envRoots.add(cl.id)
    }
  }
  liveEnv = reach('env', envRoots)
  for (const cl of clusters) {
    if (liveEnv.has(cl.id)) {
      needers.get(cl.id)!.add('env')
    }
  }

  // ---- single-writer rule ------------------------------------------------------
  for (const [declRoot, writers] of writerConstraints) {
    const c = clusterOfMember(declRoot)
    const S = needers.get(c)!
    const writerHomes = new Map<OutputId, RegionId>()
    for (const w of [...writers].sort(
      (a, b) => regions.get(a).range.start - regions.get(b).range.start,
    )) {
      const claim = rewrites.claims.get(w)
      const wc = claim
        ? clusterOfGen.get(claim.owner)!
        : clusterOfRegion.get(w)!
      const h = home.get(wc)
      const o: OutputId =
        h === undefined || h === 'duplicate' || h === 'removed' ? 'env' : h
      if (!writerHomes.has(o)) {
        writerHomes.set(o, w)
      } else {
        fallbacks.push({ region: w, reason: 'multi-writer', cluster: c })
      }
    }
    const derivedHomes = [...writerHomes].filter(([o]) => o !== 'env')
    if (derivedHomes.length === 0) {
      continue
    }
    if (derivedHomes.length > 1) {
      for (const [, w] of derivedHomes.slice(1)) {
        fallbacks.push({ region: w, reason: 'multi-writer', cluster: c })
      }
    }
    const [[g, w]] = derivedHomes as [[OutputId, RegionId]]
    if (S.has('env') || writerHomes.has('env')) {
      const kind = outputs.get(g)?.kind
      fallbacks.push({
        region: w,
        reason: kind === 'hydrate' ? 'hydrate-writer' : 'shared-writer',
        cluster: c,
      })
    } else {
      home.set(c, g)
    }
  }

  // ---- inclusion and glue needs ------------------------------------------------
  const allOutputs: Array<OutputId> = [
    'env',
    ...[...outputs.keys()].filter((o) => o !== 'env'),
    ...created.map((c) => c.id),
  ]
  const included = new Map<OutputId, Set<ClusterId>>()
  for (const o of allOutputs) {
    included.set(o, new Set())
  }
  for (const cl of clusters) {
    const h = home.get(cl.id)!
    const S = needers.get(cl.id)!
    if (h === 'removed') {
      continue
    }
    if (h === 'duplicate') {
      // placed by the loop below: only where an included cluster reads it, not in
      // every output that reaches it through a cluster homed elsewhere
      continue
    }
    included.get(h)!.add(cl.id)
  }
  // duplicated clusters follow their readers into every output that includes a reader
  for (let round = 0; round < 4; round++) {
    let changed = false
    for (const o of allOutputs) {
      const inc = included.get(o)!
      for (const c of [...inc]) {
        const { syms } = clusterReads(c, o, true)
        for (const s of syms) {
          const d = clusterOfSym.get(s)
          if (d !== undefined && !inc.has(d) && home.get(d) === 'duplicate') {
            inc.add(d)
            changed = true
          }
        }
      }
    }
    if (!changed) {
      break
    }
  }
  const imports = new Map<OutputId, Map<OutputId, Set<SymbolId>>>()
  const exportsNeeded = new Map<OutputId, Set<SymbolId>>()
  for (const o of allOutputs) {
    const inc = included.get(o)!
    const map = new Map<OutputId, Set<SymbolId>>()
    imports.set(o, map)
    const wanted: Array<SymbolId> = []
    for (const c of inc) {
      for (const s of clusterReads(c, o, true).syms) {
        wanted.push(s)
      }
    }
    // a root homed elsewhere is imported by the output that rooted it
    for (const c of derivedRoots.get(o) ?? []) {
      if (!inc.has(c)) {
        for (const s of clusters[c]!.declares) {
          wanted.push(s)
        }
      }
    }
    {
      for (const s of wanted) {
        if (!symbols.isModuleLevel(s)) {
          continue
        }
        const d = clusterOfSym.get(s)
        if (d === undefined || inc.has(d)) {
          continue
        }
        const h = home.get(d)
        if (
          h === undefined ||
          h === 'removed' ||
          h === 'duplicate' ||
          h === o
        ) {
          continue
        }
        let set = map.get(h)
        if (!set) {
          set = new Set()
          map.set(h, set)
        }
        set.add(s)
        let ex = exportsNeeded.get(h)
        if (!ex) {
          ex = new Set()
          exportsNeeded.set(h, ex)
        }
        ex.add(s)
      }
    }
  }

  for (const e of extracted) {
    let ex = exportsNeeded.get(e.output)
    if (!ex) {
      ex = new Set()
      exportsNeeded.set(e.output, ex)
    }
    for (const s of e.syms) {
      ex.add(s)
    }
  }

  return {
    clusters,
    clusterOfRegion,
    clusterOfGen,
    clusterOfSym,
    needers,
    home,
    included,
    imports,
    exportsNeeded,
    orphaned,
    movable,
    fallbacks,
    created,
    extracted,
    readsIn: (o, c) => clusterReads(c, o, true).syms,
  }
}

/** Generated units of a cluster, for diagnostics. */
export function describeCluster(
  cl: Cluster,
  gens: ReadonlyArray<GeneratedUnit>,
): string {
  return `cluster#${cl.id}[${cl.kind}; units ${cl.units.join(',')}; gens ${cl.gens.map((g) => gens[g]!.by).join(',')}]`
}
