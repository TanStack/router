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
 *   outside its cluster writes later, or at an unknown time (inside a
 *   function), stays in the env module (`volatile`), whatever its slot.
 * - **O** (order): two effects keep their order (`orderConflict`). A lazy
 *   output (a chunk) evaluates after the env module's body; an extracted
 *   export's module before it, the extracted modules in source order among
 *   themselves (for effects; design 2 step 4 revisits that time).
 * - **T** (initialised): an extracted module reading, at its evaluation, a
 *   binding the env module keeps would read it before it exists
 *   (`readsKept`).
 * - the lazy-slot pair rules (`lazyConflict`): written outside its
 *   declarations at load (`written`), V, and rule (c) of R29/R67 (it reads
 *   an effectful or `let` binding the env module keeps, `reads`), in the
 *   order the walk meets them. A binding conflict is judged as if the other
 *   side stays (design 2 step 5 judges both slots).
 *
 * What an evaluation runs is the env module's rendering of its text, for
 * every slot: a planner's edit renders in every output, its scoped inserts
 * stand in route options (which stay), and only the core's orphan cleanup
 * erases in the env module what other outputs keep, so a slot's own view
 * would read the same (an invariant of the planners, not checked here).
 * The table is lazy and holds verdicts, not touches: a rule walks what an
 * evaluation touches when it asks, stopping at the first violation (the
 * touches of every declaration of a call chain would be most of the module
 * each: quadratic memory), and V, which no round changes, is walked once
 * per cluster. A module that writes no module binding asks only of
 * effectful clusters and candidates.
 */
