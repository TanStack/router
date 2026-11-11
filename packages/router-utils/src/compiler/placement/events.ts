/**
 * Placement, the event table (design 2): one owner of "may this move".
 * An event is one member's evaluation when its module loads; what it
 * touches (the module bindings it reads or assigns, through what it runs:
 * `ReadIndex.runs`, and what its generated text names), its effect (an
 * effect unit the env module keeps), and the writes of the module (the write
 * table, `ClusterGraph.writes`). Every rule that decides whether an
 * evaluation may change its time is asked of it, and each answers with the
 * violated pair (`Pin`): the kind, the other event, the binding.
 *
 * - **V** (volatile): an evaluation that touches a binding something
 *   outside its cluster writes at an unknown time (inside a function, or in
 *   code that runs later) stays in the env module (`volatile`), whatever its
 *   slot: that write may run before or after it anywhere.
 * - **O** (order): two effects keep their order (`orderConflict`), and so do
 *   a read and a write of a binding when the module loads (`writeConflict`),
 *   judged on the slots of both sides: a binding's writers at load are its
 *   cluster, so the write evaluates where the binding does, and a reader is
 *   a cluster of its own (`ordered`: one that a write after it orders has
 *   one slot, N). A lazy output (a chunk) evaluates after the env module's
 *   body: a write after the read in another slot would run before it. An
 *   extracted export's module evaluates before the route module's body when
 *   something imports it through the route file, else with the first chunk
 *   importing it: unordered with the route module and the chunks, so a
 *   write in any of those conflicts with its read, before or after it; only
 *   another extracted module it imports runs before it (its writes before
 *   the read keep their order). An effect never evaluates there (that
 *   module may never evaluate); a write of pure values to a binding is no
 *   effect but a write (R139), ordered against what touches the binding.
 *   An effect reading, at load, another cluster with an effect
 *   (`readConflict`, R29 (c) on both slots, R138) evaluates in that one's
 *   slot (they keep their source order there), or that one stays in the
 *   env module and is a `const` (evaluated before the chunk loads, which
 *   imports that one instance, R67; a `let` still pins, however
 *   unwritten).
 * - **T** (initialised): an extracted module reading, at its evaluation, a
 *   binding the env module keeps would read it before it exists
 *   (`readsKept`).
 * - the lazy-slot rules (`lazyConflict`): written outside its declarations
 *   at load (`written`), then V.
 *
 * What an evaluation runs is the env module's rendering of its text, for
 * every slot: a planner's edit renders in every output, its scoped inserts
 * stand in route options (which stay), and only the core's orphan cleanup
 * erases in the env module what other outputs keep, so a slot's own view
 * would read the same (an invariant of the planners, not checked here).
 * The table is lazy and holds per cluster what no round changes, not its
 * touches (those of every declaration of a call chain would be most of the
 * module each: quadratic memory): one walk, when a rule first asks, gives
 * V's and `ordered`'s pairs, the span of each written binding it touches,
 * and, for an effectful cluster, the effectful clusters it reads
 * (`factsOf`). A module that writes no module binding asks only of
 * effectful clusters and candidates.
 */
import { NEED_KINDS } from './clusters'
import type { ClusterGraph, ClusterId, Write } from './clusters'
import type { ReadIndex } from './reads'
import type { SymbolId } from '../symbols'
import type { RegionId, Unit, UnitId } from '../units'
import type { OutputId } from '../rewrite'
import type { Fallback, Home, KeptReason, PlacementInput } from '../reach'

/** A module binding of another cluster an evaluation touches, and where it runs. */
export interface Touch {
  sym: SymbolId
  at: number
  cluster: ClusterId
}

/** Per written binding an evaluation touches, its first and last touch: they decide every comparison with a write. */
type Spans = ReadonlyMap<SymbolId, { first: number; last: number }>

/**
 * Why a cluster stays in the env module: the violated pair. `reason` is the
 * kind as `Placement.kept` words it; `other` the second event, an effect
 * (`order`) or a write (`written`, `state`: the write the read observes;
 * the first effect or write of the pair); `binding` what the pair shares
 * (`state`, `reads`). A one-event cause (`needers`, `effects`, `live`,
 * `shared`) has neither.
 */
export interface Pin {
  reason: KeptReason
  other?: { unit: UnitId } | { at: number }
  binding?: SymbolId
}

