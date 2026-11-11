/**
 * Placement, stage 1: the clusters. Units, the regions planners registered
 * and generated units are joined into the clusters placement moves as one:
 * the declarations of a symbol, a claimed region and the generated unit
 * owning it, a binding and its writers at load (a unit assigning it or
 * writing a member of it, an augmentation). A reader of a written binding
 * is a cluster of its own, which the event table orders against the writes
 * (`events.ts`). Also the module's write table and the two halves of the
 * mutation model every later rule asks (`lateWrite`, `laterWrite`).
 */
import { observesIdentity } from '../analysis'
import { writeKind } from '../mutation'
import type { ClassifiedRef, Tier1 } from '../analysis'
import type { SymbolId } from '../symbols'
import type { Range } from '../header'
import type { RegionId, Unit, UnitId } from '../units'
import type {
  Frag,
  GenFrag,
  GenUnitId,
  GeneratedUnit,
  OutputId,
  OutputView,
} from '../rewrite'
import type { PlacementInput } from '../reach'

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
  /**
   * Every declaration of the cluster is a function or a primitive and
   * nothing else is in it (no augmentation, no generated unit): a copy of
   * the cluster has no identity of its own to observe (`isDuplicable`).
   */
  identityFree: boolean
  envPinned: boolean
}

/**
 * A write of a module binding. The module's mutation model (`t1.mutation`:
 * every assignment of a binding and every write of a member of one, eager
 * or lazy) restricted to module-level bindings, with what placement adds:
 * `live` (not inside a range the env module erases), `augment` (a
 * top-level augmentation unit, `X.p = …`, `X.push(…)`, `X = …` as a
 * statement: its `owner` is the unit's region). Every rule that asks what
 * writes a binding reads this table: clustering (a binding's writers at load
 * join it), the lazy slot's "nothing outside writes it", the single-writer
 * rule, and the two halves of the mutation model behind the event table's
 * rules (`events.ts`): a write at an unknown time (`lateWrite`, V) and one
 * after a read when the module loads (`laterWrite`, O).
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
  /** What an output renders of the source (`OutputView`). */
  viewOf: (o: OutputId) => OutputView
  /** Whether a reference renders in output `o` (it is not inside text `o` erases). */
  isLive: (ref: ClassifiedRef, o: OutputId) => boolean
  /** Whether a unit survives in the env module (its statement is not erased there). */
  unitSurvives: (u: UnitId) => boolean
  /**
   * The late half of the mutation model (V): a live write of `sym` by
   * another cluster than `by` at an unknown time (inside a function, or in
   * code evaluated with the module that runs later): it may run before or
   * after any evaluation, wherever that evaluation is.
   */
  lateWrite: (sym: SymbolId, by: ClusterId) => Write | undefined
  /**
   * The eager half (O): a live write of `sym` by another cluster than `by`
   * when the module loads, after a read evaluated at `readAt`. Whether it
   * changes order with the read depends on where both evaluate (the event
   * table's `writeConflict`); a write by the reading cluster travels with it.
   */
  laterWrite: (
    sym: SymbolId,
    readAt: number,
    by: ClusterId,
  ) => Write | undefined
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

/** A cluster as a person knows it: the bindings it declares and where (the invariants' internal details). */
export function describeCluster(input: PlacementInput, cl: Cluster): string {
  const line = input.code.slice(0, cl.start).split('\n').length
  return `${namesOf(input, cl) ?? 'the statement'} (${input.canonicalId}:${line})`
}

/** The bindings a cluster declares, `` `a`, `b` `` (an invariant warning's words); none for a statement. */
export function namesOf(input: PlacementInput, cl: Cluster): string | null {
  const names = [...cl.declares].map((s) => `\`${input.t1.symbols.name(s)}\``)
  return names.length > 0 ? names.join(', ') : null
}

/** Where a cluster starts in the source (an invariant warning's position); none for generated code alone. */
export function clusterRange(
  input: PlacementInput,
  cl: Cluster,
): { start: number; end: number } | undefined {
  const r = cl.regions[0]
  return r === undefined ? undefined : input.rewrites.regions.get(r).range
}

/**
 * Whether an output may hold its own copy of the cluster without anyone
 * noticing: its declarations are functions or primitives (`identityFree`),
 * pure, nothing writes them and nothing observes their identity (`new`,
 * `instanceof`, `===`, `.prototype`; `live`: in code an output keeps). An
 * object, array, class, call result or regex has an identity (`instanceof`,
 * a sentinel, a context, a registry); a function used as a constructor or
 * a sentinel has one too; a written binding is state. Either exists once:
 * in the env module, or in one derived output. The one predicate behind
 * the copy of an extracted export, the duplicate home and placement's
 * self-check. A primitive constant (`copyable`) has nothing to observe.
 */
export function isDuplicable(
  cl: Cluster,
  t1: Pick<Tier1, 'mutation' | 'refs'>,
  live?: (ref: ClassifiedRef) => boolean,
): boolean {
  if (cl.copyable) {
    return true
  }
  if (!cl.identityFree || cl.effectful) {
    return false
  }
  for (const s of cl.declares) {
    if (t1.mutation.isMutated(s, live)) {
      return false
    }
    for (const r of t1.refs.refsOf(s)) {
      if (observesIdentity(r) && (live === undefined || live(r))) {
        return false
      }
    }
  }
  return true
}

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

