/**
 * Placement, stage 4: what the env module keeps (README.md, "effects and
 * mutable state"). The env roots, the clusters that move with their only
 * needer (the movable test) and the extracted exports are one monotone
 * fixed point over the final placement; nothing is rooted after it.
 */
import { READ_KINDS, isDuplicable } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Candidate, Seeds } from './roots'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { Unit, UnitId } from '../units'
import type { OutputId } from '../rewrite'
import type { ExtractedExport, KeptReason, PlacementInput } from '../reach'

/** Why the movable test leaves an undecided cluster in the env module (the cause `kept` reports). */
export interface Pin {
  reason: KeptReason
  effect?: UnitId
  at?: number
  read?: SymbolId
}

/** The settled roots; the seed sets (env roots, pins, derived roots) grown to the fixed point. */
export interface Roots {
  envRoots: Set<ClusterId>
  /** What the env module evaluates: the reach of its roots. */
  liveEnv: Set<ClusterId>
  pinned: Map<ClusterId, OutputId>
  derivedRoots: Map<OutputId, Set<ClusterId>>
  derivedReach: Map<OutputId, Set<ClusterId>>
  /** The candidates still extracted. */
  remaining: Map<ClusterId, Candidate>
  /** Why each cancelled candidate stays in the env module (`live`, `reads`, `order`), taken when it was cancelled. */
  cancelled: Map<ClusterId, Pin>
  /** The extracted candidates a chunk copies instead of importing their module. */
  copied: Set<ClusterId>
  /** The undecided clusters that move with their only needer. */
  movable: Set<ClusterId>
  /** Why each undecided cluster that does not move stays. */
  pins: Map<ClusterId, Pin>
  /** The undecided clusters a derived output needs that became env roots, with the cause. */
  pinnedNeeded: Map<ClusterId, Pin>
}

/**
 * Whether a derived output that imports from the env module reaches `c`
 * (it cannot be removed). A provider output copies what it reaches (it is
 * the module's own instance in another layer) and keeps nothing in the
 * env module, where its handlers are stubs.
 */