export interface Events {
  /** V: the pair of `c`'s first touch of a binding something outside it writes at an unknown time. */
  volatile: (c: ClusterId) => Pin | undefined
  /** When V holds nothing: the pair of `c`'s first touch of a binding something outside it writes after it when the module loads (O orders `c` against a write: its slot matters). */
  ordered: (c: ClusterId) => Pin | undefined
  /** The rules of a lazy slot after N: `written`, then V. */
  lazyConflict: (c: ClusterId) => Pin | undefined
  /** T: the first non-copyable binding of a cluster `kept` says the env module keeps that `c` reads at its evaluation, if any. */
  readsKept: (
    c: ClusterId,
    kept: (d: ClusterId) => boolean,
  ) => SymbolId | undefined
  /** O: the effect that changes order with `c`'s when `c` evaluates in `to`, the clusters of `target` in theirs. */
  orderConflict: (
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
  ) => Unit | undefined
  /** O: the binding of an effectful cluster `c` reads when `c` evaluates in `to`, which neither evaluates there (in `target`) nor is a `const` `kept` says the env module keeps. */
  readConflict: (
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
    kept: (d: ClusterId) => boolean,
  ) => Pin | undefined
  /** O: the pair of a write at load that changes order with `c`'s read when `c` evaluates in `to`, the writer's cluster in `slot`. */
  writeConflict: (
    c: ClusterId,
    to: OutputId,
    slot: (d: ClusterId) => OutputId,
  ) => Pin | undefined
  /** `ordered-effect`: the regions nested in a unit (a claimed option value) whose evaluation V pins, or whose write at load O orders against what it writes (`home`: the final homes). */
  fallbacks: (
    home: ReadonlyMap<ClusterId, Home>,
    included: ReadonlyMap<OutputId, ReadonlySet<ClusterId>>,
  ) => Array<Fallback>
}