import { invariantViolated } from '../self-checks'
import { NEED_KINDS, clusterRange, describeCluster, namesOf } from './clusters'
import type { ClusterGraph, ClusterId, Write } from './clusters'
import type { ReadIndex } from './reads'
import type { InvariantViolation } from '../self-checks'
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
  /** Walks what cluster `c`'s evaluation touches, in the order the walk meets it; true from `visit` ends the walk (the result). */
  touches: (c: ClusterId, visit: (t: Touch) => boolean) => boolean
  /** V: the pair of `c`'s first touch of a binding something outside it writes then. */
  volatile: (c: ClusterId) => Pin | undefined
  /** The pair rules of a lazy slot after N: `written`, then V and rule (c) as the walk meets them (`liveEnv`: what the env module keeps). */
  lazyConflict: (
    c: ClusterId,
    liveEnv: ReadonlySet<ClusterId>,
  ) => Pin | undefined
  /** T: whether `c` reads, at its evaluation, a non-copyable binding of a cluster `kept` says the env module keeps. */
  readsKept: (c: ClusterId, kept: (d: ClusterId) => boolean) => boolean
  /** O: the effect that changes order with `c`'s when `c` evaluates in `to`, the clusters of `target` in theirs. */
  orderConflict: (
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
  ) => Unit | undefined
  /** `ordered-effect`: the regions nested in a unit (a claimed option value) whose evaluation V pins. */
  fallbacks: () => Array<Fallback>
  /** The effects O orders, in source order: surviving effect units, benign framework calls aside. */
  effects: () => ReadonlyArray<Unit>
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

  /** The write `t`, run by cluster `by`, observes (V's pair), if any. */
  const observed = (t: Touch, by: ClusterId): Write | undefined =>
    writesOfSym.has(t.sym) ? graph.observedWrite(t.sym, t.at, by) : undefined
  const statePin = (t: Touch, w: Write): Pin => ({
    reason: 'state',
    other: { at: w.at },
    binding: t.sym,
  })

  const volatileOf: Array<Pin | null | undefined> = []
  function volatile(c: ClusterId): Pin | undefined {
    let hit = volatileOf[c]
    if (hit === undefined) {
      let pin: Pin | null = null
      if (graph.writes.length > 0) {
        touches(c, (t) => {
          const w = observed(t, c)
          if (w !== undefined) {
            pin = statePin(t, w)
          }
          return pin !== null
        })
      }
      volatileOf[c] = hit = pin
    }
    return hit ?? undefined
  }

  function lazyConflict(
    c: ClusterId,
    liveEnv: ReadonlySet<ClusterId>,
  ): Pin | undefined {
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
    // what it touches when it evaluates: V, then rule (c): imports (read
    // lazily: the chunk loads after the route module, whoever else reads
    // them), pure module clusters, or a `const` the env module keeps
    // (evaluated before the chunk loads, which imports that one instance; a
    // `let` still pins, however unwritten)
    let pin: Pin | undefined
    touches(c, (t) => {
      const w = observed(t, c)
      if (w !== undefined) {
        pin = statePin(t, w)
        return true
      }
      const d = clusters[t.cluster]!
      if (
        d.kind !== 'import' &&
        d.effectful &&
        !(liveEnv.has(d.id) && symbols.isConst(t.sym))
      ) {
        pin = { reason: 'reads', binding: t.sym }
        return true
      }
      return false
    })
    return pin
  }

  function readsKept(c: ClusterId, kept: (d: ClusterId) => boolean): boolean {
    return touches(c, (t) => !clusters[t.cluster]!.copyable && kept(t.cluster))
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
        u.effectful &&
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
   * it. A static output (an extracted export's module, re-exported by the
   * env module) evaluates before the env module's body: an effect before
   * `c`'s last would then run after it. The static outputs evaluate in
   * source order among themselves (the env module re-exports them in that
   * order), so an effect moving to another static output keeps its order.
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
    const staticOutput = isStatic(to)
    for (const u of effects()) {
      if (
        staticOutput
          ? u.range.start >= cl.lastEffect
          : u.range.start <= cl.firstEffect
      ) {
        continue
      }
      const uc = clusterOfRegion.get(u.region)
      if (uc === c) {
        continue
      }
      const ut = uc === undefined ? undefined : target.get(uc)
      if (ut === to || (staticOutput && isStatic(ut))) {
        continue
      }
      return u
    }
    return undefined
  }

  function fallbacks(): Array<Fallback> {
    const out: Array<Fallback> = []
    if (graph.writes.length === 0) {
      return out
    }
    for (const r of regions.regions) {
      if (r.unit !== null) {
        continue
      }
      const c = clusterOfRegion.get(r.id)!
      touchesOfRegion(r.id, c, (t) => {
        if (observed(t, c) === undefined) {
          return false
        }
        out.push({ region: r.id, reason: 'ordered-effect', binding: t.sym })
        return true
      })
    }
    return out
  }

  return {
    touches,
    volatile,
    lazyConflict,
    readsKept,
    orderConflict,
    fallbacks,
    effects,
  }
}

/**
 * The placement's own check of design 2's P2 and P3 over the final homes,
 * under the time model above (R116: it throws in our test runs, warns
 * elsewhere): the effects evaluate in source order; an evaluation outside
 * the env module observes no write it did not observe in the source (a
 * write outside its cluster at an unknown time, P3, or an eager one now on
 * the other side of it); an extracted module reads, at its evaluation,
 * nothing the env module keeps (T); an effect the env module holds is one
 * it evaluates (an env root, so that what it reads stayed). It exists to
 * catch compiler bugs and can go once we trust the compiler's
 * exhaustiveness.
 */
