/**
 * Clusters, reachability, provenance-based orphans, the movable-effect test,
 * ordered evaluation and needers/homes (see README.md, "Reachability =
 * splitting = dead-code removal"). A generic service: planners supply roots and
 * derived outputs; the core decides what each output contains and what it
 * imports.
 */
import { deriveId } from './identity'
import type { ClassifiedRef, Tier1 } from './analysis'
import type { SymbolId } from './symbols'
import type { Region, RegionId, Unit, UnitId } from './units'
import type {
  Frag,
  GenUnitId,
  OutputId,
  RenderTree,
  RewriteSet,
} from './rewrite'

export type RootRef =
  | { t: 'unit'; id: UnitId }
  | { t: 'region'; id: RegionId }
  | { t: 'gen'; id: GenUnitId }
  /** A module binding a derived output's root reads as its value (J2.8: reported when its effects keep it in the env module). */
  | { t: 'sym'; id: SymbolId }

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
  /** Index of the last item of the cluster (an effectful cluster followed by a surviving effect stays eager); -1 for generated-only clusters. */
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
  reason:
    | 'shared-writer'
    | 'multi-writer'
    | 'ordered-effect'
    | 'hydrate-writer'
    | 'env-declared'
  cluster: ClusterId
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  routeModule: boolean
  benignEffects: ReadonlySet<UnitId>
  /** Exported symbols a planner allows into an extracted-export output. */
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
/**
 * References an output needs the binding for: reads, and writes (an output
 * cannot assign a binding it neither declares nor may import — `x = 1` and
 * `x++` alone make a region depend on `x`).
 */
