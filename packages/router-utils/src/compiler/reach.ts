/**
 * Clusters, reachability, provenance-based orphans, the movable-effect test,
 * ordered evaluation and needers/homes (see README.md, "Reachability =
 * splitting = dead-code removal"). A generic service: planners supply roots and
 * derived outputs; the core decides what each output contains and what it
 * imports.
 */
import { deriveId } from './identity'
import { writeKind } from './mutation'
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
  /**
   * Whether the output may be flagged side-effect free to the bundler
   * (`moduleSideEffects: false`). The plan flags it only when no effectful
   * cluster is placed in it: the flag is computed from the content, the
   * declaration opts the output in. Default false.
   */
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
  /**
   * An effect observable without the cluster's declarations: an effectful
   * initialiser, an effect statement other than an augmentation of its own
   * declarations, an effectful generated unit. Such a cluster is never an
   * extracted export (its module could never be dropped as unused) and
   * clears an output's side-effect-free flag; a cluster whose effects only
   * augment what it declares (`Page.displayName = …`) is unobservable while
   * nothing imports it.
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

export type Home = OutputId | 'duplicate' | 'removed'

export interface Fallback {
  region: RegionId
  reason:
    | 'shared-writer'
    | 'multi-writer'
    | 'ordered-effect'
    | 'hydrate-writer'
    | 'env-declared'
    /** The planning rounds did not settle: every sub-region is kept in place (reported by the pipeline). */
    | 'exhausted'
  cluster: ClusterId
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  routeModule: boolean
  /** Whether an effect unit is a recognised framework call known not to touch user state (asked only when a cluster could move past it). */
  isBenign: (unit: UnitId) => boolean
  /** Exported symbols a planner allows into an extracted-export output. */
  extractions?: ReadonlyMap<SymbolId, OutputId>
  /**
   * Whether extracted-export outputs are emitted (a build) or folded into
   * the env module (dev: `env.mode !== 'build'`); the decision which exports
   * leave, and which of them chunks copy, is the same either way.
   */
  extractedOutputs: boolean
}

/** Why an exported declaration a chunk needs stays in the env module (`Placement.kept`). */
export type KeptReason = 'effects' | 'reassigned' | 'live' | 'reads' | 'order'

export interface KeptExport {
  sym: SymbolId
  reason: KeptReason
  /** The declaring unit's range, for a positioned diagnostic. */
  range: { start: number; end: number }
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
  home: Map<ClusterId, Home>
  /** Clusters each output contains (homed or duplicated). */
  included: Map<OutputId, Set<ClusterId>>
  /** o → (home output → symbols o imports from it). */
  imports: Map<OutputId, Map<OutputId, Set<SymbolId>>>
  /** Symbols each output must export for other outputs. */
  exportsNeeded: Map<OutputId, Set<SymbolId>>
  fallbacks: Array<Fallback>
  /** Outputs created by placement (lazy shared modules). */
  created: Array<OutputDecl>
  /** Exported clusters homed in an extracted-export output (the env module re-exports them). */
  extracted: Array<ExtractedExport>
  /** Exported declarations a lazy output needs that stay in the env module, with the reason. */
  kept: Array<KeptExport>
  /** Type units the env module drops (`importStays`); every other type unit stays there, whatever its cluster. */
  droppedTypeUnits: Set<UnitId>
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
  const { t1, rewrites, outputs, routeModule, isBenign } = input
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
  // ---- writes: every write of a module binding, one table -----------------
  /**
   * The module's mutation model (`t1.mutation`: every assignment of a
   * binding and every write of a member of one, eager or lazy) restricted
   * to module-level bindings, with what placement adds: `live` (not inside a
   * range the env module erases), `augment` (a top-level augmentation unit,
   * `X.p = …`, `X.push(…)`, `X = …` as a statement: its `owner` is the
   * unit's region). Every rule that asks what writes a binding reads this
   * table: clustering (a live top-level writer joins what it writes),
   * ordered evaluation (an eager reader of a binding written after it, or
   * by lazy code, cannot move), the movable test's "nothing outside writes
   * it" and the one predicate `mutatedOutside` ("something outside the
   * reader writes what it reads eagerly") behind the movable test, the
   * pure-cluster gate and the option-value fallbacks.
   */
  interface Write {
    sym: SymbolId
    at: number
    eager: boolean
    live: boolean
    owner: RegionId | null
    augment: boolean
    /** A member write (`x.p = …`, `x.push(…)`), not an assignment of the binding. */
    member: boolean
  }
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