export function eventTable(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
): Events {
  const { t1, outputs, isBenign } = input
  const { units, symbols } = t1
  const { regions } = input.rewrites
  const { clusters, clusterOfRegion, clusterOfSym, writesOfSym } = graph
  /** The regions a claim relocates (an option value a chunk owns). */
  const claimed = new Set<RegionId>()
  for (const claim of input.rewrites.claims.values()) {
    claimed.add(claim.region)
  }

  // (walked, not stored: what one evaluation reaches through calls can be
  // most of the module, for every declaration of a call chain)
  const touchesOfRegion = (
    r: RegionId,
    c: ClusterId,
    visit: (t: Touch) => boolean,
  ): boolean => {
    const stop = reads.runs(r, (ref, at) => {
      if (NEED_KINDS.has(ref.kind) && symbols.isModuleLevel(ref.sym)) {
        const d = clusterOfSym.get(ref.sym)
        if (d !== undefined && d !== c) {
          return visit({ sym: ref.sym, at, cluster: d })
        }
      }
      return false
    })
    if (stop) {
      return true
    }
    // what its generated text names, where that text evaluates at load
    for (const g of reads.generatedNames(r)) {
      if (!symbols.isModuleLevel(g.sym) || t1.isLazyAt(g.at)) {
        continue
      }
      const d = clusterOfSym.get(g.sym)
      if (
        d !== undefined &&
        d !== c &&
        visit({ sym: g.sym, at: g.at, cluster: d })
      ) {
        return true
      }
    }
    return false
  }
  function touches(c: ClusterId, visit: (t: Touch) => boolean): boolean {
    for (const r of clusters[c]!.regions) {
      if (touchesOfRegion(r, c, visit)) {
        return true
      }
    }
    return false
  }

  /** Per binding, the clusters whose evaluation touches it at load (`ownLate`; walked once per binding asked, rarely). */
  const touchersOfSym = new Map<SymbolId, Array<ClusterId>>()
  /**
   * Whether every write of `sym` at an unknown time is `c`'s own: in a
   * function its own text holds (`memo(function Page() { seen.n++ })`,
   * passed to a call or not), which runs only through what `c` evaluates
   * or returns, never before it; and no other evaluation touches `sym` when
   * the module loads. Such a write pins neither a declaration (V) nor an
   * option value (`fallbacks`): one rule for a function passed to a call,
   * wherever it is written (the architect's ruling on the final review's
   * finding 5).
   */
  function ownLate(c: ClusterId, sym: SymbolId): boolean {
    for (const w of writesOfSym.get(sym) ?? []) {
      if (
        w.live &&
        !w.eager &&
        (w.owner === null || clusterOfRegion.get(w.owner) !== c)
      ) {
        return false
      }
    }
    let touchers = touchersOfSym.get(sym)
    if (touchers === undefined) {
      touchers = []
      for (const d of clusters) {
        if (touches(d.id, (t) => t.sym === sym)) {
          touchers.push(d.id)
        }
      }
      touchersOfSym.set(sym, touchers)
    }
    return touchers.every((d) => d === c)
  }

  const statePin = (t: Touch, w: Write): Pin => ({
    reason: 'state',
    other: { at: w.at },
    binding: t.sym,
  })

  /*
   * What no round changes of `c`'s evaluation, walked once per cluster,
   * up to the first touch of a binding written outside it at an unknown
   * time (V, which ends the walk): the first one a write at load after it
   * orders (O's reader);
   * per written binding, its first and last touch; and, for an effectful
   * cluster, the first touch of each binding of another effectful cluster
   * (imports aside: read lazily, the chunk loads after the route module,
   * whoever else reads them), in the order the walk meets them.
   */
  interface Facts {
    late: Pin | null
    later: Pin | null
    spans: Map<SymbolId, { first: number; last: number }>
    reads: Array<Touch>
  }
  const NONE: Facts = { late: null, later: null, spans: new Map(), reads: [] }
  const factsOf: Array<Facts | undefined> = []
  function facts(c: ClusterId): Facts {
    let hit = factsOf[c]
    if (hit !== undefined) {
      return hit
    }
    const written = graph.writes.length > 0
    const effectful = clusters[c]!.effectful
    if (!written && !effectful) {
      return (factsOf[c] = NONE)
    }
    const found: Facts = {
      late: null,
      later: null,
      spans: new Map(),
      reads: [],
    }
    const read = new Set<SymbolId>()
    // (a walk meets one binding many times in a row: the last span is kept)
    let lastSym: SymbolId | -1 = -1
    let lastSpan: { first: number; last: number } | undefined
    touches(c, (t) => {
      if (effectful) {
        const d = clusters[t.cluster]!
        if (d.effectful && d.kind !== 'import' && !read.has(t.sym)) {
          read.add(t.sym)
          found.reads.push(t)
        }
      }
      if (!written) {
        return false
      }
      if (t.sym !== lastSym) {
        if (!writesOfSym.has(t.sym)) {
          return false
        }
        lastSym = t.sym
        lastSpan = found.spans.get(t.sym)
        if (lastSpan === undefined) {
          lastSpan = { first: t.at, last: t.at }
          found.spans.set(t.sym, lastSpan)
        }
      }
      lastSpan!.first = Math.min(lastSpan!.first, t.at)
      lastSpan!.last = Math.max(lastSpan!.last, t.at)
      const w = graph.lateWrite(t.sym, c)
      if (w !== undefined && !ownLate(c, t.sym)) {
        // V ends the walk: such a cluster takes no slot, so nothing asks
        // its reads or the rest of its spans
        found.late = statePin(t, w)
        return true
      }
      if (found.later === null) {
        const l = graph.laterWrite(t.sym, t.at, c)
        if (l !== undefined) {
          found.later = statePin(t, l)
        }
      }
      return false
    })
    factsOf[c] = hit = found
    return hit
  }
  const volatile = (c: ClusterId): Pin | undefined => facts(c).late ?? undefined
  const ordered = (c: ClusterId): Pin | undefined =>
    facts(c).late === null ? (facts(c).later ?? undefined) : undefined
  const spans = (c: ClusterId): Spans => facts(c).spans

  function lazyConflict(c: ClusterId): Pin | undefined {
    const cl = clusters[c]!
    // written: nothing outside the cluster writes it eagerly (its own
    // top-level augmentations, `X.p = …`, travel with it: a binding and its
    // writers are one cluster)
    if (graph.writes.length > 0) {
      for (const s of cl.declares) {
        for (const w of writesOfSym.get(s) ?? []) {
          if (
            w.live &&
            w.eager &&
            (w.owner === null || clusterOfRegion.get(w.owner) !== c)
          ) {
            return { reason: 'written', other: { at: w.at } }
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
      return { reason: 'written', other: { at: unit.range.start } }
    }
    return volatile(c)
  }

  function readConflict(
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
    kept: (d: ClusterId) => boolean,
  ): Pin | undefined {
    if (!clusters[c]!.effectful) {
      return undefined
    }
    // the other side is effectful too, so its slot is exact: in `target`
    // (by N its only needer, which then is `c`'s), or demoted, or kept by
    // the env module already; never a shared module homes pick later (a
    // chunk and the shared module it imports are two modules)
    for (const t of facts(c).reads) {
      const there = target.get(t.cluster)
      if (
        there !== to &&
        (there !== undefined || !kept(t.cluster) || !symbols.isConst(t.sym))
      ) {
        return { reason: 'reads', binding: t.sym }
      }
    }
    return undefined
  }

  function readsKept(
    c: ClusterId,
    kept: (d: ClusterId) => boolean,
  ): SymbolId | undefined {
    let found: SymbolId | undefined
    touches(c, (t) => {
      if (!clusters[t.cluster]!.copyable && kept(t.cluster)) {
        found = t.sym
        return true
      }
      return false
    })
    return found
  }

  // the effects of the env module's evaluation an event is ordered against
  // (asked only when one could move: most modules never need the benign
  // check). Module loading is hoisted: a bare import or a re-export
  // evaluates before the module body wherever it is written, so it is never
  // an effect before or after one.
  let effectList: Array<Unit> | null = null
  const effects = (): Array<Unit> =>
    (effectList ??= units.filter(
      (u) =>
        graph.effectUnits.has(u.id) &&
        u.kind !== 'type' &&
        u.kind !== 'import-effect' &&
        u.kind !== 'reexport' &&
        graph.unitSurvives(u.id) &&
        !isBenign(u.id),
    ))
  const isStatic = (o: OutputId | undefined) =>
    o !== undefined && outputs.get(o)?.kind === 'export'

  /*
   * O. A lazily imported output (a chunk) evaluates after the env module's
   * body: an effect after `c`'s first in the source would then run before
   * it. An effect never moves to an extracted export's module (`slotFor`:
   * that module may never evaluate).
   *
   * Kept on purpose (a maintainers' decision): without this guarantee a
   * declaration only split code reads whose initialiser calls a function
   * the compiler does not know would move to the chunk as the previous
   * splitter moved it, which saves the initial load such calls keep (four
   * real apps load about 175 KB more than before, mostly generated data
   * and zod schemas), but two effects sharing state the compiler cannot see
   * (a library's store, registry or configuration) would silently run in
   * another order. Calls known to be pure are no effect (`pureCalls`).
   */
  function orderConflict(
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
  ): Unit | undefined {
    const cl = clusters[c]!
    for (const u of effects()) {
      if (u.range.start <= cl.firstEffect) {
        continue
      }
      const uc = clusterOfRegion.get(u.region)
      if (uc === c || (uc !== undefined && target.get(uc) === to)) {
        continue
      }
      return u
    }
    return undefined
  }

  function writeConflict(
    c: ClusterId,
    to: OutputId,
    slot: (d: ClusterId) => OutputId,
  ): Pin | undefined {
    if (graph.writes.length === 0) {
      return undefined
    }
    const staticOutput = isStatic(to)
    // (one scan of a binding's writes per binding, not per touch)
    for (const [sym, { first, last }] of spans(c)) {
      if (!staticOutput && graph.laterWrite(sym, first, c) === undefined) {
        continue
      }
      for (const w of writesOfSym.get(sym)!) {
        if (!w.live || !w.eager) {
          continue
        }
        const wc = w.owner === null ? undefined : clusterOfRegion.get(w.owner)
        if (wc === c) {
          continue
        }
        const ws = wc === undefined ? 'env' : slot(wc)
        if (ws === to) {
          continue
        }
        if (first < w.at || (staticOutput && last >= w.at && !isStatic(ws))) {
          return { reason: 'state', other: { at: w.at }, binding: sym }
        }
      }
    }
    return undefined
  }

  function fallbacks(
    home: ReadonlyMap<ClusterId, Home>,
    included: ReadonlyMap<OutputId, ReadonlySet<ClusterId>>,
  ): Array<Fallback> {
    const out: Array<Fallback> = []
    if (graph.writes.length === 0) {
      return out
    }
    // O on its writes: a write at load by the value (an assignment or a
    // member write its evaluation runs; the write's owner is the claimed
    // region holding it) evaluates with the value (its owner's output, after
    // that output's own code), and a reader of the binding evaluates where
    // the binding does, at load or later. So the value stays in place unless
    // the binding evaluates in the same output and nothing else, in any
    // output, reads it at load: the single-writer rule homes a binding with
    // its writer whoever reads it, so a reader in a module two chunks share
    // would import it from the value's chunk, which imports that module.
    // An import has an instance per output but names one object: the value
    // stays unless no other output includes the import and nothing else
    // reads it at load, as `const y = f(registry.page = 1)` stays with its
    // import.
    /**
     * Why binding `sym`, written by the value of cluster `rc` (homed in
     * `hr`), is not confined to that output: another evaluation anywhere
     * touches it (`used`), or it evaluates elsewhere (`kept`; an import:
     * another output includes it); null when it is confined. A binding with
     * no home of its own (removed, duplicated) is.
     */
    const unconfined = (
      rc: ClusterId,
      hr: Home,
      sym: SymbolId,
    ): 'used' | 'kept' | null => {
      const bc = clusterOfSym.get(sym)
      if (bc === undefined) {
        return 'kept'
      }
      const hb = home.get(bc)
      if (
        clusters[bc]!.kind !== 'import' &&
        (hb === undefined || hb === 'duplicate' || hb === 'removed')
      ) {
        return null
      }
      for (const d of clusters) {
        const hd = home.get(d.id)
        if (
          d.id !== rc &&
          hd !== undefined &&
          hd !== 'removed' &&
          touches(d.id, (t) => t.sym === sym)
        ) {
          return 'used'
        }
      }
      if (clusters[bc]!.kind === 'import') {
        for (const [o, set] of included) {
          if (o !== hr && set.has(bc)) {
            return 'kept'
          }
        }
        return null
      }
      return hb === hr ? null : 'kept'
    }
    const writtenAt = new Map<
      RegionId,
      { sym: SymbolId; why: 'used' | 'kept' }
    >()
    for (const w of graph.writes) {
      const r = w.owner
      if (!w.live || !w.eager || r === null || !claimed.has(r)) {
        continue
      }
      if (!clusterOfSym.has(w.sym) || writtenAt.has(r)) {
        continue
      }
      const rc = clusterOfRegion.get(r)!
      const hr = home.get(rc)
      if (hr === 'env' || hr === undefined) {
        continue // in place: everything evaluates in source order
      }
      const why = unconfined(rc, hr, w.sym)
      if (why !== null) {
        writtenAt.set(r, { sym: w.sym, why })
      }
    }
    for (const r of regions.regions) {
      if (r.unit !== null) {
        continue
      }
      const written = writtenAt.get(r.id)
      if (written !== undefined) {
        out.push({
          region: r.id,
          reason: 'ordered-effect',
          binding: written.sym,
          writes: written.why,
        })
        continue
      }
      const c = clusterOfRegion.get(r.id)!
      const h = home.get(c)
      const hr = h === 'env' || h === undefined ? null : (h as OutputId)
      /**
       * V's writes of `sym` (`lateWrite`): whether one evaluates outside
       * the value's output, else whether they all evaluate in it (the
       * value's own text, or a function only that output holds: run by
       * code there alone), which is then judged as a write by the value.
       */
      const lateOf = (sym: SymbolId): 'outside' | 'inside' | null => {
        if (graph.lateWrite(sym, c) === undefined) {
          return null
        }
        for (const w of writesOfSym.get(sym)!) {
          if (!w.live || w.eager) {
            continue
          }
          const wc = w.owner === null ? undefined : clusterOfRegion.get(w.owner)
          if (wc === c && !w.passed) {
            continue // its own, not run when it evaluates
          }
          if (hr === null || wc === undefined || home.get(wc) !== hr) {
            return 'outside'
          }
        }
        return 'inside'
      }
      // V, and a write after it (as if what it touches stays: the planner
      // decides its slot). Not judged on both slots: a relocated value
      // evaluates after its chunk's own code, so in one chunk with what it
      // touches a write after it in the source would run before it
      // (`component: wrap(Page)`, then `Page.displayName = 'P'`). A write
      // at an unknown time that only the value's output runs
      // (`memo(function Page() { didInit = true })`) pins it only when the
      // binding is not confined there, as a write at load by the value.
      touchesOfRegion(r.id, c, (t) => {
        if (!writesOfSym.has(t.sym)) {
          return false
        }
        const late = lateOf(t.sym)
        const later = graph.laterWrite(t.sym, t.at, c) !== undefined
        const why =
          late === 'inside' && !ownLate(c, t.sym)
            ? unconfined(c, hr!, t.sym)
            : null
        if ((late === null || (late === 'inside' && why === null)) && !later) {
          return false
        }
        out.push({
          region: r.id,
          reason: 'ordered-effect',
          binding: t.sym,
          ...(why !== null && !later && { writes: why }),
        })
        return true
      })
    }
    return out
  }

  return {
    volatile,
    ordered,
    lazyConflict,
    readsKept,
    readConflict,
    orderConflict,
    writeConflict,
    fallbacks,
  }
}
