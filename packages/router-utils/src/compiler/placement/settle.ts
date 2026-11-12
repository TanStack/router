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
import { statementsIn } from '../units'
import { isDuplicable } from './clusters'
import type { Cluster, ClusterGraph, ClusterId, Write } from './clusters'
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
  /** Why each cancelled candidate stays in the env module (`live`, `reads`, `state`, `unneeded`), taken when it was cancelled. */
  cancelled: Map<ClusterId, Pin>
  /** Of a candidate cancelled `live`, its own violation (V, O), if any: reported when nothing else names it (the env module may evaluate it only for code kept because of it, placement-exec seed 10112). */
  liveOwn: Map<ClusterId, Pin>
  /** The extracted candidates a chunk copies instead of importing their module. */
  copied: Set<ClusterId>
  /** The clusters whose evaluation time matters that leave the env module with their only needer. */
  movable: Set<ClusterId>
  /** The clusters a derived output needs that became env roots, with the violated pair. */
  pinnedNeeded: Map<ClusterId, Pin>
  /** The followers whose bindings go to several split outputs, rooted in each: they join them in one lazy shared module (R151). */
  joined: Map<ClusterId, Array<OutputId>>
  /** What each joined follower follows (`Events.statementChanges`): it goes where they go (homes). */
  joinedWith: Map<ClusterId, ReadonlyArray<ClusterId>>
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
  const { refs, symbols } = t1
  const { regions } = input.rewrites
  const { clusters, clusterOfRegion } = graph
  const { envRoots, pinned, derivedRoots, candidates, followers } = seeds
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
    // (an extraction candidate's place is its module: R150; so is a
    // member's)
    !remaining.has(cl.id) &&
    !members.has(cl.id) &&
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
      // several split outputs: one lazy shared module they import, effects
      // too, evaluated once when the first of them loads (R151); beside an
      // extracted module or a provider no module serves them both
      return cl.effectful && !(needers.length > 1 && needers.every(lazy))
        ? { reason: 'needers' }
        : (readsState(cl.id) ??
            (needers.length > 1 ? null : { reason: 'needers' }))
    }
    return events.lazyConflict(cl.id, writesIn(needers[0]!)) ?? needers[0]!
  }

  /**
   * Whether a write runs in output `to`: its evaluation (a claimed option
   * value, a function of the module) goes there and only there (recheck
   * ruling C: such a later writer cannot run before a reader `to`
   * evaluates).
   */
  const writesIn =
    (to: OutputId) =>
    (w: Write): boolean => {
      if (w.owner === null) {
        return false
      }
      const claim = input.rewrites.claims.get(w.owner)
      const d =
        claim === undefined
          ? graph.clusterOfRegion.get(w.owner)
          : graph.clusterOfGen.get(claim.owner)
      // (a writer the env module keeps runs there, whatever reaches it)
      if (
        d === undefined ||
        liveEnv.has(d) ||
        envRoots.has(d) ||
        pins.has(d) ||
        clusters[d]!.envPinned
      ) {
        return false
      }
      const places = placesOf(d)
      return places.length === 1 && places[0] === to
    }
  /** A split chunk or a Hydrate chunk: what a lazy shared module serves. */
  const lazy = (o: OutputId) => {
    const kind = outputs.get(o)?.kind
    return kind === 'split' || kind === 'hydrate'
  }
  /** Whether `d` goes to a lazy shared module `to` imports (R151): no slot of its own, several split needers, `to` one of them. */
  const sharedWith = (d: ClusterId, to: OutputId): boolean => {
    if (slots.has(d) || pins.has(d)) {
      return false
    }
    const needers = needersOf(d)
    return needers.length > 1 && needers.includes(to) && needers.every(lazy)
  }
  /** The outputs reaching `d` (a provider's copy counts). */
  const needersOf = (d: ClusterId): Array<OutputId> => {
    const out: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(d)) {
        out.push(id)
      }
    }
    return out
  }
  /**
   * Where `d` takes a follower: a binding being extracted, its module only
   * (every reader imports it from there); else the outputs reaching it.
   */
  const placesOf = (d: ClusterId): Array<OutputId> => {
    const e = remaining.get(d)
    if (e !== undefined) {
      return [e.output]
    }
    const m = members.get(d)
    if (m !== undefined) {
      return [m]
    }
    // (a follower judged already goes where it was rooted: an unused
    // chain follows what it reads transitively, recheck ruling D)
    const f = follows.get(d)
    if (f !== undefined) {
      return [f]
    }
    return joined.get(d) ?? needersOf(d)
  }
  /**
   * What an extracted module holds beside its candidate (recheck ruling A,
   * R150): a cluster only it and split chunks need, and a follower whose
   * bindings go there and to split chunks. The chunks import it from there,
   * as they import the candidate (one instance).
   */
  const members = new Map<ClusterId, OutputId>()
  /** Whether an output is an extracted export's module still extracted. */
  const extractedOutput = (o: OutputId): boolean => {
    for (const e of remaining.values()) {
      if (e.output === o) {
        return true
      }
    }
    return false
  }
  /** The chunk each follower (`Seeds.followers`) follows, rooted there until it is demoted. */
  const follows = new Map<ClusterId, OutputId>()
  /** Followers to judge again: their extracted module was cancelled. */
  const rejudge = new Set<ClusterId>()
  /** Roots follower `c` where `followSlot` puts it, or keeps it. */
  const judge = (c: ClusterId): void => {
    const to = followSlot(c)
    if (typeof to === 'string' && extractedOutput(to)) {
      // (it and what it uses that split chunks need: the module's)
      members.set(c, to)
    } else if (typeof to === 'string') {
      follows.set(c, to)
      derivedRoots.get(to)!.add(c)
    } else if (Array.isArray(to)) {
      // rooted in each: they all reach it and what it uses, one cluster
      // for them (homes: their shared module)
      joined.set(c, to)
      for (const o of to) {
        derivedRoots.get(o)!.add(c)
      }
    } else {
      keepFollower(c, to)
    }
  }
  /** The followers joining their bindings in a shared module, rooted in each of their split outputs (R151). */
  const joined = new Map<ClusterId, Array<OutputId>>()
  /**
   * Where follower `c` goes, judged once before it is rooted anywhere: the
   * one chunk the clusters its statements change (`Events.statementChanges`)
   * and its own declarations go to, none (itself included) evaluated by the
   * env module (what it only reads may stay: the chunk imports it); what
   * it touches that nothing else needs follows it; an extracted export's
   * module is such a chunk (R149, extended: it runs when something uses
   * the export). Never a provider. Then the lazy-slot rules (`written` for what it
   * declares, V).
   */
  /**
   * Why follower `c` stays (`written`, reported on what it changes,
   * `kept.ts`): `d`, a cluster it changes (its own aside), stays or goes to
   * another output (`in`), at the first of its statements changing it.
   */
  const stayPin = (
    c: ClusterId,
    d: ClusterId | null,
    other?: OutputId,
    later?: number,
  ): Pin => {
    const changes = events.statementChanges(c)
    const sym =
      d === null
        ? undefined
        : [...changes.syms, ...changes.reads].find(
            (s) => graph.clusterOfSym.get(s) === d,
          )
    // unused code (R148): a follower with no statement of its own
    const cl = clusters[c]!
    const unused = cl.units.every((u) => t1.units[u]!.kind !== 'effect')
      ? [...cl.declares].find((s) => symbols.isModuleLevel(s))
      : undefined
    let at: number | undefined
    let split = false
    // the statement naming the binding: its own, else one of a cluster it
    // follows naming it when it evaluates (`track(flags)` reaches `base`
    // through `flags.base = base`: recheck finding 3; not a function's body,
    // which runs where it is called), else the first reaching it
    const statementsOf = (x: ClusterId) =>
      clusters[x]!.units.filter((u) => {
        const kind = t1.units[u]!.kind
        // (of a cluster it follows, a statement: not a declaration)
        return kind === 'effect' || (x === c && kind === 'declaration')
      })
    const names =
      sym === undefined
        ? undefined
        : [
            c,
            // (not the binding's own cluster: its statements need not use
            // what `c` changes)
            ...changes.clusters.filter((x) => x !== d),
          ]
            .flatMap(statementsOf)
            .find(
              (u) =>
                (events.unitChanges(u).syms.includes(sym) ||
                  events.unitChanges(u).reads.includes(sym)) &&
                t1.refs
                  .refsIn(t1.units[u]!.range)
                  .some(
                    (r) =>
                      r.sym === sym &&
                      (r.eager ||
                        graph.clusterOfRegion.get(t1.units[u]!.region) === c),
                  ),
            )
    for (const u of names === undefined ? cl.units : [names]) {
      const unit = t1.units[u]!
      if (unit.kind !== 'effect' && unit.kind !== 'declaration') {
        continue
      }
      const one = events.unitChanges(u)
      if (
        sym === undefined
          ? one.syms.length > 0 || unit.kind === 'effect'
          : one.syms.includes(sym) || one.reads.includes(sym)
      ) {
        at = unit.range.start
        // a statement of several statements changing the binding can
        // change it in one of its own (one call cannot be split)
        split =
          sym !== undefined &&
          one.syms.includes(sym) &&
          unit.node.type !== 'ExpressionStatement' &&
          statementsIn(unit.node) > 1
        break
      }
    }
    return {
      reason: 'written',
      ...(at !== undefined && { other: { at } }),
      ...(sym !== undefined && { binding: sym }),
      ...(sym !== undefined &&
        changes.syms.includes(sym) && { bindingChanged: true }),
      ...(other !== undefined && { in: other }),
      ...(split && { split: true }),
      ...(unused !== undefined && { unused }),
      ...(later !== undefined && { later }),
    }
  }
  /**
   * Keeps follower `c` in the env module, recording why for the report
   * (`kept.ts`): a `written` pin as is, V's (code that runs later writes
   * what it uses) as `written` with that write's position.
   */
  const keepFollower = (c: ClusterId, pin: Pin): void => {
    envRoots.add(c)
    if (pin.reason === 'written') {
      seeds.stayPins.set(c, pin)
    } else if (pin.reason === 'state' && pin.other !== undefined) {
      const sym = pin.binding
      const d = sym === undefined ? undefined : graph.clusterOfSym.get(sym)
      // the later write another statement makes, if one does (a function
      // the statement itself hands to a call is its own)
      const other =
        sym === undefined
          ? undefined
          : graph.writesOfSym
              .get(sym)
              ?.find(
                (w) =>
                  w.live &&
                  !w.eager &&
                  w.owner !== null &&
                  graph.clusterOfRegion.get(w.owner) !== c,
              )
      // (the statement's own code writes it later: what keeps it is
      // another evaluation reading it at load, named with its binding,
      // recheck finding 5)
      const reader =
        other === undefined && sym !== undefined && d !== undefined && d !== c
          ? events.loadToucher(sym, c)
          : undefined
      const readerSym =
        reader === undefined
          ? undefined
          : [...clusters[reader]!.declares].find(
              (s) => symbols.isModuleLevel(s) && !symbols.isImport(s),
            )
      seeds.stayPins.set(
        c,
        readerSym === undefined
          ? {
              ...stayPin(
                c,
                d === undefined || d === c ? null : d,
                undefined,
                other?.at ?? pin.other.at,
              ),
              binding: undefined,
            }
          : { ...stayPin(c, d!), binding: sym!, reader: readerSym },
      )
    }
  }
  /** `c` and the clusters it follows (`Events.statementChanges`). */
  const followed = (c: ClusterId) => [c, ...events.statementChanges(c).clusters]
  function followSlot(c: ClusterId): OutputId | Array<OutputId> | Pin {
    let to: OutputId | null = null
    const places: Array<OutputId> = []
    for (const d of followed(c)) {
      // (a primitive `const` is copied into every output that reads it)
      if (d !== c && clusters[d]!.copyable) {
        continue
      }
      if (liveEnv.has(d) || envRoots.has(d)) {
        return d === c ? { reason: 'needers' } : stayPin(c, d)
      }
      for (const n of placesOf(d)) {
        if (places.includes(n)) {
          continue
        }
        // several split outputs share a module (R151); one extracted
        // module beside them serves them all (they import it, recheck
        // ruling A); two extracted modules, or a provider, share none
        const fits = [...places, n].every(lazy)
          ? true
          : [...places, n].every((o) => lazy(o) || extractedOutput(o)) &&
            [...places, n].filter(extractedOutput).length === 1
        if (to !== null && !fits) {
          return stayPin(c, d === c ? null : d, n)
        }
        to ??= n
        places.push(n)
      }
    }
    if (places.length > 1) {
      const module = places.find(extractedOutput)
      return events.lazyConflict(c) ?? module ?? places
    }
    // where none of its bindings decides, the imports it reads do: their
    // users' one chunk (an unused component rendering the page's UI), for
    // a follower that runs nothing of its own (an effect stays where it
    // was written unless a binding takes it)
    if (to === null && !clusters[c]!.effectful) {
      for (const s of events.statementChanges(c).imports) {
        const d = graph.clusterOfSym.get(s)
        for (const n of d === undefined ? [] : needersOf(d)) {
          const k = outputs.get(n)?.kind
          if (k === 'provider' || n === to) {
            continue
          }
          if (to !== null) {
            return { reason: 'needers' }
          }
          to = n
        }
      }
    }
    const kind = to === null ? undefined : outputs.get(to)?.kind
    if (to === null || kind === 'provider') {
      return { reason: 'needers' }
    }
    return events.lazyConflict(c, writesIn(to)) ?? to
  }
  const followConflict = (
    c: ClusterId,
    to: OutputId,
    target: ReadonlyMap<ClusterId, OutputId>,
    stays: (d: ClusterId) => boolean,
  ): Pin | undefined => {
    if (liveEnv.has(c)) {
      return { reason: 'needers' }
    }
    for (const d of events.statementChanges(c).clusters) {
      if (clusters[d]!.copyable) {
        continue
      }
      if (stays(d)) {
        return stayPin(c, d)
      }
      const needers = placesOf(d)
      const elsewhere = needers.find((n) => n !== to)
      if (elsewhere !== undefined || needers.length !== 1) {
        return stayPin(c, d, elsewhere)
      }
      if ((follows.has(d) || timed(clusters[d]!)) && target.get(d) !== to) {
        const slot = target.get(d)
        return slot === undefined ? stayPin(c, d) : stayPin(c, d, slot)
      }
    }
    return undefined
  }

  /**
   * The slots of this round: each timed cluster's (`slotFor`); then O as a
   * greatest fixed point over the clusters leaving the env module: one
   * reading an effectful cluster that evaluates elsewhere (unless the env
   * module keeps it, a `const`), or that a write when the module loads that
   * stays (or goes elsewhere) would change order with, is
   * demoted, which can demote others (a reader and what it reads evaluate
   * in one slot, or both stay). The pairs of the demoted go to `pins`.
   */
  function solveSlots(): void {
    const target = slots
    target.clear()
    pins.clear()
    /** What the env module keeps after this round: what it evaluates, and the demoted. */
    const stays = (d: ClusterId) =>
      liveEnv.has(d) || envRoots.has(d) || pins.has(d)
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
    for (const [c, to] of follows) {
      target.set(c, to)
    }
    for (let dropped = true; dropped; ) {
      dropped = false
      for (const [c, to] of target) {
        const pin =
          (follows.has(c) ? followConflict(c, to, target, stays) : undefined) ??
          // (an extracted `const`, or one in the shared module `to`
          // imports, is ordered like a kept one: that module evaluates
          // first)
          events.readConflict(
            c,
            to,
            target,
            (d) => stays(d) || remaining.has(d) || sharedWith(d, to),
          ) ??
          events.writeConflict(c, to, slotOf)
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
  /** A candidate with a follower in its module is imported, never copied: the follower runs only where the module does. */
  const copies = (c: ClusterId): boolean => {
    const output = remaining.get(c)?.output ?? candidates.get(c)?.output
    for (const to of [...follows.values(), ...members.values()]) {
      if (to === output) {
        return false
      }
    }
    return copiesValue(c)
  }
  const copiesValue = (c: ClusterId): boolean => {
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
  // dead code (R148): a declaration cluster nobody reads (and no derived
  // output roots), or clusters only read by each other (a dead cycle), was
  // dead before the transform; nothing deletes it: it follows what it
  // changes or reads, like a statement (a follower, judged in round 0),
  // into that one chunk, else stays in the env module. What erased code
  // reaches (reads or assigns) is not dead: orphaned by us, it goes with
  // that code (R6)
  const dead = new Set<ClusterId>()
  for (const cl of clusters) {
    if (
      cl.kind === 'declaration' &&
      !cl.exported &&
      !envRoots.has(cl.id) &&
      !seeds.fromErased.has(cl.id) &&
      cl.units.every(graph.unitSurvives) &&
      !needs(cl.id)
    ) {
      dead.add(cl.id)
    }
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const c of dead) {
      const read = [...clusters[c]!.declares].some((s) =>
        refs.valueRefsOf(s).some((ref) => {
          // a reader outside the dead, or inside erased text (an orphan of
          // ours, decided by provenance), is a real reader
          const owner = clusterOfRegion.get(regions.ownerOf(ref))
          return owner === undefined || !dead.has(owner) || !liveInEnv(ref)
        }),
      )
      if (read) {
        dead.delete(c)
        changed = true
      }
    }
  }
  for (const c of dead) {
    followers.add(c)
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
    const kept = readsKept(c)
    if (kept !== undefined) {
      return { reason: 'reads', binding: kept }
    }
    if (needed.has(c)) {
      return events.volatile(c) ?? events.writeConflict(c, to, slotOf)
    }
    return { reason: 'unneeded' }
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
  // candidates only cancel) or roots a follower in one more split output,
  // so the rounds end within the cluster count plus the followers' outputs
  // (P5), and every decision was taken over the final env roots.
  const pinnedNeeded = new Map<ClusterId, Pin>()
  const cancelled = new Map<ClusterId, Pin>()
  const liveOwn = new Map<ClusterId, Pin>()
  // derived reach changes only with the candidates still extracted, or when
  // a cluster a derived output reaches becomes an env root (it then reads
  // what it evaluates in the env module)
  let derivedStale = remaining.size > 0
  // (a round that goes on demotes a cluster, roots a follower in one more
  // split output, or judges again the followers of a cancelled extraction:
  // all only grow)
  const roundCap =
    clusters.length +
    followers.size * Math.max(1, derivedRoots.size) +
    candidates.size
  for (let round = 0; ; round++) {
    if (round > roundCap) {
      throw new Error(
        `placement of ${input.canonicalId} did not settle within ${roundCap + 1} rounds (a compiler bug: please report it with this file)`,
      )
    }
    if (derivedStale) {
      derivedStale = false
      liveEnv = reach('env', envRoots)
      const stop = new Set([...remaining.keys(), ...members.keys()])
      const moduleOf = (c: ClusterId) =>
        remaining.get(c)?.output ?? members.get(c)
      // a chunk's reach passes through the candidates it copies and stops
      // at the others, which it imports from their extracted module (one
      // instance of state and effects); an extracted module's reach
      // stops at every other candidate (it imports them)
      const chunkStop = new Set(
        [...stop].filter((c) => members.has(c) || !copies(c)),
      )
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
      // (a follower of an extracted binding is rooted in its module, and
      // so is a member: pinned there, chunks import it)
      for (const [c, to] of follows) {
        derivedRoots.get(to)?.add(c)
      }
      for (const [c, to] of members) {
        pinned.set(c, to)
        derivedRoots.get(to)?.add(c)
      }
      for (const [id, from] of derivedRoots) {
        const own = [...from].some((c) => moduleOf(c) === id)
        derivedReach.set(
          id,
          reach(
            id,
            from,
            own
              ? new Set([...stop].filter((c) => moduleOf(c) !== id))
              : outputs.get(id)?.kind === 'export'
                ? stop
                : chunkStop,
          ),
        )
      }
    }
    liveEnv = reach('env', envRoots)
    // the followers judged once, before the slots: each is rooted in its
    // chunk (what its statements touch that nothing else needs follows
    // it), or an env root; then derived reach is recomputed
    if (round === 0 && followers.size > 0) {
      // (one that follows another follower is judged after it: an unused
      // chain follows what it reads transitively, recheck ruling D)
      const pending = [...followers].filter((c) => !envRoots.has(c))
      while (pending.length > 0) {
        const ready = pending.filter(
          (c) => !followed(c).some((d) => d !== c && pending.includes(d)),
        )
        // (a cycle: judged as they are)
        for (const c of ready.length > 0 ? ready : [...pending]) {
          judge(c)
          pending.splice(pending.indexOf(c), 1)
        }
      }
      derivedStale = true
      continue
    }
    // a follower whose extracted module was cancelled is judged again
    if (rejudge.size > 0) {
      for (const c of rejudge) {
        judge(c)
      }
      rejudge.clear()
      derivedStale = true
      continue
    }
    // a member the env module came to evaluate (a reader of it pinned
    // there: the module would run its later writes first, seed 12263), or
    // reading, at load, what the env module came to keep (an export
    // cancelled after it joined, seed 10112), leaves the module: judged
    // again below, as any cluster
    // (a follower is judged again: what it follows decides)
    let left = false
    for (const [m, to] of members) {
      if (
        liveEnv.has(m) ||
        readsKept(m) !== undefined ||
        (!followers.has(m) && events.volatile(m) !== undefined)
      ) {
        members.delete(m)
        pinned.delete(m)
        derivedRoots.get(to)?.delete(m)
        if (followers.has(m)) {
          rejudge.add(m)
        }
        left = true
      }
    }
    if (left) {
      derivedStale = true
      continue
    }
    // a cluster only one extracted module and split chunks need is that
    // module's (recheck ruling A: they import it from there), unless it
    // reads, at load, what the env module keeps, or code that runs later
    // writes it; a copy serves one that can be copied
    let joinedModule = false
    for (const cl of remaining.size > 0 ? clusters : []) {
      if (
        cl.kind !== 'declaration' ||
        cl.exported ||
        cl.copyable ||
        members.has(cl.id) ||
        remaining.has(cl.id) ||
        liveEnv.has(cl.id) ||
        envRoots.has(cl.id) ||
        follows.has(cl.id) ||
        joined.has(cl.id)
      ) {
        continue
      }
      const where = needersOf(cl.id).filter(
        (o) => outputs.get(o)?.kind !== 'provider',
      )
      const modules = where.filter(extractedOutput)
      if (
        modules.length !== 1 ||
        where.length < 2 ||
        !where.every((o) => lazy(o) || extractedOutput(o)) ||
        duplicable(cl.id) ||
        readsKept(cl.id) !== undefined ||
        events.volatile(cl.id) !== undefined ||
        // (a binding something assigns, or a split option writes, lives
        // with its writers: the single-writer rule, as for a candidate)
        [...cl.declares].some(
          (sym) =>
            t1.mutation.isReassigned(sym, liveInEnv) ||
            graph.regionWrittenSyms.has(sym),
        )
      ) {
        continue
      }
      members.set(cl.id, modules[0]!)
      joinedModule = true
    }
    if (joinedModule) {
      derivedStale = true
      continue
    }
    // a follower whose bindings' places grew to several split outputs
    // joins them (one cluster with what it uses, R151), as round 0 would
    // have rooted it; a joined one gains a new output the same way
    let grew = false
    for (const c of [...follows.keys(), ...joined.keys()]) {
      if (members.has(c)) {
        continue
      }
      const places: Array<OutputId> = []
      for (const d of followed(c)) {
        if (d !== c && clusters[d]!.copyable) {
          continue
        }
        for (const n of placesOf(d)) {
          if (!places.includes(n)) {
            places.push(n)
          }
        }
      }
      const was = joined.get(c) ?? [follows.get(c)!]
      if (
        places.length < 2 ||
        !places.every(lazy) ||
        places.every((o) => was.includes(o))
      ) {
        continue
      }
      follows.delete(c)
      joined.set(c, places)
      for (const o of places) {
        derivedRoots.get(o)!.add(c)
      }
      grew = true
    }
    if (grew) {
      derivedStale = true
      continue
    }
    solveSlots()
    let changed = false
    // a joined follower one of whose bindings came to stay stays with it
    for (const [c, to] of joined) {
      const d = followed(c).find(
        (x) =>
          x !== c &&
          !clusters[x]!.copyable &&
          (liveEnv.has(x) || envRoots.has(x)),
      )
      if (d === undefined && !liveEnv.has(c)) {
        continue
      }
      joined.delete(c)
      for (const o of to) {
        derivedRoots.get(o)!.delete(c)
      }
      keepFollower(c, d === undefined ? { reason: 'needers' } : stayPin(c, d))
      derivedStale = true
      changed = true
    }
    // (in cluster order: the reports of the kept follow it)
    for (const { id: c } of clusters) {
      const pin = pins.get(c)
      if (pin === undefined) {
        continue
      }
      const follow = follows.get(c)
      if (follow !== undefined) {
        // a follower kept: an env root, what it touches live there (it
        // declares nothing a chunk needs, or what it declares is reported
        // as an augmented root's write, `kept.ts`)
        follows.delete(c)
        derivedRoots.get(follow)!.delete(c)
        keepFollower(c, pin)
        derivedStale = true
        changed = true
        continue
      }
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
        members.has(cl.id) ||
        !neededByStaticOutput(cl.id)
      ) {
        continue
      }
      if (readsKept(cl.id) !== undefined) {
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
      if (pin.reason === 'live' && needed.has(c)) {
        const own =
          events.volatile(c) ?? events.writeConflict(c, e.output, slotOf)
        if (own !== undefined) {
          liveOwn.set(c, own)
        }
      }
      remaining.delete(c)
      envRoots.add(c)
      for (const k of e.companions) {
        envRoots.add(k)
      }
      // what followed or joined it there is judged again (a follower,
      // in the next round, with the module cancelled)
      for (const [f, to] of follows) {
        if (to === e.output) {
          follows.delete(f)
          rejudge.add(f)
        }
      }
      for (const [m, to] of members) {
        if (to === e.output) {
          members.delete(m)
          pinned.delete(m)
          if (followers.has(m)) {
            rejudge.add(m)
          }
        }
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
    liveOwn,
    copied: new Set([...remaining.keys()].filter(copies)),
    movable,
    pinnedNeeded,
    joined,
    joinedWith: new Map(
      [...joined.keys()].map((c) => [c, followed(c).filter((d) => d !== c)]),
    ),
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
    // what follows it there (a statement, its slots, its members) stays
    // with it
    for (const d of roots.derivedRoots.get(e.output) ?? []) {
      roots.pinned.delete(d)
      roots.envRoots.add(d)
    }
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