export function checkPlacement(
  input: PlacementInput,
  graph: ClusterGraph,
  events: Events,
  home: ReadonlyMap<ClusterId, Home>,
  included: ReadonlyMap<OutputId, ReadonlySet<ClusterId>>,
  liveEnv: ReadonlySet<ClusterId>,
): InvariantViolation | undefined {
  const { outputs } = input
  const { clusters, clusterOfRegion, writesOfSym } = graph
  const kindOf = (o: OutputId) => outputs.get(o)?.kind
  /** Where cluster `c` evaluates: 0 before the env module's body (an extracted module), 1 in it, 2 after it (a chunk); null when outside this model (removed, copied, another instance). */
  const timeOf = (c: ClusterId): 0 | 1 | 2 | null => {
    const h = home.get(c)
    if (h === undefined || h === 'removed' || h === 'duplicate') {
      return null
    }
    if (h === 'env') {
      return 1
    }
    const kind = kindOf(h)
    return kind === 'export'
      ? 0
      : kind === 'split' || kind === 'hydrate' || kind === 'shared'
        ? 2
        : null
  }
  const fail = (effect: string, detail: string, c: ClusterId, at?: number) =>
    invariantViolated({
      effect,
      detail: `placement: ${describeCluster(input, clusters[c]!)} ${detail}`,
      range:
        at === undefined
          ? clusterRange(input, clusters[c]!)
          : { start: at, end: at },
    })

  // an effect the env module holds is one it evaluates; whether any effect
  // left it
  let moved = false
  for (const cl of clusters) {
    if (!cl.effectful) {
      continue
    }
    const t = timeOf(cl.id)
    if (t === 1 && !liveEnv.has(cl.id)) {
      return fail(
        'code with side effects may read a value that was moved out of the module or removed',
        'has effects, is homed in the env module and is not live there',
        cl.id,
      )
    }
    // (an effectful generated unit is compiler code, not an effect O orders)
    moved ||= t !== 1 && t !== null && cl.firstEffect !== Infinity
  }
  // the effects in source order: an extracted module's before the body's,
  // the body's before a chunk's, one chunk's at most
  if (moved) {
    let latest = 0
    let lazy: OutputId | null = null
    for (const u of events.effects()) {
      const c = clusterOfRegion.get(u.region)!
      const t = timeOf(c)
      if (t === null) {
        continue
      }
      const h = home.get(c) as OutputId
      if (t < latest || (t === 2 && lazy !== null && lazy !== h)) {
        return fail(
          'side effects may run in another order than written',
          `has an effect (at ${u.range.start}) that evaluates in ${h}, after an effect written after it`,
          c,
          u.range.start,
        )
      }
      latest = t
      if (t === 2) {
        lazy = h
      }
    }
  }

  // what an evaluation outside the env module touches
  let found: InvariantViolation | undefined
  for (const cl of graph.writes.length > 0 ? clusters : []) {
    const t = timeOf(cl.id)
    if (t === null || t === 1 || cl.kind === 'import') {
      continue
    }
    const own = home.get(cl.id)
    events.touches(cl.id, (touch) => {
      for (const w of writesOfSym.get(touch.sym) ?? []) {
        const wc = w.owner === null ? undefined : clusterOfRegion.get(w.owner)
        if (!w.live || wc === cl.id) {
          continue
        }
        const wt = wc === undefined ? 1 : timeOf(wc)
        // two chunks are unordered; an extracted module and a chunk see the
        // route module's body on either side of them
        const apart =
          wt === t && t === 2 && wc !== undefined && home.get(wc) !== own
        const misordered = !w.eager
          ? true
          : wt === null
            ? false
            : w.at > touch.at
              ? wt < t || apart
              : wt > t || apart
        if (misordered) {
          found = fail(
            `${namesOf(input, cl) ?? 'a value'} may read a binding at another time than written`,
            `evaluates outside the env module and touches ${input.t1.symbols.name(touch.sym)} (at ${touch.at}), written at ${w.at}${w.eager ? '' : ' at an unknown time'}`,
            cl.id,
            touch.at,
          )
          return true
        }
      }
      return false
    })
    if (found !== undefined) {
      return found
    }
  }
  // T: an extracted module reads nothing of the env module at its evaluation
  for (const [o, set] of included) {
    if (kindOf(o) !== 'export') {
      continue
    }
    for (const c of set) {
      events.touches(c, (touch) => {
        const d = clusters[touch.cluster]!
        if (d.copyable || d.kind === 'import' || home.get(d.id) !== 'env') {
          return false
        }
        found = fail(
          `a split module may read ${namesOf(input, d) ?? 'a value'} before it exists`,
          `in static output ${o} reads ${describeCluster(input, d)} of the env module at its evaluation`,
          c,
          touch.at,
        )
        return true
      })
      if (found !== undefined) {
        return found
      }
    }
  }
  return undefined
}