/** A generated unit that only imports: no text, no declaration, no effect. */
const importsOnly = (g: GeneratedUnit): boolean =>
  g.body.length === 0 &&
  g.declares.length === 0 &&
  !g.effectful &&
  (g.imports?.length ?? 0) > 0

export function buildClusters(input: PlacementInput): ClusterGraph {
  const { t1, rewrites } = input
  const { units, refs, items } = t1
  const { regions } = rewrites
  const regionCount = regions.regions.length
  const gens = rewrites.generated
  // union-find members: regions by id, then generated units
  const memberOfGen = (g: GenUnitId) => regionCount + g
  const uf = new UnionFind(regionCount + gens.length)

  const viewOf = (o: OutputId): OutputView => rewrites.view(o)
  const envView = viewOf('env')
  const isLive = (ref: ClassifiedRef, o: OutputId) =>
    !viewOf(o).isErasedAt(ref.range.start)
  /**
   * Whether a statement stays: an edit that starts with it may keep the rest
   * (`createIsomorphicFn().server(f)()` keeps `f` and the call), and only an
   * edit that leaves nothing of it but its `;` removes it.
   */
  const statementSurvives = ({ start, end }: Range): boolean =>
    !envView.isErasedAt(start) ||
    !envView.isErasedRange({
      start,
      end: input.code.charCodeAt(end - 1) === 59 ? end - 1 : end,
    })
  const unitSurvives = (u: UnitId): boolean => {
    const unit = units[u]!
    const item = items[unit.item]!
    return unit.range.start === item.range.start
      ? statementSurvives(item.nodeRange)
      : !envView.isErasedAt(unit.range.start)
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
      // (code evaluated with the module that runs later, `runsLaterAt`:
      // its write has not happened where it is written)
      eager: ref.eager && !t1.runsLaterAt(ref.range.start),
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
    const live = !envView.isErasedAt(items[u.item]!.nodeRange.start)
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

  // per written binding, what lets the mutation predicate answer "none"
  // without a scan: whether a live write runs at an unknown time, and where
  // its last live eager write is (a registry filled by n statements and read
  // by n declarations asks it n² times)
  const lateWritten = new Set<SymbolId>()
  const lastEagerWrite = new Map<SymbolId, number>()
  for (const w of writes) {
    if (!w.live) {
      continue
    }
    if (!w.eager) {
      lateWritten.add(w.sym)
    } else if (w.at > (lastEagerWrite.get(w.sym) ?? -1)) {
      lastEagerWrite.set(w.sym, w.at)
    }
  }

  // ---- a binding's writers at load join its cluster -----------------------
  // A live top-level writer (a unit assigning it, or writing a member of it
  // when the module loads: `const y = f(cfg.x = 1)`) and an augmentation
  // travel with the binding, so whoever evaluates the binding evaluates its
  // writes in source order. A unit that writes a member only inside a
  // function (`function set() { cfg.v = 1 }`) is a late writer, not joined
  // (V orders it); a sub-region assigning it is the single-writer rule's.
  const writersOfMember = new Map<number, Set<RegionId>>() // declaring member → writer sub-regions
  const regionWrittenSyms = new Set<SymbolId>()
  for (const w of writes) {
    const d = declMember.get(w.sym)
    if (!w.live || d === undefined || w.owner === null) {
      continue
    }
    const unitOwner = regions.get(w.owner).kind === 'unit'
    if (w.member) {
      if (w.eager && unitOwner) {
        uf.union(w.owner, d)
      }
    } else if (w.augment || unitOwner) {
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
        identityFree: false,
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
      if (u.effectful && statementSurvives(items[u.item]!.nodeRange)) {
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
      (cl.kind === 'import' && cl.units.length === 0) ||
      (cl.units.length === 1 &&
        cl.gens.length === 0 &&
        (units[cl.units[0]!]!.copyable ||
          units[cl.units[0]!]!.kind === 'import-specifier'))
    cl.identityFree =
      cl.kind === 'declaration' &&
      cl.gens.length === 0 &&
      cl.units.every((u) => {
        const unit = units[u]!
        return unit.kind === 'declaration'
          ? unit.identityFree
          : unit.kind === 'type'
      })
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

  // ---- the mutation predicates -------------------------------------------
  // (a claimed region is in its owner's cluster: a write there is the owner's)
  const byOther = (w: Write, by: ClusterId) =>
    w.owner === null || clusterOfRegion.get(w.owner) !== by
  const lateWrite = (sym: SymbolId, by: ClusterId): Write | undefined => {
    if (!lateWritten.has(sym)) {
      return undefined
    }
    for (const w of writesOfSym.get(sym)!) {
      if (w.live && !w.eager && byOther(w, by)) {
        return w
      }
    }
    return undefined
  }
  const laterWrite = (
    sym: SymbolId,
    readAt: number,
    by: ClusterId,
  ): Write | undefined => {
    if ((lastEagerWrite.get(sym) ?? -1) <= readAt) {
      return undefined
    }
    for (const w of writesOfSym.get(sym)!) {
      if (w.live && w.eager && w.at > readAt && byOther(w, by)) {
        return w
      }
    }
    return undefined
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
    viewOf,
    isLive,
    unitSurvives,
    lateWrite,
    laterWrite,
  }
}