export function derivedNeeds(
  input: PlacementInput,
  derivedReach: ReadonlyMap<OutputId, ReadonlySet<ClusterId>>,
  c: ClusterId,
): boolean {
  for (const [id, set] of derivedReach) {
    if (set.has(c) && input.outputs.get(id)?.kind !== 'provider') {
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
 * initialisation, a TDZ the user never wrote. A read inside a function the
 * evaluation calls (`const config = build()`) happens then too
 * (`graph.atLoad`). A copyable cluster is duplicated into the reading
 * output instead and is no such read.
 */
export function readsKeptEagerly(
  input: PlacementInput,
  graph: ClusterGraph,
  roots: Pick<Roots, 'liveEnv' | 'envRoots'>,
  c: ClusterId,
): boolean {
  const { symbols } = input.t1
  const { clusters, clusterOfSym } = graph
  const kept = (d: ClusterId) =>
    roots.liveEnv.has(d) || roots.envRoots.has(d) || clusters[d]!.envPinned
  // the reads of `c`'s own text that run at load, then those of every
  // module-level function (or class) such a read calls, transitively
  const seen = new Set<ClusterId>([c])
  const work: Array<ClusterId> = [c]
  while (work.length > 0) {
    const from = work.pop()!
    for (const r of clusters[from]!.regions) {
      for (const ref of graph.ownedRefs.get(r) ?? []) {
        if (
          !graph.atLoad(ref) ||
          !READ_KINDS.has(ref.kind) ||
          !symbols.isModuleLevel(ref.sym)
        ) {
          continue
        }
        const d = clusterOfSym.get(ref.sym)
        if (d === undefined || seen.has(d) || clusters[d]!.copyable) {
          continue
        }
        if (kept(d)) {
          return true
        }
        if (ref.calls && clusters[d]!.kind === 'declaration') {
          seen.add(d)
          work.push(d)
        }
      }
    }
  }
  return false
}

export function settleRoots(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  seeds: Seeds,
): Roots {
  const { t1, outputs, isBenign } = input
  const { units, refs, regions, symbols } = t1
  const { clusters, clusterOfRegion, clusterOfSym } = graph
  const { envRoots, pinned, derivedRoots, candidates } = seeds
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')

  const derivedReach = new Map<OutputId, Set<ClusterId>>()
  /** The candidates still extracted. */
  const remaining = new Map(candidates)
  let liveEnv = new Set<ClusterId>()
  const movable = new Set<ClusterId>()
  const pins = new Map<ClusterId, Pin>()
  const pure = (c: ClusterId) => !clusters[c]!.effectful
  const needs = (c: ClusterId) => derivedNeeds(input, derivedReach, c)
  const keepsEagerly = (c: ClusterId) =>
    readsKeptEagerly(input, graph, { liveEnv, envRoots }, c)

  /**
   * The output whose tree decides the live reads of cluster `c` reached from
   * output `o`: an env root a derived output imports from the env module
   * reads what it evaluates there (an identifier option value the splitter
   * replaced in the env output only is no read of a chunk importing `Route`),
   * a cluster pinned to another output what it evaluates in that output. A
   * provider output copies every cluster it reaches: its own tree decides.
   */
  const readsOutput = (c: ClusterId, o: OutputId): OutputId => {
    if (o === 'env' || outputs.get(o)?.kind === 'provider') {
      return o
    }
    const pin = pinned.get(c)
    if (pin !== undefined) {
      return pin
    }
    return envRoots.has(c) ? 'env' : o
  }
  const reach = (
    o: OutputId,
    from: Iterable<ClusterId>,
    stopAt: ReadonlySet<ClusterId> | null = null,
  ) => reads.reach(o, from, stopAt, (c) => readsOutput(c, o))

  // the surviving effects a moving cluster is ordered against (asked only
  // when one could move: most modules never need the benign check)
  let survivingEffects: Array<Unit> | null = null
  // module loading is hoisted: a bare import or a re-export evaluates before
  // the module body wherever it is written, so it is never an effect before
  // or after a cluster
  const effectsSurviving = (): Array<Unit> =>
    (survivingEffects ??= units.filter(
      (u) =>
        u.effectful &&
        u.kind !== 'type' &&
        u.kind !== 'import-effect' &&
        u.kind !== 'reexport' &&
        graph.unitSurvives(u.id) &&
        !isBenign(u.id),
    ))

  /**
   * An unexported declaration cluster the env module does not keep (yet)
   * whose evaluation time matters (effectful, or an eager reader of state
   * something writes): it moves, is orphaned or becomes an env root.
   */
  const undecided = (cl: Cluster): boolean =>
    !liveEnv.has(cl.id) &&
    cl.kind === 'declaration' &&
    !cl.exported &&
    !envRoots.has(cl.id) &&
    (cl.effectful || graph.mutableReaders.has(cl.id))

  /** The only needer `cl` may move to (one derived output, and no ordered-evaluation constraint), else why not. */
  function movableTo(cl: Cluster): OutputId | Pin {
    // (a) exactly one derived needer
    const needers: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(cl.id)) {
        needers.push(id)
      }
    }
    if (needers.length !== 1) {
      // a pure cluster is undecided only as a reader of mutable state
      return { reason: cl.effectful ? 'needers' : 'state' }
    }
    // an extracted export's module is side-effect free (every bundler may
    // skip it while nothing imports what it exports): an effect observable
    // on its own never moves there, it would run late or never
    if (cl.sideEffects && outputs.get(needers[0]!)?.kind === 'export') {
      return { reason: 'effects' }
    }
    // (b) no ordered-evaluation constraint: nothing outside the cluster
    // writes it eagerly (its own top-level augmentations, `X.p = …`, travel
    // with it: a binding and its writers are one cluster), and it reads
    // nothing something else writes
    if (graph.writes.length > 0) {
      for (const s of cl.declares) {
        for (const w of graph.writesOfSym.get(s) ?? []) {
          if (
            w.live &&
            w.eager &&
            (w.owner === null || clusterOfRegion.get(w.owner) !== cl.id)
          ) {
            return { reason: 'written', at: w.at }
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
      return { reason: 'written', at: unit.range.start }
    }
    for (const r of cl.regions) {
      for (const ref of graph.ownedRefs.get(r) ?? []) {
        if (
          !ref.eager ||
          !READ_KINDS.has(ref.kind) ||
          !liveInEnv(ref) ||
          !symbols.isModuleLevel(ref.sym)
        ) {
          continue
        }
        const d = clusterOfSym.get(ref.sym)
        if (d === undefined || d === cl.id) {
          continue
        }
        if (graph.mutatedOutside(ref.sym, ref.range.start, cl.id)) {
          return { reason: 'state', read: ref.sym }
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
          return { reason: 'reads', read: ref.sym }
        }
      }
    }
    return needers[0]!
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
  ): Unit | undefined {
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
      return u
    }
    return undefined
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
    pins.clear()
    for (const cl of clusters) {
      if (!undecided(cl)) {
        continue
      }
      const to = movableTo(cl)
      if (typeof to === 'string') {
        target.set(cl.id, to)
      } else {
        pins.set(cl.id, to)
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
        const effect = effectStays(clusters[c]!, to, target)
        if (effect !== undefined) {
          target.delete(c)
          pins.set(c, { reason: 'order', effect: effect.id })
          dropped = true
        }
      }
    }
    movable.clear()
    for (const c of target.keys()) {
      movable.add(c)
    }
  }

  /** How many derived outputs reach `c` (a provider output copies, it does not count). */
  const needers = (c: ClusterId): number => {
    let n = 0
    for (const [id, set] of derivedReach) {
      if (set.has(c) && outputs.get(id)?.kind !== 'provider') {
        n++
      }
    }
    return n
  }
  /** Whether an extracted-export output (evaluated before the env module's body) reaches `c`. */
  const neededByStaticOutput = (c: ClusterId): boolean => {
    for (const [id, set] of derivedReach) {
      if (set.has(c) && outputs.get(id)?.kind === 'export') {
        return true
      }
    }
    return false
  }

  // ---- extracted exports: what may leave ------------------------------------
  // A chunk copies an extracted export instead of importing its module when
  // the copy is indistinguishable from the original. The extracted module is
  // re-exported by the route module (statically, for other importers) and
  // would be imported by the lazy chunk: reachable from the entry and from a
  // chunk at once, Rolldown < 1.1.5 and any Rolldown under a user chunk
  // group that merges into the entry place it with the entry, and the export
  // is eager again (tanstack.com, Vite 8.0.x). With the copy nobody imports
  // the module unless another file imports the binding, and an unused
  // side-effect-free module is tree-shaken, not placed. The copy carries the
  // candidate and what it reaches that no output keeps once (another
  // candidate is imported from its module or copied under its own decision;
  // an effectful cluster stays in the env module or moves, one instance);
  // every cluster carried must be a function or a primitive nothing writes
  // (`isDuplicable`): a copied object, class, call result or regex would
  // be a second identity (`instanceof` across chunks, a context's Provider
  // and its consumer, a sentinel), and a copied written binding a second
  // state (a `listeners` array behind `subscribe`/`emit`). Otherwise the
  // chunk imports the extracted module, one instance, as a stateful export
  // always did. Importers (rare) of a copied export then get the extracted
  // instance and the chunk its copy: two instances of a function.
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
  for (const claim of input.rewrites.claims.values()) {
    const parent = regions.get(claim.region).parent
    if (parent !== null) {
      claimHolders.add(clusterOfRegion.get(parent)!)
    }
  }
  const duplicable = (c: ClusterId) => isDuplicable(clusters[c]!, t1, liveInEnv)
  /**
   * The clusters a copy never carries, so the walk stops at them: every
   * output keeps them once by construction. Another candidate is imported
   * from its module or copied under its own decision; an effectful cluster
   * and an eager reader of state stay in the env module or move with one
   * needer (several needers root them); a cluster the env module's seeds
   * keep alive stays there (roots only grow); a type unit stays. Computed
   * once: it reads nothing the fixed point changes.
   */
  let carriedStop: Set<ClusterId> | null = null
  const stopSet = (): Set<ClusterId> => {
    if (carriedStop === null) {
      carriedStop = new Set(candidates.keys())
      for (const cl of clusters) {
        if (cl.effectful || cl.envPinned || graph.mutableReaders.has(cl.id)) {
          carriedStop.add(cl.id)
        }
      }
      for (const d of reach('env', envRoots)) {
        carriedStop.add(d)
      }
    }
    return carriedStop
  }
  /** A candidate a chunk copies: pure, observing no mutable state, holding no claimed region, and nothing the copy carries (`stopSet`) has an identity or is written. A function of the candidate alone, decided once. */
  const copyDecisions = new Map<ClusterId, boolean>()
  const copies = (c: ClusterId): boolean => {
    let hit = copyDecisions.get(c)
    if (hit !== undefined) {
      return hit
    }
    hit = false
    if (
      !clusters[c]!.effectful &&
      !graph.mutableReaders.has(c) &&
      !claimHolders.has(c)
    ) {
      const stop = new Set(stopSet())
      stop.delete(c)
      hit = true
      for (const d of reach('env', [c], stop)) {
        const cl = clusters[d]!
        if (
          d !== c &&
          (stop.has(d) || cl.kind === 'import' || cl.kind === 'type')
        ) {
          continue
        }
        if (!duplicable(d)) {
          hit = false
          break
        }
      }
    }
    copyDecisions.set(c, hit)
    return hit
  }

  // ---- derived reach before any decision; pre-existing dead code ----------
  for (const [id, from] of derivedRoots) {
    derivedReach.set(id, reach(id, from))
  }
  // a pure declaration cluster nobody reads (and no derived output roots) is harmless in the
  // env module and keeps what it reads alive; clusters only read by each other (a dead pure cycle)
  // are such dead code too: code that was dead before the transform is never removed (G16)
  const deadCandidates = new Set<ClusterId>()
  for (const cl of clusters) {
    if (
      cl.kind !== 'declaration' ||
      cl.effectful ||
      cl.exported ||
      !cl.units.every(graph.unitSurvives)
    ) {
      continue
    }
    if (!needs(cl.id)) {
      deadCandidates.add(cl.id)
    }
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const c of deadCandidates) {
      const read = [...clusters[c]!.declares].some((s) =>
        refs.valueRefsOf(s).some((ref) => {
          // a reader outside the candidates, or inside erased text (an
          // orphan of ours, decided by provenance), is a real reader
          const owner = clusterOfRegion.get(t1.ownerOf(ref))
          return (
            owner === undefined || !deadCandidates.has(owner) || !liveInEnv(ref)
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
    // dead code that would keep a chunk's dependency in the env module (an
    // unused function rendering the split component) is dropped instead
    let pulls = false
    for (const d of reach('env', [c])) {
      if (d === c) {
        continue
      }
      for (const set of derivedReach.values()) {
        if (set.has(d)) {
          pulls = true
          break
        }
      }
      if (pulls) {
        break
      }
    }
    if (!pulls) {
      envRoots.add(c)
    }
  }
  // what derived outputs need before any extraction (a chunk may reach a
  // candidate through another one)
  const needed = new Set<ClusterId>()
  if (candidates.size > 0) {
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
    !keepsEagerly(c) &&
    (!clusters[c]!.effectful || movable.has(c))

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
  const pinnedNeeded = new Map<ClusterId, Pin>()
  const cancelled = new Map<ClusterId, Pin>()
  // derived reach changes only with the candidates still extracted, or when
  // a cluster a derived output reaches becomes an env root (it then reads
  // what it evaluates in the env module)
  let derivedStale = remaining.size > 0
  for (;;) {
    if (derivedStale) {
      derivedStale = false
      const stop = new Set(remaining.keys())
      // a chunk's reach passes through the candidates it copies and stops
      // at the others, which it imports from their extracted module (one
      // instance of state and effects); an extracted module's reach
      // stops at every other candidate (it imports them)
      const chunkStop = new Set([...stop].filter((c) => !copies(c)))
      for (const [c, e] of candidates) {
        if (remaining.has(c)) {
          pinned.set(c, e.output)
          derivedRoots.set(e.output, new Set([c]))
        } else {
          pinned.delete(c)
          derivedRoots.set(e.output, new Set())
        }
      }
      for (const [id, from] of derivedRoots) {
        const own = [...from].find((c) => remaining.get(c)?.output === id)
        derivedReach.set(
          id,
          reach(
            id,
            from,
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
      const neededHere = needs(cl.id)
      if (seeds.fromErased.has(cl.id) && !neededHere) {
        continue // orphaned by us: removable with its initialiser effects
      }
      envRoots.add(cl.id)
      if (neededHere) {
        pinnedNeeded.set(cl.id, pins.get(cl.id)!)
      }
      derivedStale ||= neededHere
      changed = true
    }
    // static outputs: a cluster an extracted export's module needs that
    // reads, at its evaluation, a binding the env module keeps stays in the
    // env module, an env root, and the extracted module imports it
    // (`readsKeptEagerly`; a candidate itself is cancelled below, with its
    // companions). The "chunk loads after the route module" argument of the
    // movable test holds for lazily imported outputs only; a cluster with
    // observable effects never moves to a static output (`movableTo`), an
    // augmented one only under the order rule (`effectStays`). And a pure
    // cluster with an identity, or a written one, that an extracted module
    // and another output need: a copy per output would be two objects, a
    // lazy shared module cannot serve a static output, so it stays in the
    // env module too, one instance every output imports (decided here, not
    // at homing, so that a candidate reading it eagerly is cancelled).
    for (const cl of remaining.size > 0 ? clusters : []) {
      if (
        cl.kind !== 'declaration' ||
        cl.copyable ||
        liveEnv.has(cl.id) ||
        envRoots.has(cl.id) ||
        remaining.has(cl.id) ||
        !neededByStaticOutput(cl.id)
      ) {
        continue
      }
      if (keepsEagerly(cl.id)) {
        envRoots.add(cl.id)
      } else if (cl.effectful || duplicable(cl.id) || needers(cl.id) < 2) {
        continue
      } else {
        // reported as what only split code needs that stays (`kept`)
        envRoots.add(cl.id)
        pinnedNeeded.set(cl.id, { reason: 'shared' })
      }
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
      // the cause, before it becomes an env root (and so live there); an
      // effectful candidate that does not move was dropped by the order rule
      cancelled.set(
        c,
        liveEnv.has(c)
          ? { reason: 'live' }
          : keepsEagerly(c)
            ? { reason: 'reads' }
            : (pins.get(c) ?? { reason: 'order' }),
      )
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

  return {
    envRoots,
    liveEnv,
    pinned,
    derivedRoots,
    derivedReach,
    remaining,
    cancelled,
    copied: new Set([...remaining.keys()].filter(copies)),
    movable,
    pins,
    pinnedNeeded,
  }
}

/**
 * Dev: nothing is bundled, so an extracted cluster stays in the env module
 * as written (see `copies`), its export companions with it, its extracted
 * output empty; chunks copy or import it exactly as in a build. Folds the
 * remaining candidates into the env roots.
 */
export function foldExtractions(reads: ReadIndex, roots: Roots): void {
  for (const [c, e] of roots.remaining) {
    roots.pinned.delete(c)
    roots.envRoots.add(c)
    for (const k of e.companions) {
      roots.envRoots.add(k)
    }
    roots.derivedRoots.set(e.output, new Set())
    roots.derivedReach.set(e.output, new Set())
  }
  roots.remaining.clear()
  roots.liveEnv = reads.reach('env', roots.envRoots)
}

/**
 * The extracted exports in source order: every exported symbol of the
 * cluster leaves with it (a `let` and the exported function writing it),
 * and the env module re-exports them all. Their export companions render
 * as that re-export glue (placed nowhere: `deadClusters`).
 */
export function extractedExports(
  input: PlacementInput,
  graph: ClusterGraph,
  seeds: Seeds,
  roots: Roots,
): Array<ExtractedExport> {
  const { units } = input.t1
  const { clusters } = graph
  const extracted: Array<ExtractedExport> = []
  for (const [c, e] of [...roots.remaining].sort(
    ([a], [b]) => clusters[a]!.start - clusters[b]!.start,
  )) {
    for (const k of e.companions) {
      seeds.deadClusters.add(k)
    }
    const syms = new Set(e.syms)
    for (const u of clusters[c]!.units) {
      const unit = units[u]!
      if (unit.exported.length > 0) {
        for (const s of unit.declares) {
          syms.add(s)
        }
      }
    }
    extracted.push({ output: e.output, syms: [...syms] })
  }
  return extracted
}