const NEED_KINDS = new Set([...READ_KINDS, 'write'])

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
  /** Module-level symbols a sub-region writes (a cluster holding one is never an extracted export: the single-writer rule decides). */
  const regionWrittenSyms = new Set<SymbolId>()
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
      regionWrittenSyms.add(ref.sym)
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
            if (NEED_KINDS.has(ref.kind) && (!live || isLive(ref, o))) {
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

  // ---- 5. ordered evaluation: eager readers of mutated clusters join them (a reader cannot move after the writes that follow it) ----
  const fallbacks: Array<Fallback> = []
  const orderedEffectRegions = new Set<RegionId>()
  for (let round = 0; round < 8; round++) {
    let changed = false
    // mutated roots: clusters with an eager live top-level write/augmentation,
    // and the position of their last mutation
    const mutated = new Set<number>()
    const lastMutation = new Map<number, number>()
    const mutate = (root: number, at: number) => {
      mutated.add(root)
      lastMutation.set(root, Math.max(lastMutation.get(root) ?? -1, at))
    }
    for (const ref of refs.all) {
      if (
        ref.kind === 'write' &&
        ref.eager &&
        isLive(ref, 'env') &&
        symbols.isModuleLevel(ref.sym)
      ) {
        const d = declMember.get(ref.sym)
        if (d !== undefined) {
          mutate(uf.find(d), ref.range.start)
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
            mutate(uf.find(d), u.range.start)
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
      } else if ((lastMutation.get(uf.find(d)) ?? -1) > ref.range.start) {
        // a relocated read (a claimed option value) must not move past a
        // later mutation; one that follows every mutation reads the same
        // state wherever it evaluates
        orderedEffectRegions.add(owner)
      }
    }
    if (!changed) {
      break
    }
  }

  // symbols generated text reads: uses the semantic model does not see (a Solid `use:x`)
  const generatedReads = new Set<SymbolId>()
  for (const frags of [
    ...rewrites.edits.map((e) => e.body),
    ...gens.map((g) => g.body),
    ...[...rewrites.claims.values()].map((c) => c.placeholder),
  ]) {
    for (const s of symRefsOf(frags)) {
      generatedReads.add(s)
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
  /**
   * Whether an effect unit only augments bindings its own cluster declares
   * (`Page.displayName = …` after `function Page`): the binding and its
   * writers are one cluster, moved or kept together.
   */
  const ownAugmentation = (u: Unit, cl: Cluster): boolean => {
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
        (o) =>
          units[o]!.kind === 'declaration' && units[o]!.declares.includes(s),
      ),
    )
  }
  for (const cl of clusters) {
    const kinds = new Set(cl.units.map((u) => units[u]!.kind))
    if (cl.units.length === 0) {
      cl.kind = cl.gens.length > 0 ? 'gen' : 'region'
    } else if (
      cl.units.some(
        (u) => units[u]!.kind === 'effect' && !ownAugmentation(units[u]!, cl),
      )
    ) {
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
      [...cl.declares].every(
        (s) => refs.valueRefsOf(s).length === 0 && !generatedReads.has(s),
      )
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
  interface ClusterReads {
    syms: Set<SymbolId>
    children: Set<ClusterId>
  }
  // per output (or `*` for the dead walk), an array indexed by cluster id
  const clusterReadsCache = new Map<string, Array<ClusterReads | undefined>>()
  function clusterReads(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): ClusterReads {
    const outputKey = live ? o : '*'
    let byCluster = clusterReadsCache.get(outputKey)
    if (!byCluster) {
      byCluster = []
      clusterReadsCache.set(outputKey, byCluster)
    }
    const hit = byCluster[c]
    if (hit) {
      return hit
    }
    const syms = new Set<SymbolId>()
    const children = new Set<ClusterId>()
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
    const reads: ClusterReads = { syms, children }
    byCluster[c] = reads
    return reads
  }
  /**
   * The output whose tree decides the live reads of cluster `c` reached from
   * output `o`: an env root a derived output imports from the env module
   * reads what it evaluates there (an identifier option value the splitter
   * replaced in the env output only is no read of a chunk importing `Route`),
   * a cluster pinned to another output what it evaluates in that output. A
   * provider output copies every cluster it reaches: its own tree decides.
   */
  function readsOutput(c: ClusterId, o: OutputId): OutputId {
    if (o === 'env' || outputs.get(o)?.kind === 'provider') {
      return o
    }
    const pin = pinned.get(c)
    if (pin !== undefined) {
      return pin
    }
    return envRoots.has(c) ? 'env' : o
  }
  function successors(
    c: ClusterId,
    o: OutputId,
    live: boolean,
  ): Set<ClusterId> {
    const out = new Set<ClusterId>()
    const { syms, children } = clusterReads(
      c,
      live ? readsOutput(c, o) : o,
      live,
    )
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

  // ---- extracted exports: candidates and their export companions -------
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
    if (
      cl.kind !== 'declaration' ||
      cl.effectful ||
      cl.gens.length > 0 ||
      // a binding a sub-region writes (Hydrate children, a split option
      // value) must meet the single-writer rule below: pinning its cluster
      // to an extracted output would let the writer assign an import
      [...cl.declares].some((s) => regionWrittenSyms.has(s))
    ) {
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

  // ---- dead claims (ancestor erasure): the owner contributes nothing ----
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
      case 'sym':
        return clusterOfSym.get(r.id)
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
      // an augmentation of its own declaration cluster is decided with the
      // cluster (movable, else an effect root below)
      if (!ownAugmentation(u, clusters[c]!)) {
        envRoots.add(c)
      }
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
  // env module and keeps what it reads alive; clusters only read by each other (a dead pure cycle)
  // are such dead code too: code that was dead before the transform is never removed (G16)
  const deadCandidates = new Set<ClusterId>()
  for (const cl of clusters) {
    if (
      cl.kind !== 'declaration' ||
      cl.effectful ||
      cl.exported ||
      !cl.units.every(unitSurvives)
    ) {
      continue
    }
    let derivedNeeds = false
    for (const set of derivedReach.values()) {
      if (set.has(cl.id)) {
        derivedNeeds = true
      }
    }
    if (!derivedNeeds) {
      deadCandidates.add(cl.id)
    }
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const c of deadCandidates) {
      const read = [...clusters[c]!.declares].some((s) =>
        refs.valueRefsOf(s).some((ref) => {
          // a reader outside the candidates, or inside erased text (an
          // orphan of ours, decided by provenance below), is a real reader
          const owner = clusterOfRegion.get(t1.ownerOf(ref))
          return (
            owner === undefined ||
            !deadCandidates.has(owner) ||
            !isLive(ref, 'env')
          )
        }),
      )
      if (read) {
        deadCandidates.delete(c)
        changed = true
      }
    }
  }
  for (const c of deadCandidates) {
    const cl = clusters[c]!
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
  // Clusters mutated by surviving top-level code outside themselves: a live
  // write or augmentation whose region belongs to another cluster (a claimed
  // option value, a unit the clustering did not merge).
  const externallyMutated = new Set<ClusterId>()
  for (const ref of refs.all) {
    if (
      ref.kind !== 'write' ||
      !ref.eager ||
      !isLive(ref, 'env') ||
      !symbols.isModuleLevel(ref.sym)
    ) {
      continue
    }
    const d = clusterOfSym.get(ref.sym)
    if (d === undefined) {
      continue
    }
    const owner = regions.innermostAt(ref.range.start, ref.range.end)
    const claim = owner === null ? undefined : rewrites.claims.get(owner)
    const oc =
      owner === null
        ? undefined
        : claim
          ? clusterOfGen.get(claim.owner)
          : clusterOfRegion.get(owner)
    if (oc !== d) {
      externallyMutated.add(d)
    }
  }
  for (const u of units) {
    if (u.augments.length === 0 || !unitSurvives(u.id)) {
      continue
    }
    const uc = clusterOfRegion.get(u.region)
    for (const s of u.augments) {
      const d = clusterOfSym.get(s)
      if (d !== undefined && d !== uc) {
        externallyMutated.add(d)
      }
    }
  }
  let liveEnv = new Set<ClusterId>()
  for (let round = 0; round < 10; round++) {
    liveEnv = reach('env', envRoots)
    decideMovable()
    let added = false
    for (const cl of clusters) {
      if (!undecided(cl) || movable.has(cl.id)) {
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
  /** An effectful, unexported declaration cluster the env module does not keep (yet): it moves, is orphaned or becomes an env root. */
  function undecided(cl: Cluster): boolean {
    return (
      !liveEnv.has(cl.id) &&
      cl.kind === 'declaration' &&
      cl.effectful &&
      !cl.exported &&
      !envRoots.has(cl.id)
    )
  }
  /**
   * The effectful clusters that move with their only needer (R29/R31),
   * computed from the current env liveness: (a)–(c) per cluster, then (d)
   * over the final placement, decided last item first. A cluster's (d)
   * only looks at units after its last item, whose clusters end after it
   * and are decided already: a later effect moving to the same output
   * evaluates after it there (source order); one staying in the env module,
   * or moving to another output, blocks it.
   */
  function decideMovable(): void {
    movable.clear()
    const target = new Map<ClusterId, OutputId>()
    const candidates = clusters
      .filter(undecided)
      .sort((x, y) => y.lastItem - x.lastItem)
    for (const cl of candidates) {
      const to = movableTo(cl)
      if (to !== undefined && !laterEffectStays(cl, to, target)) {
        target.set(cl.id, to)
        movable.add(cl.id)
      }
    }
  }
  /** The only needer `cl` may move to by R29 (a)–(c), if any. */
  function movableTo(cl: Cluster): OutputId | undefined {
    // (a) exactly one derived needer
    const needs: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(cl.id)) {
        needs.push(id)
      }
    }
    if (needs.length !== 1) {
      return undefined
    }
    // (b) no ordered-evaluation constraint: nothing outside the cluster
    // mutates it (its own top-level augmentations, `X.p = …`, travel with
    // it: a binding and its writers are one cluster), and it reads nothing
    // mutated
    if (externallyMutated.has(cl.id)) {
      return undefined
    }
    for (const u of cl.units) {
      const unit = units[u]!
      if (unit.kind === 'declaration') {
        continue
      }
      if (
        unit.augments.length > 0 &&
        unit.augments.every((s) => cl.declares.has(s))
      ) {
        continue
      }
      return undefined
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
          return undefined
        }
        const dc = clusters[d]!
        // (c) imports used by no other output, or pure module clusters
        if (dc.kind === 'import') {
          for (const [id, set] of derivedReach) {
            if (id !== needs[0] && set.has(d)) {
              return undefined
            }
          }
          if (liveEnv.has(d)) {
            return undefined
          }
        } else if (!pure(d)) {
          return undefined
        }
      }
    }
    return needs[0]
  }
  /**
   * R31 (d): a surviving effectful unit after `cl` (benign ones excepted)
   * that does not move to `to` with it (`target`: the later clusters
   * moving, by output).
   */
  function laterEffectStays(
    cl: Cluster,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
  ): boolean {
    for (const u of units) {
      if (
        u.item <= cl.lastItem ||
        !u.effectful ||
        benignEffects.has(u.id) ||
        !unitSurvives(u.id) ||
        u.kind === 'type'
      ) {
        continue
      }
      const uc = clusterOfRegion.get(u.region)
      if (uc === cl.id || (uc !== undefined && target.get(uc) === to)) {
        continue
      }
      return true
    }
    return false
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
        // every exported symbol of the cluster leaves with it (a `let` and
        // the exported function writing it): the env module re-exports them all
        const syms = new Set(e.syms)
        for (const u of clusters[c]!.units) {
          const unit = units[u]!
          if (unit.exported.length > 0) {
            for (const s of unit.declares) {
              syms.add(s)
            }
          }
        }
        extracted.push({ cluster: c, output: e.output, syms: [...syms] })
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
    // a cancelled candidate's reads and the extracted outputs change what
    // stays and where the rest goes: moves are decided again (a cluster
    // that no longer moves is homed in env and becomes an env root below)
    decideMovable()
  }

  // ---- orphans: erased-only clusters the final env liveness does not reach ------
  // (after the extraction decision: a cancelled candidate is an env root again,
  // and what it reads is live, however an erased range also read it)
  for (const cl of clusters) {
    if (!liveEnv.has(cl.id) && fromErased.has(cl.id) && !cl.envPinned) {
      orphaned.add(cl.id)
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
    if (!liveEnv.has(cl.id)) {
      continue
    }
    const S = needers.get(cl.id)!
    if (S.has('env')) {
      continue
    }
    S.add('env')
    // what those roots read in the env module was homed as if the env module did not need it
    // (an orphan removed, a chunk's own import): it is homed like any env-needed cluster
    if (!deadClusters.has(cl.id) && !pinned.has(cl.id)) {
      home.set(cl.id, cl.copyable && S.size > 1 ? 'duplicate' : 'env')
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

  // ---- sym roots the env module keeps by their effects (J2.8) -------------
  // A derived output whose root value is a binding declared by an effect the
  // route module keeps (destructured from a call, written at the top level
  // where the route module needs it) would only import it: the planner is
  // told, keeps the option in place and reports it.
  for (const [id, decl] of outputs) {
    if (id === 'env') {
      continue
    }
    for (const r of decl.roots) {
      if (r.t !== 'sym') {
        continue
      }
      const d = clusterOfSym.get(r.id)
      if (d === undefined || home.get(d) !== 'env') {
        continue
      }
      const declaring = t1.declaringUnits.get(r.id) ?? []
      if (declaring.length === 0) {
        continue
      }
      // the two user-fixable patterns of J2.8: the declaration itself has effects (a call
      // result, a destructuring) or travels with an exported binding (a
      // writer of module state the route module exports); the value being
      // the exported declaration itself is imported from the env module (no report)
      const decl = units[declaring[0]!]!
      if (
        decl.kind === 'declaration' &&
        !decl.effectful &&
        (!clusters[d]!.exported || decl.exported.length > 0)
      ) {
        continue
      }
      fallbacks.push({
        region: units[declaring[0]!]!.region,
        reason: 'env-declared',
        cluster: d,
      })
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
      // a copy goes where it is rooted, and follows its direct readers (below): a needer that
      // reaches it only through a cluster it imports from elsewhere does not copy it
      for (const o of S) {
        if ((o === 'env' ? envRoots : derivedRoots.get(o))?.has(cl.id)) {
          included.get(o)!.add(cl.id)
        }
      }
      continue
    }
    included.get(h)!.add(cl.id)
  }
  // a provider output is the module's own instance in another layer or environment
  // (J4.14): it includes every cluster its roots reach, the env-homed ones
  // as copies, instead of importing them from the env module (whose server fns are stubs)
  for (const [o, decl] of outputs) {
    if (decl.kind !== 'provider') {
      continue
    }
    const inc = included.get(o)!
    for (const c of derivedReach.get(o) ?? []) {
      if (home.get(c) !== 'removed') {
        inc.add(c)
      }
    }
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
