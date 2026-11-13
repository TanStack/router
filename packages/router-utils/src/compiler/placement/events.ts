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
 * - **O** (order): a read and a write of a binding when the module loads
 *   keep their order (`writeConflict`); effects have no order of their own
 *   beyond the bindings they read and write (no order rule): what moves keeps
 *   its source order in its output, what stays in the route module,
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
 *   An effect reading, at load, another cluster with an effect has no rule
 *   of its own either: what it reads evaluates first wherever it goes (the
 *   env module, an extracted module or a shared module the chunk imports,
 *   or the same chunk, in source order), and a `let` nothing assigns is
 *   read like a `const`; an assigned one is judged by its writes (V, O).
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
 * (`factsOf`). A module that writes no module binding asks none of it.
 */
import { changesAsArgument, changesObject } from '../units'
import { callChangesNothing } from '../purity'
import { NEED_KINDS } from './clusters'
import type { ClusterGraph, ClusterId, Write } from './clusters'
import type { ReadIndex } from './reads'
import type { Node } from 'yuku'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { RegionId, UnitId } from '../units'
import type { OutputId } from '../rewrite'
import type { Fallback, Home, KeptReason, PlacementInput } from '../reach'

/** A module binding of another cluster an evaluation touches, and where it runs. */
export interface Touch {
  sym: SymbolId
  at: number
  cluster: ClusterId
  /** The region whose evaluation touches it. */
  region: RegionId
}

/** What statements change (`Events.unitChanges`, `Events.statementChanges`). */
export interface StatementChanges {
  /** The module bindings they change (assign, write a member of, call a method on, hand to a function of the module that changes it), in source order; what the warnings word as `changes` (else `uses`). */
  syms: ReadonlyArray<SymbolId>
  /** The module bindings they use (read or change, not imports), and the objects those may hold, in source order: what they follow (R149). */
  reads: ReadonlyArray<SymbolId>
  /** The imports they read: where none of `clusters` decides, their users' one chunk does (imports go wherever their users go; every output imports one itself, so none keeps a statement). */
  imports: ReadonlyArray<SymbolId>
  /** What they follow, the statement's own cluster aside: the clusters of `reads` (R149; R148: dead code follows what it reads, like a statement). */
  clusters: ReadonlyArray<ClusterId>
}

/** Per written binding an evaluation touches, its first and last touch: they decide every comparison with a write. */
type Spans = ReadonlyMap<SymbolId, { first: number; last: number }>

/**
 * Why a cluster stays in the env module: the violated pair. `reason` is the
 * kind as `Placement.kept` words it; `other` the second event, a write
 * (`written`, `state`: the write the read observes); `binding` what the pair shares
 * (`state`, `reads`). A one-event cause (`needers`, `effects`, `live`,
 * `shared`) has neither.
 */
export interface Pin {
  reason: KeptReason
  other?: { at: number }
  binding?: SymbolId
  /** `written`: the split output using `binding` (another than the subject's), or the subject's second one. */
  in?: OutputId
  /** `written`: the statement only uses the subject (it changes none of its bindings). */
  uses?: boolean
  /** `written`: the statement changes `binding` (else it uses it). */
  bindingChanged?: boolean
  /** `written`: the statement is several statements, one of which can change `binding` on its own. */
  split?: boolean
  /** `written`: the follower is unused code (R148), this declaration. */
  unused?: SymbolId
  /** `written`: code that runs later changes what the statement uses, there (V). */
  later?: number
  /** `written`: the binding of the code that uses `binding` when the module loads, which the statement's own code changes later (V). */
  reader?: SymbolId
  /**
   * `state`: the evaluation touches `binding` only in what it hands to a
   * call, which may or may not run it then: the callee as written (`''`:
   * too long to quote).
   */
  handedTo?: string
}