  // ---- 2. live writes and augmentations join the cluster they write -----
  const writerConstraints = new Map<number, Set<RegionId>>() // decl member root → writer sub-regions
  /** Module-level symbols a sub-region writes (a cluster holding one is never an extracted export: the single-writer rule decides). */
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
      let set = writerConstraints.get(d)
      if (!set) {
        set = new Set()
        writerConstraints.set(d, set)
      }
      set.add(w.owner)
    }
  }

  // ---- member reads -----------------------------------------------------
  interface MemberReads {
    syms: Array<SymbolId>
    children: Array<RegionId>
  }
  // per output (live reads) or for the dead walk, an array indexed by member
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
      const g = gens[m - regionCount]!
      fragReads(g.body, o, live, into)
    }
    byMember[m] = into
    return into
  }

  // ---- 5. ordered evaluation: eager readers of eagerly mutated clusters join them (a reader cannot move after the writes that follow it) ----
  // Every round that changes something merges two clusters, so the rounds
  // end (the union-find only grows) once no eager reader is left outside the
  // cluster it reads.
  const fallbacks: Array<Fallback> = []
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
  /**
   * The one mutation predicate: whether a read of `sym` evaluated at
   * `readAt` by cluster `by` observes state something else writes. A
   * surviving write by another cluster counts when it runs after the read
   * (an eager write further down the module: a relocated read would move
   * past it) or at an unknown time (a write inside a function: it may run
   * before a lazy output evaluates the read). A write by the reading
   * cluster itself does not (it travels with the read).
   */
  function mutatedOutside(sym: SymbolId, readAt: number, by: number): boolean {
    const list = writesOfSym.get(sym)
    if (list === undefined) {
      return false
    }
    for (const w of list) {
      if (!w.live || (w.eager && w.at <= readAt)) {
        continue
      }
      if (w.owner === null || uf.find(memberOfWriter(w.owner)) !== by) {
        return true
      }
    }
    return false
  }
  /** The union-find member a write's region belongs to: a claimed region is its owner's. */
  function memberOfWriter(owner: RegionId): number {
    const claim = rewrites.claims.get(owner)
    return claim ? memberOfGen(claim.owner) : owner
  }
  // a relocated read (a claimed option value) of state something writes
  // after it, or at an unknown time, keeps the option in place
  const orderedEffectRegions = new Set<RegionId>()
  for (const ref of eagerReads) {
    const owner = regions.innermostAt(ref.range.start, ref.range.end)
    if (owner === null || regions.get(owner).kind === 'unit') {
      continue
    }
    const by = uf.find(memberOfWriter(owner))
    if (
      uf.find(declMember.get(ref.sym)!) !== by &&
      mutatedOutside(ref.sym, ref.range.start, by)
    ) {
      orderedEffectRegions.add(owner)
    }
  }

  // symbols generated text reads: uses the semantic model does not see (a Solid `use:x`)
  const generatedReads = new Set<SymbolId>()
  const readsGenerated = (frags: ReadonlyArray<Frag>) => {
    for (const s of symRefsOf(frags)) {
      generatedReads.add(s)
    }
  }
  for (const e of rewrites.edits) {
    readsGenerated(e.body)
  }
  for (const g of gens) {
    readsGenerated(g.body)
  }
  for (const c of rewrites.claims.values()) {
    readsGenerated(c.placeholder)
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
    const kinds = (...ks: Array<Unit['kind']>) =>
      cl.units.some((u) => ks.includes(units[u]!.kind))
    if (cl.units.length === 0) {
      cl.kind = cl.gens.length > 0 ? 'gen' : 'region'
    } else if (
      cl.units.some(
        (u) => units[u]!.kind === 'effect' && !ownAugmentation(units[u]!, cl),
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
        cl.units.some(
          (u) => units[u]!.kind !== 'effect' && units[u]!.effectful,
        ))
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
    let reads: OutputId
    if (live) {
      reads = readsOutput(c, o)
      const hit = successorsByOutput.get(reads)
      if (hit) {
        byCluster = hit
      } else {
        byCluster = []
        successorsByOutput.set(reads, byCluster)
      }
    } else {
      reads = o
      byCluster = deadSuccessors
    }
    const hit = byCluster[c]
    if (hit) {
      return hit
    }
    const out: Array<ClusterId> = []
    const { syms, children } = clusterReads(c, reads, live)
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
      const next = successors(c, o, true)
      for (let i = 0; i < next.length; i++) {
        work.push(next[i]!)
      }
    }
    return included
  }

  // ---- extracted exports: candidates and their export companions -------
  // Planners allow every local value export out; a candidate is one whose
  // cluster is an unassigned declaration without observable effects (its
  // augmentations, `Page.p = …`, travel with it under the effect-order rule
  // of every move, `effectStays`). Its companions are the export-specifier /
  // `export default x` clusters that only read it. Neither is an env root
  // for now: the decision (extract, or keep in the env module) is taken once
  // env liveness is known.
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
      cl.sideEffects ||
      cl.gens.length > 0 ||
      // a reassigned export stays: its writers would assign an import
      t1.mutation.isReassigned(sym) ||
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
      // a write names the binding too: an initialiser only an erased
      // handler assigns is orphaned with it
      if (!NEED_KINDS.has(ref.kind) || !symbols.isModuleLevel(ref.sym)) {
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
    if (!derivedNeeds(cl.id)) {
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
  /**
   * Whether a cluster eagerly reads a module binding something outside it
   * writes (`mutatedOutside`): its value depends on when it evaluates, so
   * it never moves to a lazy output, pure or not (`const initial = [n]`
   * next to `function inc() { n++ }` keeps the source's `[0]`): it is an
   * env root like an effectful cluster, and derived outputs import it.
   */
  let mutableReaders: Set<ClusterId> | null = null
  function readsMutableState(c: ClusterId): boolean {
    if (writes.length === 0) {
      return false
    }
    if (mutableReaders === null) {
      // over the eager live reads of written bindings (few), not over every
      // reference of every cluster asked about
      mutableReaders = new Set()
      for (const ref of eagerReads) {
        const owner = regions.innermostAt(ref.range.start, ref.range.end)
        if (owner === null) {
          continue
        }
        const reader = clusterOfRegion.get(owner)!
        if (
          clusterOfSym.get(ref.sym) !== reader &&
          mutatedOutside(
            ref.sym,
            ref.range.start,
            uf.find(memberOfWriter(owner)),
          )
        ) {
          mutableReaders.add(reader)
        }
      }
    }
    return mutableReaders.has(c)
  }
  // the surviving effects a moving cluster is ordered against (asked only
  // when one could move: most modules never need the benign check)
  let survivingEffects: Array<Unit> | null = null
  const effectsSurviving = (): Array<Unit> =>
    (survivingEffects ??= units.filter(
      (u) =>
        u.effectful &&
        u.kind !== 'type' &&
        unitSurvives(u.id) &&
        !isBenign(u.id),
    ))
  // ---- extracted exports: what may leave ------------------------------------
  // what derived outputs need before any extraction (a chunk may reach a
  // candidate through another one)
  const needed = new Set<ClusterId>()
  if (extractCandidates.size > 0) {
    for (const set of derivedReach.values()) {
      for (const c of set) {
        needed.add(c)
      }
    }
  }
  /** A candidate still leaves: a derived output needs it, the env module does not keep it, it reads nothing kept at its evaluation and its effects, if any, keep their order (`decideMovable`). */
  const extractable = (c: ClusterId): boolean =>
    !liveEnv.has(c) &&
    needed.has(c) &&
    !readsKeptEagerly(c) &&
    (!clusters[c]!.effectful || movable.has(c))
  // A chunk copies a pure extracted export instead of importing its module.
  // The extracted module is re-exported by the route module (statically, for
  // other importers) and would be imported by the lazy chunk: reachable from
  // the entry and from a chunk at once, Rolldown < 1.1.5 and any Rolldown
  // under a user chunk group that merges into the entry place it with the
  // entry, and the export is eager again (tanstack.com, Vite 8.0.x). With the
  // copy nobody imports the module unless another file imports the binding,
  // and an unused side-effect-free module is tree-shaken, not placed. Only
  // pure clusters nothing assigns or mutates are copied: state or an effect
  // would run twice, and a mutated object would be two objects.
  // Importers (rare) then get the extracted instance and the chunk its copy.
  // In dev nothing is bundled: extraction exists only so a bundler can
  // tree-shake the module when nothing imports the binding, while the route
  // module's static re-export loads the extracted module (and its imports)
  // eagerly on every page, one request level deeper than the route module's
  // own imports (tanstack.com dev crawl +0.6 s). So in dev an extracted
  // cluster stays in the route module as written (`extractedOutputs`), and
  // chunks copy or import it exactly as in a build.
  // the clusters whose text holds a region another output claims (a
  // component with a Hydrate boundary): one instance, imported, since its
  // claimed region renders in the owner's output already
  const claimHolders = new Set<ClusterId>()
  for (const claim of rewrites.claims.values()) {
    const parent = regions.get(claim.region).parent
    if (parent !== null) {
      claimHolders.add(clusterOfRegion.get(parent)!)
    }
  }
  /** A candidate a chunk copies (pure, observing no mutable state, declaring nothing anything assigns or mutates, holding no claimed region). */
  const copies = (c: ClusterId): boolean =>
    !clusters[c]!.effectful &&
    !readsMutableState(c) &&
    !claimHolders.has(c) &&
    ![...clusters[c]!.declares].some((s) => t1.mutation.isMutated(s))

  // ---- env roots and extraction: one fixed point -------------------------
  // The env module's roots and the extracted outputs are decided together,
  // over the final placement. Each round: derived reach with the candidates
  // still extracted (chunks import an extracted cluster from its output, so
  // their reach stops there, and that output reaches what its cluster
  // reads), env liveness, the moving set (`decideMovable`). An effectful
  // cluster that does not move is an env root, which makes what it reads
  // live in the env module: a cluster read by it no longer moves, nor one
  // that only could because that one moved with it (no surviving effect
  // after it stays behind). A candidate the env module now keeps, or that
  // reads what it keeps eagerly, is cancelled: it and its export companions
  // are env roots. Monotone (roots only grow, candidates only cancel):
  // repeat until nothing changes, so every decision was taken over the
  // final env roots.
  const remaining = new Map(extractCandidates)
  let liveEnv = new Set<ClusterId>()
  // derived reach changes only with the candidates still extracted, or when
  // a cluster a derived output reaches becomes an env root (it then reads
  // what it evaluates in the env module)
  let derivedStale = remaining.size > 0
  for (;;) {
    if (derivedStale) {
      derivedStale = false
      const stop = new Set(remaining.keys())
      // a chunk's reach passes through the candidates it copies and stops
      // at the others, which it imports; an extracted module's reach stops
      // at every other candidate (it imports them)
      const chunkStop = new Set([...stop].filter((c) => !copies(c)))
      for (const [c, e] of extractCandidates) {
        if (remaining.has(c)) {
          pinned.set(c, e.output)
          derivedRoots.set(e.output, new Set([c]))
        } else {
          pinned.delete(c)
          derivedRoots.set(e.output, new Set())
        }
      }
      for (const [id, roots] of derivedRoots) {
        const own = [...roots].find((c) => remaining.get(c)?.output === id)
        derivedReach.set(
          id,
          reach(
            id,
            roots,
            own !== undefined
              ? new Set([...stop].filter((c) => c !== own))
              : outputs.get(id)?.kind === 'export'
                ? stop
                : chunkStop,
          ),
        )
      }
    }
    liveEnv = reach('env', envRoots)
    decideMovable()
    let changed = false
    for (const cl of clusters) {
      if (!undecided(cl) || movable.has(cl.id)) {
        continue
      }
      const needed = derivedNeeds(cl.id)
      if (fromErased.has(cl.id) && !needed) {
        continue // orphaned by us: removable with its initialiser effects
      }
      envRoots.add(cl.id)
      derivedStale ||= needed
      changed = true
    }
    // static outputs: a cluster an extracted export's module needs that
    // reads, at its evaluation, a binding the env module keeps stays in the
    // env module, an env root, and the extracted module imports it
    // (`readsKeptEagerly`; a candidate itself is cancelled below, with its
    // companions). The "chunk loads after the route module" argument of the
    // movable test holds for lazily imported outputs only; an effectful
    // cluster moves to a static output only when no other surviving effect
    // remains at all (`effectStays`).
    for (const cl of remaining.size > 0 ? clusters : []) {
      if (
        cl.kind !== 'declaration' ||
        cl.copyable ||
        liveEnv.has(cl.id) ||
        envRoots.has(cl.id) ||
        remaining.has(cl.id) ||
        !neededByStaticOutput(cl.id) ||
        !readsKeptEagerly(cl.id)
      ) {
        continue
      }
      envRoots.add(cl.id)
      derivedStale = true
      changed = true
    }
    if (changed) {
      continue
    }
    for (const [c, e] of remaining) {
      if (extractable(c)) {
        continue
      }
      remaining.delete(c)
      envRoots.add(c)
      for (const k of e.companions) {
        envRoots.add(k)
      }
      derivedStale = true
      changed = true
    }
    if (!changed) {
      break
    }
  }
  // exported declarations a lazy output needs that stay in the env module,
  // with the reason (a planner reports them; `extractable` and the candidate
  // filter above decided)
  const kept: Array<KeptExport> = []
  for (const [sym] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined || remaining.has(c)) {
      continue
    }
    const cl = clusters[c]!
    if (cl.kind !== 'declaration' || cl.gens.length > 0) {
      continue
    }
    let lazyNeeds = false
    for (const [id, set] of derivedReach) {
      const kind = outputs.get(id)?.kind
      if (set.has(c) && kind !== 'export' && kind !== 'provider') {
        lazyNeeds = true
        break
      }
    }
    if (!lazyNeeds) {
      continue
    }
    const reason: KeptReason = cl.sideEffects
      ? 'effects'
      : t1.mutation.isReassigned(sym) || regionWrittenSyms.has(sym)
        ? 'reassigned'
        : liveEnv.has(c)
          ? 'live'
          : readsKeptEagerly(c)
            ? 'reads'
            : 'order'
    const declaring = (t1.declaringUnits.get(sym) ?? [])[0]
    const range =
      declaring === undefined
        ? regions.get(cl.regions[0]!).range
        : units[declaring]!.range
    kept.push({
      sym,
      reason,
      range: { start: range.start, end: range.end },
    })
  }
  const copied = new Set([...remaining.keys()].filter(copies))
  if (!input.extractedOutputs) {
    // dev: an extracted cluster stays in the env module as written (see
    // `copies`); its export companions with it, its extracted output empty
    for (const [c, e] of remaining) {
      pinned.delete(c)
      envRoots.add(c)
      for (const k of e.companions) {
        envRoots.add(k)
      }
      derivedRoots.set(e.output, new Set())
      derivedReach.set(e.output, new Set())
    }
    remaining.clear()
    liveEnv = reach('env', envRoots)
  }
  const extracted: Array<ExtractedExport> = []
  for (const [c, e] of [...remaining].sort(
    ([a], [b]) => clusters[a]!.start - clusters[b]!.start,
  )) {
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
  }
  /** Whether an extracted-export output (evaluated before the env module's body) reaches `c`. */
  function neededByStaticOutput(c: ClusterId): boolean {
    for (const [id, set] of derivedReach) {
      if (set.has(c) && outputs.get(id)?.kind === 'export') {
        return true
      }
    }
    return false
  }
  /**
   * Whether `c` reads, at its evaluation, a non-copyable module binding the
   * env module keeps (live, rooted or pinned there). The env module
   * re-exports an extracted export's module (`export { X } from …`), a
   * static dependency that evaluates with its imports before the env
   * module's body: such a read there would run before the binding's
   * initialisation, a TDZ the user never wrote. A copyable cluster is
   * duplicated into the reading output instead and is no such read.
   */
  function readsKeptEagerly(c: ClusterId): boolean {
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
        if (d === undefined || d === c || clusters[d]!.copyable) {
          continue
        }
        if (liveEnv.has(d) || envRoots.has(d) || clusters[d]!.envPinned) {
          return true
        }
      }
    }
    return false
  }
  /**
   * Whether a derived output that imports from the env module reaches `c`
   * (it cannot be removed). A provider output copies what it reaches (it is
   * the module's own instance in another layer) and keeps nothing in the
   * env module, where its handlers are stubs.
   */
  function derivedNeeds(c: ClusterId): boolean {
    for (const [id, set] of derivedReach) {
      if (set.has(c) && outputs.get(id)?.kind !== 'provider') {
        return true
      }
    }
    return false
  }
  /**
   * An unexported declaration cluster the env module does not keep (yet)
   * whose evaluation time matters (effectful, or an eager reader of state
   * something writes): it moves, is orphaned or becomes an env root.
   */
  function undecided(cl: Cluster): boolean {
    return (
      !liveEnv.has(cl.id) &&
      cl.kind === 'declaration' &&
      !cl.exported &&
      !envRoots.has(cl.id) &&
      (cl.effectful || (writes.length > 0 && readsMutableState(cl.id)))
    )
  }
  /**
   * The effectful clusters that move with their only needer (README,
   * "effects"), computed from the current env liveness: `movableTo` per
   * cluster (one needer, nothing mutates it, it reads nothing mutated or
   * kept-and-impure), then the evaluation-order condition as a greatest
   * fixed point over the moving set: a cluster blocked by a surviving
   * effect that does not move with it to the same output (`effectStays`)
   * stays, which can block others.
   */
  function decideMovable(): void {
    const target = new Map<ClusterId, OutputId>()
    for (const cl of clusters) {
      const to = undecided(cl) ? movableTo(cl) : undefined
      if (to !== undefined) {
        target.set(cl.id, to)
      }
    }
    // an extraction candidate with effects (its augmentations) moves to its
    // output under the same order rule
    for (const [c, e] of remaining) {
      if (clusters[c]!.effectful) {
        target.set(c, e.output)
      }
    }
    for (let dropped = true; dropped; ) {
      dropped = false
      for (const [c, to] of target) {
        if (effectStays(clusters[c]!, to, target)) {
          target.delete(c)
          dropped = true
        }
      }
    }
    movable.clear()
    for (const c of target.keys()) {
      movable.add(c)
    }
  }
  /** The only needer `cl` may move to, if any: one derived output, and no ordered-evaluation constraint. */
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
    // writes it eagerly (its own top-level augmentations, `X.p = …`, travel
    // with it: a binding and its writers are one cluster), and it reads
    // nothing something else writes
    const root = uf.find(cl.regions[0] ?? memberOfGen(cl.gens[0]!))
    if (writes.length > 0) {
      for (const s of cl.declares) {
        for (const w of writesOfSym.get(s) ?? []) {
          if (
            w.live &&
            w.eager &&
            (w.owner === null || uf.find(memberOfWriter(w.owner)) !== root)
          ) {
            return undefined
          }
        }
      }
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
        if (mutatedOutside(ref.sym, ref.range.start, root)) {
          return undefined
        }
        // (c) imports (read lazily: the chunk loads after the route module,
        // whoever else reads them), pure module clusters, or a `const` the
        // env module keeps (evaluated before the chunk loads, which imports
        // that one instance; a `let` still pins, however unwritten)
        if (
          clusters[d]!.kind !== 'import' &&
          !pure(d) &&
          !(liveEnv.has(d) && symbols.isConst(ref.sym))
        ) {
          return undefined
        }
      }
    }
    return needs[0]
  }
  /**
   * Whether a surviving effectful unit (benign ones excepted) that does not
   * move to `to` with `cl` (`target`: the clusters moving, by output) would
   * change order with `cl`'s effects. A lazily imported output (a chunk)
   * evaluates after the env module's body: an effect after `cl`'s first in
   * the source would then run before it. A static output (an extracted
   * export's module, re-exported by the env module) evaluates before the
   * env module's body: an effect before `cl`'s last would then run after
   * it. The static outputs evaluate in source order among themselves (the
   * env module re-exports them in that order), so an effect moving to
   * another static output keeps its order.
   */
  function effectStays(
    cl: Cluster,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
  ): boolean {
    const isStatic = (o: OutputId | undefined) =>
      o !== undefined && outputs.get(o)?.kind === 'export'
    const staticOutput = isStatic(to)
    for (const u of effectsSurviving()) {
      if (
        staticOutput
          ? u.range.start >= cl.lastEffect
          : u.range.start <= cl.firstEffect
      ) {
        continue
      }
      const uc = clusterOfRegion.get(u.region)
      if (uc === cl.id) {
        continue
      }
      const ut = uc === undefined ? undefined : target.get(uc)
      if (ut === to || (staticOutput && isStatic(ut))) {
        continue
      }
      return true
    }
    return false
  }

  // ---- orphans: erased-only clusters the final env liveness does not reach ------
  // (after the extraction decision: a cancelled candidate is an env root again,
  // and what it reads is live, however an erased range also read it)
  for (const c of fromErased) {
    if (!liveEnv.has(c) && !clusters[c]!.envPinned) {
      orphaned.add(c)
    }
  }
  /**
   * Whether an import specifier no output needs stays in the env module, and
   * whether a type unit stays there. Imports follow provenance like
   * declarations: an import the source never read was dead before the
   * transform and stays as written (its module still evaluates there); one
   * our edits orphaned leaves with its readers, and so does one read only by
   * a dead pure cluster we dropped (it would pull a chunk's dependency into
   * the route module). A value import a route module uses only in type
   * positions leaves (TypeScript erases it; the module is not loaded for
   * types); plain modules keep it as written.
   * Type units stay in the env module as written whatever their cluster
   * (`import type { X }` next to a value `X` that moves stays type-only),
   * except the TypeScript-only forms (an inline `type` specifier, an
   * `export { X }` of a type-only binding): they follow the value specifiers
   * of their statement, decided after inclusion.
   */
  function importStays(u: UnitId): boolean {
    const unit = units[u]!
    if (unit.kind === 'type') {
      const inlineImportSpecifier =
        unit.importIndex !== null &&
        (items[unit.item]!.node as { importKind?: string }).importKind !==
          'type'
      const typeOnlyExportSpecifier =
        unit.node.type === 'ExportSpecifier' && unit.node.exportKind !== 'type'
      if (!inlineImportSpecifier && !typeOnlyExportSpecifier) {
        return true
      }
      if (routeModule) {
        // the statement leaves with its value specifiers (an inline `type`
        // specifier alone keeps loading the module under
        // verbatimModuleSyntax); a type-only `export { X }` names nothing at
        // run time
        return false
      }
      if (inlineImportSpecifier) {
        return items[unit.item]!.units.some((sibling) => {
          const su = units[sibling]!
          const c = clusterOfRegion.get(su.region)
          return (
            su.kind !== 'type' && c !== undefined && included.get('env')!.has(c)
          )
        })
      }
      // `export { X }` of a type-only binding: leaves with the inline type
      // import specifiers declaring `X` when they left
      const ref = refs
        .refsIn(unit.range)
        .find((r) => r.kind === 'exportSpecifier')
      const decls =
        ref === undefined ? [] : (t1.declaringUnits.get(ref.sym) ?? [])
      return (
        decls.length === 0 ||
        decls.some((d) => units[d]!.kind !== 'type' || importStays(d))
      )
    }
    const cl = clusters[clusterOfRegion.get(unit.region)!]!
    if (orphaned.has(cl.id)) {
      return false
    }
    if (!routeModule) {
      return true
    }
    return [...cl.declares].every(
      (s) =>
        !generatedReads.has(s) && symbols.binding(s)?.references.length === 0,
    )
  }

  // ---- needers and homes -----------------------------------------------------
  // the derived outputs reaching each cluster (the env module: `liveEnv`)
  const derivedNeeders: Array<Array<OutputId>> = clusters.map(() => [])
  for (const [id, r] of derivedReach) {
    for (const c of r) {
      derivedNeeders[c]!.push(id)
    }
  }
  const home = new Map<ClusterId, Home>()
  const created: Array<OutputDecl> = []
  const sharedByKey = new Map<string, OutputId>()
  const keyOf = (o: OutputId) => outputs.get(o)?.key ?? o
  for (const cl of clusters) {
    const derived = derivedNeeders[cl.id]!
    if (
      deadClusters.has(cl.id) ||
      (orphaned.has(cl.id) && derived.length === 0)
    ) {
      // orphaned by an env erasure and needed by no derived output: gone;
      // still needed by a chunk (an erased option value named it): homed below
      home.set(cl.id, 'removed')
      continue
    }
    if (copied.has(cl.id)) {
      // rooted in its extracted module (a build) or the env module (dev),
      // copied into every chunk that reaches it
      home.set(cl.id, 'duplicate')
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
    if (liveEnv.has(cl.id)) {
      home.set(cl.id, cl.copyable && derived.length > 0 ? 'duplicate' : 'env')
      continue
    }
    if (
      derived.length > 0 &&
      derived.every((o) => outputs.get(o)?.kind === 'provider')
    ) {
      // only the module's own instance in another layer needs it: it lives there
      home.set(cl.id, derived[0]!)
      continue
    }
    if (derived.length === 0) {
      // nobody needs it: a gen unit disappears; an import stays or leaves
      // by `importStays`; a pure unexported declaration that was not
      // rooted (dead code that would pull a chunk's dependency) is dropped;
      // other source stays in the env module (harmless)
      const dead =
        cl.kind === 'gen' ||
        (cl.kind === 'import' && !importStays(cl.units[0]!)) ||
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
    if (derived.some((o) => outputs.get(o)?.kind === 'export')) {
      // a pure cluster an extracted module and a chunk both need is copied
      // into each: a shared module the extracted module imported would be a
      // static dependency of the route module, which no chunk may import
      home.set(cl.id, 'duplicate')
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
  if (process.env.NODE_ENV !== 'production') {
    // an effectful cluster the env module keeps for a derived output is an
    // env root (table rows 4/7): decided in the fixed point above, so that
    // what it reads was live when the moving set was decided
    for (const cl of clusters) {
      if (home.get(cl.id) === 'env' && cl.effectful && !liveEnv.has(cl.id)) {
        throw new Error(
          `placement: effectful cluster ${cl.id} homed in the env module is not live there`,
        )
      }
    }
  }

  // ---- single-writer rule ------------------------------------------------------
  for (const [declRoot, writers] of writerConstraints) {
    const c = clusterOfMember(declRoot)
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
    if (liveEnv.has(c) || writerHomes.has('env')) {
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
    if (h === 'removed') {
      continue
    }
    if (h === 'duplicate') {
      // a copy goes where it is rooted, and follows its direct readers (below): a needer that
      // reaches it only through a cluster it imports from elsewhere does not copy it
      if (envRoots.has(cl.id)) {
        included.get('env')!.add(cl.id)
      }
      for (const o of derivedNeeders[cl.id]!) {
        if (derivedRoots.get(o)?.has(cl.id)) {
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
  // duplicated clusters follow their readers into every output that includes
  // a reader (each round adds a copy somewhere, so the rounds end)
  for (;;) {
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
  // ---- TypeScript-only specifiers: they follow their statement's value specifiers ----
  const droppedTypeUnits = new Set<UnitId>()
  units.forEach((unit, u) => {
    if (unit.kind === 'type' && !importStays(u)) {
      droppedTypeUnits.add(u)
    }
  })
  if (process.env.NODE_ENV !== 'production') {
    // a static output (an extracted export's module) never reads, at its
    // evaluation, a non-copyable binding the env module keeps: the fixed
    // point above roots such readers in the env module (`readsKeptEagerly`)
    for (const [o, decl] of outputs) {
      if (decl.kind !== 'export') {
        continue
      }
      for (const c of included.get(o)!) {
        for (const r of clusters[c]!.regions) {
          for (const ref of ownedRefs.get(r) ?? []) {
            if (
              !ref.eager ||
              !READ_KINDS.has(ref.kind) ||
              !symbols.isModuleLevel(ref.sym) ||
              !isLive(ref, o)
            ) {
              continue
            }
            const d = clusterOfSym.get(ref.sym)
            if (
              d !== undefined &&
              d !== c &&
              !clusters[d]!.copyable &&
              clusters[d]!.kind !== 'import' &&
              home.get(d) === 'env'
            ) {
              throw new Error(
                `placement: cluster ${c} in static output ${o} reads cluster ${d} of the env module at its evaluation`,
              )
            }
          }
        }
      }
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
    home,
    included,
    imports,
    exportsNeeded,
    fallbacks,
    created,
    extracted,
    kept,
    droppedTypeUnits,
  }
}
