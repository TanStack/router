/**
 * Placement, stage 4: what the env module keeps (README.md, "effects and
 * mutable state"). The solver of design 2: every cluster starts in its
 * slot (the env module if it reaches it, an extraction candidate in its
 * extracted module, a cluster whose evaluation time matters with its only
 * lazy needer), and each round demotes to the env module what violates a
 * rule of the event table (`events.ts`) against the current slots, with
 * the violated pair. Roots only grow and candidates only cancel, so the
 * rounds end within the cluster count (past it, an error naming the file);
 * nothing is rooted after it.
 */
import { isDuplicable } from './clusters'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { Events, Pin } from './events'
import type { ReadIndex } from './reads'
import type { Candidate, Seeds } from './roots'
import type { ClassifiedRef } from '../analysis'
import type { OutputId } from '../rewrite'
import type { ExtractedExport, PlacementInput } from '../reach'

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
  /** Why each cancelled candidate stays in the env module (`live`, `reads`, `state`, `order`), taken when it was cancelled. */
  cancelled: Map<ClusterId, Pin>
  /** The extracted candidates a chunk copies instead of importing their module. */
  copied: Set<ClusterId>
  /** The clusters whose evaluation time matters that leave the env module with their only needer. */
  movable: Set<ClusterId>
  /** The clusters a derived output needs that became env roots, with the violated pair. */
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

