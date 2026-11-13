/**
 * Placement, stage 5: what only lazy outputs need that stays in the env
 * module, with the reason (`Placement.kept`, worded for the user by
 * `kept-diagnostics.ts`). The exported declarations a chunk reaches that are
 * not extracted, and the unexported clusters a rule of the event table kept
 * (evaluation order, writes, eager reads), reported once at the cause and
 * only when the env module does not need them anyway, worded from the
 * violated pair (`Pin`: the other event, the binding).
 */
import { statementsIn } from '../units'
import { derivedNeeds } from './settle'
import { NEED_KINDS } from './clusters'
import type { Cluster, ClusterGraph, ClusterId, Write } from './clusters'
import type { ReadIndex } from './reads'
import type { Seeds } from './roots'
import type { Events, Pin } from './events'
import type { Roots } from './settle'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { OutputId } from '../rewrite'
import type { KeptDeclaration, PlacementInput } from '../reach'
import type { RegionId, UnitId } from '../units'

export function keptDeclarations(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  events: Events,
  seeds: Seeds,
  roots: Roots,
): Array<KeptDeclaration> {
  const { t1, outputs } = input
  const extractions = input.extractions ?? new Map<SymbolId, OutputId>()
  const { units, symbols } = t1
  const { regions } = input.rewrites
  const { clusters, clusterOfSym } = graph
  const { cancelled, derivedReach, envRoots, remaining } = roots
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')

  const lazyNeeders = (c: ClusterId): Array<OutputId> => {
    const out: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      const kind = outputs.get(id)?.kind
      if (set.has(c) && kind !== 'export' && kind !== 'provider') {
        out.push(id)
      }
    }
    return out
  }
  /** The derived outputs needing `c`, a provider's copy aside. */
  const needersOf = (c: ClusterId): Array<OutputId> => {
    const out: Array<OutputId> = []
    for (const [id, set] of derivedReach) {
      if (set.has(c) && outputs.get(id)?.kind !== 'provider') {
        out.push(id)
      }
    }
    return out
  }
  const declaringRange = (cl: Cluster, sym: SymbolId | undefined) => {
    const declaring =
      sym === undefined ? undefined : (t1.declaringUnits.get(sym) ?? [])[0]
    const range =
      declaring === undefined
        ? regions.get(cl.regions[0]!).range
        : units[declaring]!.range
    return { start: range.start, end: range.end }
  }
  /** The clusters that stay in the env module whatever moves: the route options' (the declaration holding a claimed region) and generated code. */
  let fixed: Set<ClusterId> | undefined
  /**
   * The move a `state`, `reads` or `written` report offers
   * (`Events.movedWith`): what moves with cluster `c` and `read`, named, or
   * what keeps it from moving. `named`: the statement a `written` report
   * names already (its position), neither listed nor counted as a write.
   */
  const moveOf = (
    c: ClusterId,
    read: SymbolId,
    named?: number,
  ): Pick<KeptDeclaration, 'moves' | 'stuck'> => {
    if (fixed === undefined) {
      fixed = new Set()
      for (const claim of input.rewrites.claims.values()) {
        const u = t1.unitAt(regions.get(claim.region).range)
        const x =
          u === null ? undefined : graph.clusterOfRegion.get(units[u]!.region)
        if (x !== undefined) {
          fixed.add(x)
        }
      }
    }
    const moved = events.movedWith(c, read)
    const source = (s: SymbolId) =>
      symbols.isModuleLevel(s) && symbols.kind(s) === 'source'
    for (const d of moved.clusters) {
      const cl = clusters[d]!
      if (fixed.has(d) || cl.gens.length > 0) {
        const sym = [...cl.declares].find(source)
        return { stuck: { ...(sym !== undefined && { sym }), at: cl.start } }
      }
    }
    const syms: Array<SymbolId> = []
    const statements: Array<number> = []
    const statement =
      named === undefined ? null : t1.unitAt({ start: named, end: named })
    const inStatement = (at: number) =>
      statement !== null &&
      at >= units[statement]!.range.start &&
      at < units[statement]!.range.end
    /** Whether `d` writes a moved binding when the module loads (a statement writing them). */
    const writes = (d: ClusterId) =>
      graph.writes.some(
        (w) =>
          w.live &&
          w.eager &&
          moved.syms.has(w.sym) &&
          w.owner !== null &&
          !inStatement(w.at) &&
          graph.clusterOfRegion.get(w.owner) === d,
      )
    for (const d of moved.clusters) {
      if (d === c) {
        continue
      }
      const cl = clusters[d]!
      // (an import is named when the module writes it then: the
      // statements writing it move)
      const own = [...cl.declares].filter(
        (s) =>
          s !== read &&
          source(s) &&
          (cl.kind !== 'import' ||
            (moved.syms.has(s) &&
              (graph.writesOfSym.get(s) ?? []).some((w) => w.live && w.eager))),
      )
      if (own.length > 0) {
        syms.push(...own)
      } else if (
        cl.kind !== 'import' &&
        !cl.declares.has(read) &&
        !writes(d) &&
        !inStatement(cl.start)
      ) {
        statements.push(cl.start)
      }
    }
    const at = (s: SymbolId) =>
      declaringRange(clusters[clusterOfSym.get(s)!]!, s).start
    syms.sort((a, b) => at(a) - at(b))
    statements.sort((a, b) => a - b)
    const written = [...moved.clusters].some(writes)
    return syms.length === 0 && statements.length === 0 && !written
      ? {}
      : { moves: { syms, statements, written } }
  }
  /** The pair's other event and binding, as a record words them. */
  const pairOf = (c: ClusterId, pin: Pin): Partial<KeptDeclaration> => {
    const other = pin.other
    // (`written`: the move of it and the binding the statement also uses,
    // or, when code that runs later changes it too, of it alone; the
    // statement is named already)
    const subject =
      pin.reason === 'written' &&
      (pin.later !== undefined || pin.binding === undefined)
        ? [...clusters[c]!.declares].find((s) => symbols.isModuleLevel(s))
        : pin.binding
    return {
      ...((pin.reason === 'state' ||
        pin.reason === 'reads' ||
        pin.reason === 'written') &&
        subject !== undefined &&
        moveOf(c, subject, pin.reason === 'written' ? other?.at : undefined)),
      // (`state`: only a write when the module loads, O, has a place in
      // that order to name; one at an unknown time, V, has none)
      ...(other !== undefined &&
        (pin.reason === 'written' ||
          (pin.reason === 'state' &&
            graph.writes.some((w) => w.at === other.at && w.eager))) && {
          at: other.at,
        }),
      ...(pin.binding !== undefined && { read: pin.binding }),
      ...(pin.in !== undefined && { in: pin.in }),
      ...(pin.uses === true && { uses: true }),
      ...(pin.bindingChanged === true && { readChanged: true }),
      ...(pin.split === true && { split: true }),
      ...(pin.later !== undefined && { later: pin.later }),
      ...(pin.reader !== undefined && { reader: pin.reader }),
      ...(pin.handedTo !== undefined && { handedTo: pin.handedTo }),
    }
  }
  /**
   * An export statement (`export { x as y }`, `export default x`) that
   * re-exports only causes: it evaluates nothing, so it needs nothing beyond
   * the export itself (one re-exporting anything else roots that).
   */
  const gluesCauses = (c: ClusterId): boolean => {
    const cl = clusters[c]!
    if (
      cl.kind !== 'export' ||
      !cl.units.every((u) => {
        const { kind, node } = units[u]!
        return (
          kind === 'export-specifier' ||
          (kind === 'export-default' &&
            node.type === 'ExportDefaultDeclaration' &&
            node.declaration.type === 'Identifier')
        )
      })
    ) {
      return false
    }
    let any = false
    for (const s of reads.clusterReads(c, 'env', false).syms) {
      const d = symbols.isModuleLevel(s) ? clusterOfSym.get(s) : undefined
      if (d === undefined || d === c) {
        continue
      }
      if (!causes.has(d)) {
        return false
      }
      any = true
    }
    return any
  }

  // The causes, reported once each: an exported declaration a chunk
  // reaches that is not extracted (no candidate: assigned; or cancelled,
  // with its cause), the unexported clusters a
  // rule kept, and the clusters an augmentation roots up front
  // (`written`). An exported declaration the env module reads (`live`)
  // would stay there without split code: nothing to report.
  const causes = new Map<ClusterId, Pin>()
  /** Exports cancelled `live` with a violation of their own (`Roots.liveOwn`). */
  const liveOwn: Array<{ c: ClusterId; sym: SymbolId; pin: Pin }> = []
  /** The exported causes: each binding with its own reason. */
  const exported = new Map<ClusterId, Array<{ sym: SymbolId; pin: Pin }>>()
  for (const [sym] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined || remaining.has(c)) {
      continue
    }
    const cl = clusters[c]!
    if (
      (cl.kind !== 'declaration' && cl.kind !== 'effect') ||
      cl.gens.length > 0
    ) {
      continue
    }
    const cause: Pin = cancelled.get(c) ?? { reason: 'live' }
    // (not reported: one no split code reaches, and one kept by a binding a
    // planner generated, which exists in this build only, like a candidate
    // some output renders otherwise: a server fn Start moves out of a
    // function the export calls)
    if (
      lazyNeeders(c).length === 0 ||
      (cause.reason === 'reads' &&
        cause.binding !== undefined &&
        symbols.kind(cause.binding) !== 'source')
    ) {
      continue
    }
    if (cause.reason === 'live') {
      // (its own violation, reported unless a statement report names it
      // or the env module needs it of its own: below)
      const own = roots.liveOwn.get(c)
      if (own !== undefined) {
        liveOwn.push({ c, sym, pin: own })
      }
      continue
    }
    const syms = exported.get(c)
    if (syms) {
      syms.push({ sym, pin: cause })
    } else {
      causes.set(c, cause)
      exported.set(c, [{ sym, pin: cause }])
    }
  }
  for (const [c, pin] of roots.pinnedNeeded) {
    if (!exported.has(c)) {
      causes.set(c, pin)
    }
  }
  // what a statement that stays changes, or uses when it changes no binding
  // (its own declarations, the clusters it follows: `statementChanges`),
  // and only split code needs stays with it: reported with why the
  // statement stays (`written`), the binding that keeps it aside (R146
  // amendment)
  const statements = new Set<ClusterId>()
  /** What unused code keeps in the env module or puts in a shared module: one report at it, naming all of it. */
  const unusedReports: Array<KeptDeclaration> = []
  /** Unused code that stays, reported once the env module's own needs are known (`envOwn`). */
  const unusedStays: Array<{ c: ClusterId; unused: SymbolId }> = []
  const unusedReport = (
    c: ClusterId,
    unused: SymbolId,
    shared: Array<OutputId> | null,
    keeps: (d: ClusterId) => boolean,
    more: ReadonlyArray<{ c: ClusterId; unused: SymbolId }> = [],
  ): void => {
    const syms: Array<SymbolId> = []
    const needers = new Set<OutputId>(shared ?? [])
    for (const d of new Set(
      [c, ...more.map((m) => m.c)].flatMap(
        (x) => events.statementChanges(x).clusters,
      ),
    )) {
      // (the unused code itself is named as such, not as what it puts
      // together)
      if (
        d === c ||
        more.some((m) => m.c === d) ||
        syms.some((s) => clusters[d]!.declares.has(s))
      ) {
        continue
      }
      const cl = clusters[d]!
      if (cl.kind === 'import' || cl.copyable || !keeps(d)) {
        continue
      }
      const lazy = lazyNeeders(d)
      if (shared === null && lazy.length === 0) {
        continue
      }
      for (const o of shared === null ? lazy : []) {
        needers.add(o)
      }
      for (const s of cl.declares) {
        if (symbols.isModuleLevel(s) && !symbols.isImport(s)) {
          syms.push(s)
        }
      }
    }
    if (syms.length === 0) {
      return
    }
    syms.sort(
      (a, b) =>
        declaringRange(clusters[clusterOfSym.get(a)!]!, a).start -
        declaringRange(clusters[clusterOfSym.get(b)!]!, b).start,
    )
    unusedReports.push({
      syms,
      exported: false,
      reason: 'unused',
      range: declaringRange(clusters[c]!, unused),
      needers: [...needers],
      unused,
      ...(more.length > 0 && {
        moreUnused: more.map((m) => ({
          sym: m.unused,
          at: declaringRange(clusters[m.c]!, m.unused).start,
        })),
      }),
      ...(shared !== null && { shared: true }),
    })
  }
  /**
   * Unused code joining bindings of several split outputs (R151), reported
   * only when deleting it separates them (recheck finding 2): a binding it
   * uses goes to the shared module only through joined code (one split
   * output needs it otherwise), and no joined statement uses it (a
   * statement keeps it there whatever is deleted). Unused code joining the
   * same such bindings is one report at the first of it, naming all of it:
   * deleting one of two changes nothing.
   */
  if (roots.joined.size > 0) {
    let bare: Array<Set<ClusterId>> | undefined
    /** How many split outputs reach `d` without joined code (rooted in each output it joins). */
    const bareNeeders = (d: ClusterId): number => {
      bare ??= [...roots.derivedRoots]
        .filter(([o]) => {
          const kind = outputs.get(o)?.kind
          return kind === 'split' || kind === 'hydrate'
        })
        .map(([o, from]) =>
          reads.reach(
            o,
            [...from].filter((x) => !roots.joined.has(x)),
            roots.joined,
          ),
        )
      return bare.filter((set) => set.has(d)).length
    }
    const unusedOf = new Map<ClusterId, SymbolId>()
    const joinedStatements: Array<ClusterId> = []
    for (const c of roots.joined.keys()) {
      const cl = clusters[c]!
      const unused = cl.units.some((u) => units[u]!.kind === 'effect')
        ? undefined
        : [...cl.declares].find((s) => symbols.isModuleLevel(s))
      if (unused === undefined) {
        joinedStatements.push(c)
      } else {
        unusedOf.set(c, unused)
      }
    }
    const separated = (c: ClusterId): Array<ClusterId> =>
      events.statementChanges(c).clusters.filter((d) => {
        const cl = clusters[d]!
        return (
          cl.kind !== 'import' &&
          !cl.copyable &&
          bareNeeders(d) === 1 &&
          !joinedStatements.some((j) =>
            events.statementChanges(j).clusters.includes(d),
          )
        )
      })
    const done = new Set<ClusterId>()
    const byPosition = [...unusedOf.keys()].sort(
      (a, b) =>
        declaringRange(clusters[a]!, unusedOf.get(a)).start -
        declaringRange(clusters[b]!, unusedOf.get(b)).start,
    )
    for (const c of byPosition) {
      const freed = done.has(c) ? [] : separated(c)
      if (freed.length === 0) {
        continue
      }
      // (and the unused code using that code: deleting `inner` alone would
      // leave `outer`, which calls it, naming nothing)
      const group = new Set([c])
      for (let grown = true; grown; ) {
        grown = false
        for (const x of byPosition) {
          if (
            !group.has(x) &&
            !done.has(x) &&
            events
              .statementChanges(x)
              .clusters.some((d) => freed.includes(d) || group.has(d))
          ) {
            group.add(x)
            grown = true
          }
        }
      }
      const more = byPosition.filter((x) => x !== c && group.has(x))
      for (const x of [c, ...more]) {
        done.add(x)
      }
      unusedReport(
        c,
        unusedOf.get(c)!,
        roots.joined.get(c)!,
        () => true,
        more.map((x) => ({ c: x, unused: unusedOf.get(x)! })),
      )
    }
  }
  /**
   * The binding of the other chunk a statement keeps, with the statement's
   * cluster (which reads it: reached from it is no cascade).
   */
  const mirrored = new Map<ClusterId, ClusterId>()
  const others: Array<{ d: ClusterId; c: ClusterId; pin: Pin }> = []
  for (const [c, pin] of seeds.stayPins) {
    if (!envRoots.has(c)) {
      continue
    }
    statements.add(c)
    // unused code that stays (R148): one report at it, naming what it keeps
    if (pin.unused !== undefined) {
      unusedStays.push({ c, unused: pin.unused })
      continue
    }
    const blocker =
      pin.binding === undefined ? undefined : clusterOfSym.get(pin.binding)
    // (what the env module evaluates with it: a binding whose value holds
    // a claimed option value does not keep that value there)
    const kept = reads.reach('env', [c])
    const changes = events.statementChanges(c)
    const named: Array<ClusterId> = []
    const reported = (d: ClusterId) =>
      !causes.has(d) &&
      kept.has(d) &&
      clusters[d]!.kind !== 'import' &&
      !clusters[d]!.copyable &&
      derivedNeeds(input, derivedReach, d)
    // (the statement the pin names: the follower's, or one of a cluster it
    // follows that names the other binding, `stayPin`)
    const at = pin.other?.at
    const statement = [c, ...changes.clusters]
      .flatMap((x) => clusters[x]!.units)
      .find((u) => units[u]!.range.start === at)
    const changesOf =
      statement === undefined
        ? changes.syms
        : events.unitChanges(statement).syms
    for (const d of clusters[c]!.declares.size > 0
      ? [c, ...changes.clusters]
      : changes.clusters) {
      if (d !== blocker && reported(d)) {
        named.push(d)
        // (the statement changes it, or only uses it)
        const changed = changesOf.some((s) => clusters[d]!.declares.has(s))
        causes.set(d, changed ? pin : { ...pin, uses: true })
      }
    }
    // a statement using a binding of an extracted module or a provider and
    // one of a split output (no module serves both) keeps both eager: the binding that keeps it is reported
    // too, named with another one it keeps (after every statement's own
    // reports: a statement changing it names it first)
    if (blocker !== undefined && reported(blocker)) {
      const another = changes.reads.find((s) => {
        const d = clusterOfSym.get(s)
        return d !== undefined && named.includes(d)
      })
      // (its output: a split one, or an extracted export's module)
      const elsewhere =
        another === undefined ? [] : needersOf(clusterOfSym.get(another)!)
      if (another !== undefined && elsewhere.length > 0) {
        const changed = changes.syms.includes(another)
        others.push({
          d: blocker,
          c,
          pin: {
            reason: pin.reason,
            ...(pin.other !== undefined && { other: pin.other }),
            binding: another,
            in: elsewhere[0],
            ...(changed && { bindingChanged: true }),
            // (the statement can change it in one of its own when it could
            // the binding keeping it)
            ...(changed && pin.split === true && { split: true }),
            ...(!changes.syms.some((s) =>
              clusters[blocker]!.declares.has(s),
            ) && {
              uses: true,
            }),
          },
        })
      }
    }
  }
  for (const { d, c, pin } of others) {
    if (!causes.has(d)) {
      mirrored.set(d, c)
      causes.set(d, pin)
    }
  }
  for (const { c, sym, pin } of liveOwn) {
    if (!causes.has(c)) {
      causes.set(c, pin)
      exported.set(c, [...(exported.get(c) ?? []), { sym, pin }])
    }
  }
  // what unused code keeps that the env module needs through nothing else
  // (an extraction cancelled because it reads it is reached through it)
  if (unusedStays.length > 0) {
    const own = reads.reach(
      'env',
      [...envRoots].filter(
        (c) =>
          !statements.has(c) &&
          cancelled.get(c)?.reason !== 'live' &&
          !gluesCauses(c),
      ),
    )
    for (const { c, unused } of unusedStays) {
      const reach = reads.reach('env', [c])
      unusedReport(c, unused, null, (d) => reach.has(d) && !own.has(d))
    }
  }
  // a statement writing, when the module loads, a binding the env module
  // uses and one only split code uses joins them (a binding's writers at
  // load join its cluster, `clusters.ts`): the second stays with the
  // first, reported at its declaration (recheck finding 4). A statement
  // joined so (a method the mutation model knows writes only its receiver:
  // `table.add(d)`) that uses a binding of another cluster only split code
  // needs keeps it too, as a statement following both does (`seeds`
  // `stayPins`): reported the same way (phase 6 step 3, P04b)
  const writtenTogether: Array<KeptDeclaration> = []
  /** What the env module evaluates for its own needs: not for a cause, a statement reported, or an export statement re-exporting causes. */
  const ownOfEnv = () =>
    reads.reach(
      'env',
      [...envRoots].filter(
        (c) => !causes.has(c) && !statements.has(c) && !gluesCauses(c),
      ),
    )
  let ownCache: Set<ClusterId> | undefined
  /** The write table by owner, once a cluster has a statement. */
  let writesByOwner: Map<RegionId, Array<Write>> | undefined
  let evaluated: Set<ClusterId> | undefined
  let claimed: Array<{ start: number; end: number }> | undefined
  for (const cl of clusters) {
    if (
      (cl.kind !== 'declaration' && cl.kind !== 'effect') ||
      !cl.units.some((u) => units[u]!.kind === 'effect')
    ) {
      continue
    }
    if (writesByOwner === undefined) {
      writesByOwner = new Map()
      for (const w of graph.writes) {
        if (w.owner !== null) {
          const list = writesByOwner.get(w.owner)
          if (list) {
            list.push(w)
          } else {
            writesByOwner.set(w.owner, [w])
          }
        }
      }
    }
    const writesOf = writesByOwner
    // (the statements of `cl` writing its bindings when the module loads,
    // with them)
    const joined: Array<{
      id: UnitId
      unit: (typeof units)[number]
      written: Array<SymbolId>
    }> = []
    for (const u of cl.units) {
      const unit = units[u]!
      if (unit.kind !== 'effect') {
        continue
      }
      const written = [
        ...new Set(
          (writesOf.get(unit.region) ?? [])
            .filter(
              (w) =>
                w.live &&
                w.eager &&
                cl.declares.has(w.sym) &&
                symbols.isModuleLevel(w.sym) &&
                !symbols.isImport(w.sym),
            )
            .map((w) => w.sym),
        ),
      ]
      if (written.length > 0) {
        joined.push({ id: u, unit, written })
      }
    }
    // (a statement writing two of its bindings, or using a binding of
    // another cluster split code needs: the one candidates, before the env
    // module's reach is walked)
    if (
      !joined.some(
        ({ id, written }) =>
          written.length > 1 ||
          events
            .unitChanges(id)
            .clusters.some(
              (x) =>
                x !== cl.id &&
                !clusters[x]!.copyable &&
                lazyNeeders(x).length > 0,
            ),
      )
    ) {
      continue
    }
    evaluated ??= reads.reach('env', envRoots)
    if (!evaluated.has(cl.id)) {
      continue
    }
    const ev = evaluated
    claimed ??= [...input.rewrites.claims.values()].map(
      (claim) => regions.get(claim.region).range,
    )
    const inClaimed = claimed
    /** Where the code holding `ref` evaluates, outside `cl` and `outside`: the env module (`env`), split code only (`split`: an option value a split output claims, or code the env module does not evaluate). */
    const usedAt = (
      ref: ClassifiedRef,
      outside = cl.id,
    ): 'env' | 'split' | null => {
      const u = t1.unitAt(ref.range)
      const x =
        u === null ? undefined : graph.clusterOfRegion.get(units[u]!.region)
      if (
        x === undefined ||
        x === cl.id ||
        x === outside ||
        !NEED_KINDS.has(ref.kind)
      ) {
        return null
      }
      return liveInEnv(ref) &&
        ev.has(x) &&
        !inClaimed.some(
          (r) => ref.range.start >= r.start && ref.range.end <= r.end,
        )
        ? 'env'
        : 'split'
    }
    for (const { id, unit, written } of joined) {
      const uses = written.map((sym) => {
        const at = t1.refs.refsOf(sym).map((ref) => usedAt(ref))
        return { sym, env: at.includes('env'), split: at.includes('split') }
      })
      const keptOne = uses.find((x) => x.env)
      if (keptOne === undefined) {
        continue
      }
      const free = uses.filter((x) => !x.env && x.split).map((x) => x.sym)
      const node = unit.node
      if (free.length > 0 && lazyNeeders(cl.id).length > 0) {
        writtenTogether.push({
          syms: free,
          exported: false,
          reason: 'written',
          range: declaringRange(cl, free[0]),
          needers: lazyNeeders(cl.id),
          at: unit.range.start,
          read: keptOne.sym,
          readChanged: true,
          // (a statement of several writes can change the kept binding in
          // one of its own)
          ...((statementsIn(node) > 1 ||
            (node.type === 'ExpressionStatement' &&
              node.expression.type === 'SequenceExpression')) && {
            split: true,
          }),
        })
        break
      }
      // a binding of another cluster the statement uses: kept by it alone
      // when only split code uses it otherwise (its uses in `cl`'s joined
      // statements aside), and the env module keeps `cl` for its own needs
      // (else `cl` is a cause, or its cascade, reported at the cause)
      ownCache ??= ownOfEnv()
      if (!ownCache.has(cl.id)) {
        continue
      }
      const inJoined = (ref: ClassifiedRef) =>
        joined.some(
          (j) =>
            ref.range.start >= j.unit.range.start &&
            ref.range.end <= j.unit.range.end,
        )
      const clusterOfRef = (ref: ClassifiedRef) => {
        const v = t1.unitAt(ref.range)
        return v === null
          ? undefined
          : graph.clusterOfRegion.get(units[v]!.region)
      }
      // what the statement uses (`Events.unitChanges`: what it names, runs,
      // and the objects those hold), its own cluster aside
      const changes = events.unitChanges(id)
      const followed = new Set(changes.clusters)
      /** Whether the env module uses `ref` outside the joined statements, `x` and what `within` allows (`cl`'s other code does: its declaration). */
      const usedByEnv = (
        ref: ClassifiedRef,
        x: ClusterId,
        within: (z: ClusterId) => boolean,
      ) => {
        if (inJoined(ref)) {
          return false
        }
        const z = clusterOfRef(ref)
        return z === cl.id
          ? NEED_KINDS.has(ref.kind)
          : z !== x &&
              !(z !== undefined && within(z)) &&
              usedAt(ref, x) === 'env'
      }
      /** Whether nothing the env module evaluates uses `y`'s bindings but the statement and what it follows. */
      const onlyFollowed = (y: ClusterId) =>
        [...clusters[y]!.declares].every((s) =>
          t1.refs
            .refsOf(s)
            .every((ref) => !usedByEnv(ref, y, (z) => followed.has(z))),
        )
      const reported: Array<KeptDeclaration> = []
      for (const x of changes.clusters) {
        const xc = clusters[x]!
        if (
          x === cl.id ||
          (xc.kind !== 'declaration' && xc.kind !== 'effect') ||
          xc.copyable ||
          xc.gens.length > 0 ||
          causes.has(x) ||
          !ev.has(x) ||
          lazyNeeders(x).length === 0 ||
          // (another binding the statement follows that the env module
          // uses keeps it there anyway)
          ![...xc.declares].every((s) =>
            t1.refs
              .refsOf(s)
              .every(
                (ref) =>
                  !usedByEnv(ref, x, (z) => followed.has(z) && onlyFollowed(z)),
              ),
          )
        ) {
          continue
        }
        const syms = [...xc.declares].filter(
          (s) => symbols.isModuleLevel(s) && !symbols.isImport(s),
        )
        reported.push({
          syms,
          exported: false,
          reason: 'written',
          range: declaringRange(xc, syms[0]),
          needers: lazyNeeders(x),
          at: unit.range.start,
          read: keptOne.sym,
          readChanged: true,
          // (the statement changes it, or only uses it)
          ...(!changes.syms.some((s) => xc.declares.has(s)) && {
            uses: true,
          }),
        })
      }
      if (reported.length > 0) {
        writtenTogether.push(...reported)
        break
      }
    }
  }
  const kept: Array<KeptDeclaration> = [...unusedReports, ...writtenTogether]
  if (causes.size === 0) {
    return kept
  }
  // reported once, at the cause: a cluster kept because another kept one
  // reads it (the env-roots cascade) is not, nor one the env module needs
  // through anything else (its loader, `Route`, an extraction cancelled
  // later); an export statement (`export { x as y }`) needs nothing beyond
  // the export itself
  // each cause's reach, walked once; the causes each cause is reached from
  const reachOf = new Map<ClusterId, Set<ClusterId>>()
  const reachedFrom = new Map<ClusterId, Array<ClusterId>>()
  for (const d of causes.keys()) {
    const set = reads.reach('env', [d])
    reachOf.set(d, set)
    for (const c of set) {
      if (c !== d && causes.has(c)) {
        const from = reachedFrom.get(c)
        if (from) {
          from.push(d)
        } else {
          reachedFrom.set(c, [d])
        }
      }
    }
  }
  const envOwn = ownCache ?? ownOfEnv()
  /**
   * The cluster declaring what an export cancelled because it reads it
   * (`reads`) reads: the export stays only for it, so it keeps nothing by
   * a cause of its own, and when a reported cause keeps that cluster, the
   * export is that cause's cascade (moving the cause frees both). A cause
   * kept because the exports' modules would share it (`shared`) stays for
   * them: they are its cause.
   */
  const readOf = (c: ClusterId): ClusterId | undefined => {
    const pin = causes.get(c)!
    return exported.has(c) &&
      pin.reason === 'reads' &&
      pin.binding !== undefined
      ? clusterOfSym.get(pin.binding)
      : undefined
  }
  /** Each cause's reports (none: a cascade, or what the env module needs anyway). */
  const reports = new Map<ClusterId, Array<KeptDeclaration>>()
  function reportsOf(c: ClusterId): Array<KeptDeclaration> {
    const known = reports.get(c)
    if (known !== undefined) {
      return known
    }
    // (an export reading another export cancelled the same way is judged
    // after it; one reading back is not a cascade)
    reports.set(c, [])
    const out = reportOf(c)
    reports.set(c, out)
    return out
  }
  function reportOf(c: ClusterId): Array<KeptDeclaration> {
    const pin = causes.get(c)!
    if (envOwn.has(c)) {
      return []
    }
    const read = readOf(c)
    if (read !== undefined) {
      if (
        !envOwn.has(read) &&
        [...causes.keys()].some(
          (d) =>
            d !== c &&
            causes.get(d)!.reason !== 'shared' &&
            // (another such export keeps only itself)
            (d === read ||
              (readOf(d) === undefined && reachOf.get(d)!.has(read))) &&
            reportsOf(d).length > 0,
        )
      ) {
        return []
      }
    } else if (!exported.has(c)) {
      // an exported cause stays for its own effects or writes, whoever
      // reads it
      for (const d of reachedFrom.get(c) ?? []) {
        // (the statement's own cluster reads what it keeps; an export
        // cancelled because it reads what a cause keeps keeps nothing but
        // what its module would share: no cascade)
        if (
          d !== mirrored.get(c) &&
          (readOf(d) === undefined || pin.reason === 'shared') &&
          !reachOf.get(c)!.has(d)
        ) {
          return []
        }
      }
    }
    const cl = clusters[c]!
    const exports = exported.get(c)
    if (exports !== undefined) {
      // one per exported binding (a destructuring declares several), each
      // with its own reason
      const needers = lazyNeeders(c)
      const out: Array<KeptDeclaration> = []
      for (const { sym, pin: own } of exports) {
        out.push({
          syms: [sym],
          exported: true,
          reason: own.reason,
          range: declaringRange(cl, sym),
          needers,
          ...pairOf(c, own),
        })
      }
      return out
    }
    // split code only: a chunk or a Hydrate chunk (an extracted export's
    // module, a server-function provider are not split code)
    const needers: Array<OutputId> = []
    let other = false
    for (const [id, set] of derivedReach) {
      if (set.has(c)) {
        const kind = outputs.get(id)?.kind
        // `shared`: an extracted export's module is split code's own
        // dependency here (the export the chunk imports reads the cluster)
        other ||=
          kind !== 'split' &&
          kind !== 'hydrate' &&
          !(pin.reason === 'shared' && kind === 'export')
        needers.push(id)
      }
    }
    // (`needers`: an effect several outputs need stays only beside an
    // extracted module or a provider, no split code alone, R151)
    if (other || needers.length === 0 || pin.reason === 'needers') {
      return []
    }
    // (an import joined to the cluster is no declaration to report)
    const syms = [...cl.declares].filter(
      (s) => symbols.isModuleLevel(s) && !symbols.isImport(s),
    )
    return [
      {
        syms,
        exported: false,
        reason: pin.reason,
        range: declaringRange(cl, syms[0]),
        needers,
        ...pairOf(c, pin),
      },
    ]
  }
  for (const c of causes.keys()) {
    kept.push(...reportsOf(c))
  }
  return kept
}