export interface Events {
  /** V: the pair of `c`'s first touch of a binding something outside it writes at an unknown time. */
  volatile: (c: ClusterId) => Pin | undefined
  /** When V holds nothing: the pair of `c`'s first touch of a binding something outside it writes after it when the module loads (O orders `c` against a write: its slot matters). */
  ordered: (c: ClusterId) => Pin | undefined
  /** The rules of a lazy slot after N: `written`, then V; V holds unless every write it meets runs where `inside` says (in the slot itself: recheck ruling C). */
  lazyConflict: (
    c: ClusterId,
    inside?: (w: Write) => boolean,
  ) => Pin | undefined
  /** Another cluster than `c` whose evaluation touches `sym` when the module loads, the first one, if any (who reads what `c`'s own code writes later). */
  loadToucher: (sym: SymbolId, c: ClusterId) => ClusterId | undefined
  /**
   * What moves with cluster `c` and binding `sym` to a module of their own,
   * which evaluates before the env module's body (the move a `state` report
   * offers): what they touch when the module loads (left behind, that
   * module would import it back from the env module: a cycle), the code
   * writing a moved binding when the module loads or assigning it at any
   * time (an imported binding is read-only), and what touches a moved
   * binding when the module loads before one of its writes then (moved, the
   * write would run first: O). `syms`: the moved bindings (of an import,
   * the ones reached).
   */
  movedWith: (
    c: ClusterId,
    sym: SymbolId,
  ) => { clusters: Set<ClusterId>; syms: Set<SymbolId> }
  /** T: the first non-copyable binding of a cluster `kept` says the env module keeps that `c` reads at its evaluation, if any (one of the source before a generated one). */
  readsKept: (
    c: ClusterId,
    kept: (d: ClusterId) => boolean,
  ) => SymbolId | undefined
  /** O: the pair of a write at load that changes order with `c`'s read when `c` evaluates in `to`, the writer's cluster in `slot`. */
  writeConflict: (
    c: ClusterId,
    to: OutputId,
    slot: (d: ClusterId) => OutputId,
  ) => Pin | undefined
  /**
   * The module bindings statement `u` (an effect unit, or a declaration
   * followed as dead code) uses (R149): those its text names and those it
   * runs (`ReadIndex.runs`, when it calls something), and the objects their
   * values may hold (`MutationModel.heldBy`, the one owner of "the object a
   * binding names": `alias.add()` uses `table` through `const alias =
   * table`); imports apart (none keeps a statement). Which of them it
   * changes (`changesObject`, `changesAsArgument`; a call the purity model
   * knows changes nothing) only words the warnings. Once per unit.
   */
  unitChanges: (u: UnitId) => StatementChanges
  /** `unitChanges` of the statements and declarations of cluster `c`, together: what a follower (a statement, or dead code: R148) follows (`settle.ts`). */
  statementChanges: (c: ClusterId) => StatementChanges
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
  const { t1, outputs } = input
  const { symbols } = t1
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
    everyCallRuns = false,
  ): boolean => {
    const touch = (sym: SymbolId, at: number): boolean => {
      const d = clusterOfSym.get(sym)
      return (
        d !== undefined && d !== c && visit({ sym, at, cluster: d, region: r })
      )
    }
    // (and what the generated text of what it runs names: a server fn a
    // planner moved out of a body it calls)
    return reads.runs(
      r,
      (ref, at) =>
        NEED_KINDS.has(ref.kind) &&
        symbols.isModuleLevel(ref.sym) &&
        touch(ref.sym, at),
      (g, at) => symbols.isModuleLevel(g.sym) && touch(g.sym, at),
      everyCallRuns,
    )
  }
  /** What `c`'s evaluation touches; `everyCallRuns`: as if every call ran what it is handed (the extraction check, R152). */
  function touches(
    c: ClusterId,
    visit: (t: Touch) => boolean,
    everyCallRuns = false,
  ): boolean {
    for (const r of clusters[c]!.regions) {
      if (touchesOfRegion(r, c, visit, everyCallRuns)) {
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
    return touchersOf(sym).every((d) => d === c)
  }
  function touchersOf(sym: SymbolId): Array<ClusterId> {
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
    return touchers
  }

  /**
   * The callee of the call a touch is handed to (a function it is handed
   * holds the touch, or a name handed to it is the touch), if any: what
   * that call does with it is unknown (R152 holds only what the framework
   * calls later).
   */
  const handedTo = (t: Touch): string | undefined => {
    const calls = graph.callsOf(t.region)
    if (calls === null) {
      return undefined
    }
    const call =
      calls.callbacks.find((f) => f.argument && f.start <= t.at && t.at < f.end)
        ?.call ?? calls.names.find((n) => n.start === t.at)?.call
    if (call === undefined) {
      return undefined
    }
    const callee = input.code.slice(call.calleeStart, call.calleeEnd)
    return callee.length > 40 || callee.includes('\n') ? '' : callee
  }
  const statePin = (c: ClusterId, t: Touch, w: Write): Pin => {
    const handed = handedTo(t)
    return {
      reason: 'state',
      other: { at: w.at },
      binding: t.sym,
      // (only through what it hands to calls: no touch of it elsewhere)
      ...(handed !== undefined &&
        !touches(c, (u) => u.sym === t.sym && handedTo(u) === undefined) && {
          handedTo: handed,
        }),
    }
  }

  /*
   * What no round changes of `c`'s evaluation, walked once per cluster:
   * its first touch of a binding written outside it at an unknown time
   * (V); before it, the first one a write at load after it orders (O's
   * reader); and per written binding, its first and last touch.
   */
  interface Facts {
    late: Pin | null
    later: Pin | null
    spans: Map<SymbolId, { first: number; last: number }>
  }
  const NONE: Facts = { late: null, later: null, spans: new Map() }
  const factsOf: Array<Facts | undefined> = []
  function facts(c: ClusterId): Facts {
    let hit = factsOf[c]
    if (hit !== undefined) {
      return hit
    }
    if (graph.writes.length === 0) {
      return (factsOf[c] = NONE)
    }
    const found: Facts = { late: null, later: null, spans: new Map() }
    // (a walk meets one binding many times in a row: the last span is kept)
    let lastSym: SymbolId | -1 = -1
    let lastSpan: { first: number; last: number } | undefined
    touches(c, (t) => {
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
      // (the walk goes on past V: a cluster V pins may still take the slot
      // its later writers run in, recheck ruling C, and O then compares
      // every span with the writes at load: round tools class A)
      if (found.late !== null) {
        return false
      }
      const w = graph.lateWrite(t.sym, c)
      if (w !== undefined && !ownLate(c, t.sym)) {
        found.late = statePin(c, t, w)
        return false
      }
      if (found.later === null) {
        const l = graph.laterWrite(t.sym, t.at, c)
        if (l !== undefined) {
          found.later = statePin(c, t, l)
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

  /** Every late write (V) of what cluster `c` touches, its own aside. */
  const lateWritesOf = (c: ClusterId): Array<Write> => {
    const out: Array<Write> = []
    const seen = new Set<SymbolId>()
    touches(c, (t) => {
      if (!seen.has(t.sym)) {
        seen.add(t.sym)
        if (!ownLate(c, t.sym)) {
          out.push(...graph.lateWrites(t.sym, c))
        }
      }
      return false
    })
    return out
  }

  function lazyConflict(
    c: ClusterId,
    inside?: (w: Write) => boolean,
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
    // (a unit that is no declaration and no own augmentation makes its
    // cluster an effect, which the lazy slot rules are not asked of)
    const late = volatile(c)
    // (every later writer another cluster's, in the slot: the slot
    // evaluates the reader before any of its functions run, so V does not
    // hold, ruling C; a write of `c`'s own text is `c` writing what code
    // elsewhere reads, which moving it reorders)
    if (late !== undefined && inside !== undefined) {
      const writes = lateWritesOf(c)
      if (
        writes.length > 0 &&
        writes.every(
          (w) =>
            w.owner !== null && clusterOfRegion.get(w.owner) !== c && inside(w),
        )
      ) {
        return undefined
      }
    }
    return late
  }

  function readsKept(
    c: ClusterId,
    kept: (d: ClusterId) => boolean,
  ): SymbolId | undefined {
    // (a binding of the source first: one a planner generated exists in
    // this build only, and is not reported when it is the only one)
    let found: SymbolId | undefined
    // (every call runs what it is handed: an extracted export evaluates
    // before the route module, and a call holding a function reading what
    // that module keeps may run it then, R152)
    touches(
      c,
      (t) => {
        if (!clusters[t.cluster]!.copyable && kept(t.cluster)) {
          if (symbols.kind(t.sym) === 'source') {
            found = t.sym
            return true
          }
          found ??= t.sym
        }
        return false
      },
      true,
    )
    return found
  }

  function movedWith(
    c: ClusterId,
    sym: SymbolId,
  ): { clusters: Set<ClusterId>; syms: Set<SymbolId> } {
    const moved = new Set<ClusterId>()
    const syms = new Set<SymbolId>()
    const queue: Array<ClusterId> = []
    const pending: Array<SymbolId> = [sym]
    const enter = (d: ClusterId) => {
      if (moved.has(d)) {
        return
      }
      moved.add(d)
      queue.push(d)
      // (an import moves only the bindings reached: every module imports
      // its own)
      if (clusters[d]!.kind !== 'import') {
        pending.push(...clusters[d]!.declares)
      }
    }
    enter(c)
    const home = clusterOfSym.get(sym)
    if (home !== undefined) {
      enter(home)
    }
    while (queue.length > 0 || pending.length > 0) {
      const d = queue.pop()
      if (d !== undefined) {
        touches(d, (t) => {
          enter(t.cluster)
          pending.push(t.sym)
          return false
        })
        continue
      }
      const s = pending.pop()!
      if (syms.has(s)) {
        continue
      }
      syms.add(s)
      let last = -1
      for (const w of writesOfSym.get(s) ?? []) {
        if (!w.live || (!w.eager && w.member)) {
          continue
        }
        if (w.eager) {
          last = Math.max(last, w.at)
        }
        const wc = w.owner === null ? undefined : clusterOfRegion.get(w.owner)
        if (wc !== undefined) {
          enter(wc)
        }
      }
      if (last >= 0) {
        for (const d2 of touchersOf(s)) {
          if (
            !moved.has(d2) &&
            touches(d2, (t) => t.sym === s && t.at < last)
          ) {
            enter(d2)
          }
        }
      }
    }
    return { clusters: moved, syms }
  }

  const isStatic = (o: OutputId | undefined) =>
    o !== undefined && outputs.get(o)?.kind === 'export'

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
      // (`wrap(flag ? render : Fallback)`, `render` writing `seen`) pins it
      // only when another evaluation touches the binding at load (`used`):
      // one the route module keeps for a later reader is written later
      // wherever that function runs (small item 2b, R149 answer D).
      touchesOfRegion(r.id, c, (t) => {
        if (!writesOfSym.has(t.sym)) {
          return false
        }
        const late = lateOf(t.sym)
        const later = graph.laterWrite(t.sym, t.at, c) !== undefined
        const why =
          late === 'inside' &&
          !ownLate(c, t.sym) &&
          unconfined(c, hr!, t.sym) === 'used'
            ? 'used'
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

  const known = (call: Node) => callChangesNothing(t1.purity, call)
  const NO_CHANGES: StatementChanges = {
    syms: [],
    reads: [],
    imports: [],
    clusters: [],
  }
  /** The clusters `c` follows: of every module binding it uses. */
  const followed = (
    own: ClusterId | undefined,
    used: Iterable<SymbolId>,
  ): Array<ClusterId> => {
    const out: Array<ClusterId> = []
    for (const s of used) {
      const d = clusterOfSym.get(s)
      if (d !== undefined && d !== own && !out.includes(d)) {
        out.push(d)
      }
    }
    return out
  }
  const changesOfUnit = new Map<UnitId, StatementChanges>()
  function unitChanges(u: UnitId): StatementChanges {
    let hit = changesOfUnit.get(u)
    if (hit !== undefined) {
      return hit
    }
    const unit = t1.units[u]!
    const file = t1.purity.file
    const syms = new Set<SymbolId>()
    const read = new Set<SymbolId>()
    const imported = new Set<SymbolId>()
    // what its text names (a function's body too: dead code follows what
    // it reads, R148) and what it runs, with the objects those may hold
    const noteRead = (ref: ClassifiedRef) => {
      if (
        !NEED_KINDS.has(ref.kind) ||
        !symbols.isModuleLevel(ref.sym) ||
        !graph.isLive(ref, 'env')
      ) {
        return
      }
      if (symbols.isImport(ref.sym)) {
        imported.add(ref.sym)
        return
      }
      read.add(ref.sym)
      for (const h of t1.mutation.heldBy(ref)) {
        if (!symbols.isImport(h)) {
          read.add(h)
        }
      }
    }
    for (const ref of t1.refs.refsIn(unit.range)) {
      noteRead(ref)
    }
    const calls = graph.callsOf(unit.region) !== null
    reads.runs(unit.region, (ref) => {
      if (
        !symbols.isModuleLevel(ref.sym) ||
        !graph.isLive(ref, 'env') ||
        (!calls &&
          (ref.range.start < unit.range.start ||
            ref.range.end > unit.range.end))
      ) {
        return false
      }
      noteRead(ref)
      // what it changes (the warnings word it: `changes` or `uses`): in
      // its text or a function body it runs, not a writer of a name it
      // reads (`cfg.n = 1` after `table.setup(cfg)`)
      if (
        (ref.range.start < unit.range.start ||
          ref.range.end > unit.range.end) &&
        !t1.isLazyAt(ref.range.start)
      ) {
        return false
      }
      let changed: ReadonlyArray<SymbolId> = []
      if (ref.kind === 'write') {
        changed = [ref.sym]
      } else if (ref.kind === 'value') {
        const node = t1.nodeAt(ref.range.start)
        if (
          node !== null &&
          (changesObject(file, node, known) ||
            changesAsArgument(file, node, known))
        ) {
          changed =
            ref.memberWrite &&
            !ref.readsThrough &&
            t1.mutation.ownsObject(ref.sym)
              ? [ref.sym]
              : [ref.sym, ...t1.mutation.heldBy(ref)]
        }
      }
      for (const s of changed) {
        if (!symbols.isImport(s)) {
          syms.add(s)
        }
      }
      return false
    })
    const own = clusterOfRegion.get(unit.region)
    hit =
      read.size === 0 && imported.size === 0
        ? NO_CHANGES
        : {
            syms: [...syms],
            reads: [...read],
            imports: [...imported],
            clusters: followed(own, read),
          }
    changesOfUnit.set(u, hit)
    return hit
  }

  const changesOfCluster = new Map<ClusterId, StatementChanges>()
  function statementChanges(c: ClusterId): StatementChanges {
    let hit = changesOfCluster.get(c)
    if (hit !== undefined) {
      return hit
    }
    const syms: Array<SymbolId> = []
    const read: Array<SymbolId> = []
    const imported: Array<SymbolId> = []
    for (const u of clusters[c]!.units) {
      const kind = t1.units[u]!.kind
      if (
        (kind !== 'effect' && kind !== 'declaration') ||
        !graph.unitSurvives(u)
      ) {
        continue
      }
      const one = unitChanges(u)
      for (const s of one.syms) {
        if (!syms.includes(s)) {
          syms.push(s)
        }
      }
      for (const s of one.reads) {
        if (!read.includes(s)) {
          read.push(s)
        }
      }
      for (const s of one.imports) {
        if (!imported.includes(s)) {
          imported.push(s)
        }
      }
    }
    hit =
      read.length === 0 && imported.length === 0
        ? NO_CHANGES
        : {
            syms,
            reads: read,
            imports: imported,
            clusters: followed(c, read),
          }
    changesOfCluster.set(c, hit)
    return hit
  }

  return {
    volatile,
    ordered,
    unitChanges,
    statementChanges,
    lazyConflict,
    loadToucher: (sym, c) => touchersOf(sym).find((d) => d !== c),
    movedWith,
    readsKept,
    writeConflict,
    fallbacks,
  }
}