export function settleRoots(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  events: Events,
  seeds: Seeds,
): Roots {
  const { t1, outputs } = input
  const { refs } = t1
  const { regions } = input.rewrites
  const { clusters, clusterOfRegion } = graph
  const { envRoots, pinned, derivedRoots, candidates } = seeds
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')

  const derivedReach = new Map<OutputId, Set<ClusterId>>()
  /** The candidates still extracted. */
  const remaining = new Map(candidates)
  let liveEnv = new Set<ClusterId>()
  const movable = new Set<ClusterId>()
  /** The slots of the last round: where each cluster leaving the env module evaluates (`solveSlots`). */
  const slots = new Map<ClusterId, OutputId>()
  /** Where a cluster evaluates for O: its slot, an extracted candidate's module, else in the env module (it stays there, or homes place it: judged as staying). */
  const slotOf = (d: ClusterId): OutputId =>
    slots.get(d) ?? remaining.get(d)?.output ?? 'env'
  const pins = new Map<ClusterId, Pin>()
  const needs = (c: ClusterId) => derivedNeeds(input, derivedReach, c)
  /** T against the current roots: `c` reads at its evaluation what the env module keeps. */
  const readsKept = (c: ClusterId) =>
    events.readsKept(
      c,
      (d) => liveEnv.has(d) || envRoots.has(d) || clusters[d]!.envPinned,
    )

  /**
   * The output whose tree decides the live reads of cluster `c` reached from
   * output `o`: a cluster the env module evaluates (an env root, or what one
   * reads: `liveEnv`), which a derived output imports from there, reads what
   * it evaluates there (an identifier option value the splitter replaced in
   * the env output only is no read of a chunk importing `Route`, nor is the
   * erased handler of a server fn the route's loader calls), a cluster pinned
   * to another output what it evaluates in that output. A provider output
   * copies every cluster it reaches: its own tree decides.
   */
  const readsOutput = (c: ClusterId, o: OutputId): OutputId => {
    if (o === 'env' || outputs.get(o)?.kind === 'provider') {
      return o
    }
    const pin = pinned.get(c)
    if (pin !== undefined) {
      return pin
    }
    return envRoots.has(c) || liveEnv.has(c) ? 'env' : o
  }
  const reach = (
    o: OutputId,
    from: Iterable<ClusterId>,
    stopAt: { has: (c: ClusterId) => boolean } | null = null,
  ) => reads.reach(o, from, stopAt, (c) => readsOutput(c, o))

  /** Whether `c` reads state something else writes: at an unknown time (V), or after it when the module loads (O orders it). */
  const readsState = (c: ClusterId): Pin | undefined =>
    events.volatile(c) ?? events.ordered(c)

  /**
   * Whether `cl`'s slot is decided by the rules: an unexported declaration
   * the env module does not keep (yet) whose evaluation time matters (an
   * effect, it reads state something else writes, or it writes, at load,
   * a binding it declares). It takes its only lazy needer's slot, or is
   * orphaned, or is demoted to an env root.
   */
  const timed = (cl: Cluster): boolean =>
    !liveEnv.has(cl.id) &&
    cl.kind === 'declaration' &&
    !cl.exported &&
    !envRoots.has(cl.id) &&
    (cl.effectful || cl.writer || readsState(cl.id) !== undefined)

  /**
   * The slot of a timed cluster: its only needer (N), unless a pair rule of
   * that slot pins it. A writer that is neither (pure, reading no state)
   * several outputs need has none: homes place it (a shared module), and
   * its readers import it, so they evaluate after its writes; one reading
   * it before a write is judged as if it stayed (`slotOf`), and keeps it.
   */
  function slotFor(cl: Cluster): OutputId | Pin | null {
    const needers: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(cl.id)) {
        needers.push(id)
      }
    }
    if (needers.length !== 1) {
      return cl.effectful
        ? { reason: 'needers' }
        : (readsState(cl.id) ??
            (needers.length > 1 ? null : { reason: 'needers' }))
    }
    // an extracted export's module is side-effect free (every bundler may
    // skip it while nothing imports what it exports): an effect never
    // moves there, it would run late or never
    if (cl.effectful && outputs.get(needers[0]!)?.kind === 'export') {
      return { reason: 'effects' }
    }
    return events.lazyConflict(cl.id, liveEnv) ?? needers[0]!
  }

  /**
   * The slots of this round: each timed cluster's (`slotFor`); then O as a
   * greatest fixed point over the clusters leaving the env module: one an
   * effect, or a write when the module loads, that stays (or goes
   * elsewhere) would change order with is demoted, which can demote others
   * (a reader and the writer after it evaluate in one slot, or both stay).
   * The pairs of the demoted go to `pins`.
   */
  function solveSlots(): void {
    const target = slots
    target.clear()
    pins.clear()
    for (const cl of clusters) {
      if (!timed(cl)) {
        continue
      }
      const to = slotFor(cl)
      if (typeof to === 'string') {
        target.set(cl.id, to)
      } else if (to !== null) {
        pins.set(cl.id, to)
      }
    }
    for (let dropped = true; dropped; ) {
      dropped = false
      for (const [c, to] of target) {
        const effect = events.orderConflict(c, to, target)
        const pin: Pin | undefined =
          effect !== undefined
            ? { reason: 'order', other: { unit: effect.id } }
            : events.writeConflict(c, to, slotOf)
        if (pin !== undefined) {
          target.delete(c)
          pins.set(c, pin)
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
    const parent = regions.parentOf(claim.region)
    if (parent !== null) {
      claimHolders.add(clusterOfRegion.get(parent)!)
    }
  }
  const duplicable = (c: ClusterId) => isDuplicable(clusters[c]!, t1, liveInEnv)
  /**
   * The clusters a copy never carries, so the walk stops at them: every
   * output keeps them once by construction. Another candidate is imported
   * from its module or copied under its own decision; an effectful cluster,
   * a writer and an eager reader of state stay in the env module or move
   * with one needer (several needers root them or give a writer a shared
   * module: one instance); a cluster the env module's seeds
   * keep alive stays there (roots only grow); a type unit stays. Computed
   * once: it reads nothing the fixed point changes (V is asked of the
   * clusters a copy reaches only).
   */
  let carriedStop: Set<ClusterId> | null = null
  const stopSet = (): Set<ClusterId> => {
    if (carriedStop === null) {
      carriedStop = new Set(candidates.keys())
      for (const cl of clusters) {
        if (cl.effectful || cl.writer || cl.envPinned) {
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
      readsState(c) === undefined &&
      !claimHolders.has(c)
    ) {
      const base = stopSet()
      const stop = {
        has: (d: ClusterId) =>
          d !== c && (base.has(d) || readsState(d) !== undefined),
      }
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

  // ---- candidates that reference each other share a module ----------------
  // In two extracted modules importing each other, which evaluates first
  // depends on who imports what and how the bundler orders them, and a read at
  // evaluation (`class A extends Z`) can then find the other uninitialised.
  // Every candidate of a read cycle, direct or through what it carries, goes to
  // the output of the first one in the source; its module evaluates them in
  // source order.
  if (candidates.size > 1) {
    const readers = new Map<ClusterId, Set<ClusterId>>()
    for (const c of candidates.keys()) {
      const stop = new Set(candidates.keys())
      stop.delete(c)
      readers.set(
        c,
        new Set([...reach('env', [c], stop)].filter((d) => stop.has(d))),
      )
    }
    const reachable = (from: ClusterId): Set<ClusterId> => {
      const seen = new Set<ClusterId>()
      const work = [from]
      while (work.length > 0) {
        for (const d of readers.get(work.pop()!)!) {
          if (!seen.has(d)) {
            seen.add(d)
            work.push(d)
          }
        }
      }
      return seen
    }
    const closure = new Map(
      [...candidates.keys()].map((c) => [c, reachable(c)]),
    )
    const inSourceOrder = [...candidates.keys()].sort(
      (a, b) => clusters[a]!.start - clusters[b]!.start,
    )
    for (const c of inSourceOrder) {
      const first = inSourceOrder.find(
        (d) => d === c || (closure.get(c)!.has(d) && closure.get(d)!.has(c)),
      )!
      candidates.get(c)!.output = candidates.get(first)!.output
    }
  }

  // ---- derived reach before any decision; pre-existing dead code ----------
  liveEnv = reach('env', envRoots)
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
          const owner = clusterOfRegion.get(regions.ownerOf(ref))
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
  /**
   * Why a candidate is demoted, if it is: the env module keeps it (`live`),
   * T (`reads`), no derived output needs it, V (`state`: its module may
   * evaluate after a write it did not see, with the first chunk importing
   * it), O (`state`: a write at load outside its module; a candidate has
   * no effect, its pure writes travel with it).
   */
  const candidatePin = (c: ClusterId, to: OutputId): Pin | undefined => {
    if (liveEnv.has(c)) {
      return { reason: 'live' }
    }
    if (readsKept(c)) {
      return { reason: 'reads' }
    }
    if (needed.has(c)) {
      return events.volatile(c) ?? events.writeConflict(c, to, slotOf)
    }
    return { reason: 'order' }
  }

  // ---- the solver: env roots, slots and extraction, one fixed point -------
  // Each round: derived reach with the candidates still extracted (chunks
  // import an extracted cluster from its output, so their reach stops
  // there, and that output reaches what its cluster reads), env liveness,
  // the slots (`solveSlots`). A timed cluster without a slot is demoted to
  // an env root, which makes what it reads live in the env module: a
  // cluster read by it no longer moves, nor one that only could because
  // that one moved with it (no surviving effect after it stays behind). A
  // cluster an extracted module needs is demoted by T, or kept once for an
  // identity two outputs share. Once nothing else changes, a candidate
  // with a violated rule is cancelled: it and its export companions are env
  // roots. Every round that goes on demotes a cluster (roots only grow,
  // candidates only cancel), so the rounds end within the cluster count
  // (P5), and every decision was taken over the final env roots.
  const pinnedNeeded = new Map<ClusterId, Pin>()
  const cancelled = new Map<ClusterId, Pin>()
  // derived reach changes only with the candidates still extracted, or when
  // a cluster a derived output reaches becomes an env root (it then reads
  // what it evaluates in the env module)
  let derivedStale = remaining.size > 0
  for (let round = 0; ; round++) {
    if (round > clusters.length) {
      throw new Error(
        `placement of ${input.canonicalId} did not settle within ${clusters.length + 1} rounds (a compiler bug: please report it with this file)`,
      )
    }
    if (derivedStale) {
      derivedStale = false
      liveEnv = reach('env', envRoots)
      const stop = new Set(remaining.keys())
      // a chunk's reach passes through the candidates it copies and stops
      // at the others, which it imports from their extracted module (one
      // instance of state and effects); an extracted module's reach
      // stops at every other candidate (it imports them)
      const chunkStop = new Set([...stop].filter((c) => !copies(c)))
      for (const e of candidates.values()) {
        derivedRoots.set(e.output, new Set())
      }
      for (const [c, e] of candidates) {
        if (remaining.has(c)) {
          pinned.set(c, e.output)
          derivedRoots.get(e.output)!.add(c)
        } else {
          pinned.delete(c)
        }
      }
      for (const [id, from] of derivedRoots) {
        const own = [...from].some((c) => remaining.get(c)?.output === id)
        derivedReach.set(
          id,
          reach(
            id,
            from,
            own
              ? new Set(
                  [...stop].filter((c) => remaining.get(c)!.output !== id),
                )
              : outputs.get(id)?.kind === 'export'
                ? stop
                : chunkStop,
          ),
        )
      }
    }
    liveEnv = reach('env', envRoots)
    solveSlots()
    let changed = false
    for (const [c, pin] of pins) {
      const neededHere = needs(c)
      if (seeds.fromErased.has(c) && !neededHere) {
        continue // orphaned by us: removable with its initialiser effects
      }
      envRoots.add(c)
      if (neededHere) {
        pinnedNeeded.set(c, pin)
      }
      derivedStale ||= neededHere
      changed = true
    }
    // the slots of an extracted module's dependencies: a cluster it needs
    // that reads, at its evaluation, a binding the env module keeps (T)
    // stays in the env module, an env root, and the extracted module
    // imports it (a candidate itself is cancelled below, with its
    // companions). A cluster with observable effects never moves there
    // (`slotFor`), an augmented one only under O. And a pure cluster with an
    // identity, or a written one, that an extracted module and another
    // output need: a copy per output would be two objects, a lazy shared
    // module cannot serve a static output, so it stays in the env module
    // too, one instance every output imports (decided here, not at homing,
    // so that a candidate reading it eagerly is cancelled).
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
      if (readsKept(cl.id)) {
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
      // the cause, before it becomes an env root (and so live there)
      const pin = candidatePin(c, e.output)
      if (pin === undefined) {
        continue
      }
      cancelled.set(c, pin)
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
    const shared = extracted.find((x) => x.output === e.output)
    if (shared) {
      shared.syms.push(...syms)
    } else {
      extracted.push({ output: e.output, syms: [...syms] })
    }
  }
  return extracted
}
