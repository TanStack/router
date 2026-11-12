/**
 * Placement, stage 5: what only lazy outputs need that stays in the env
 * module, with the reason (`Placement.kept`, worded for the user by
 * `kept-diagnostics.ts`). The exported declarations a chunk reaches that are
 * not extracted, and the unexported clusters a rule of the event table kept
 * (evaluation order, writes, eager reads), reported once at the cause and
 * only when the env module does not need them anyway, worded from the
 * violated pair (`Pin`: the other event, the binding).
 */
import { derivedNeeds } from './settle'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Seeds } from './roots'
import type { Events, Pin } from './events'
import type { Roots } from './settle'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { OutputId } from '../rewrite'
import type { KeptDeclaration, PlacementInput } from '../reach'

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
  const declaringRange = (cl: Cluster, sym: SymbolId | undefined) => {
    const declaring =
      sym === undefined ? undefined : (t1.declaringUnits.get(sym) ?? [])[0]
    const range =
      declaring === undefined
        ? regions.get(cl.regions[0]!).range
        : units[declaring]!.range
    return { start: range.start, end: range.end }
  }
  /** The pair's other event and binding, as a record words them. */
  const pairOf = (pin: Pin): Partial<KeptDeclaration> => {
    const other = pin.other
    return {
      ...(other !== undefined &&
        (pin.reason === 'written' || pin.reason === 'reassigned') && {
          at: other.at,
        }),
      ...(pin.binding !== undefined && { read: pin.binding }),
      ...(pin.in !== undefined && { in: pin.in }),
      ...(pin.uses === true && { uses: true }),
    }
  }
  /** `reassigned`: the binding and its first live assignment (the declaration aside). */
  const reassignment = (sym: SymbolId): Pin => {
    const w = graph.writesOfSym.get(sym)?.find((x) => x.live && !x.member)
    return {
      reason: 'reassigned',
      binding: sym,
      ...(w !== undefined && { other: { at: w.at } }),
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
  // reaches that is not extracted (no candidate: observable effects,
  // assigned; or cancelled, with its cause), the unexported clusters a
  // rule kept, and the clusters an augmentation roots up front
  // (`written`). An exported declaration the env module reads (`live`)
  // would stay there without split code: nothing to report.
  const causes = new Map<ClusterId, Pin>()
  /** The exported causes: each binding with its own reason. */
  const exported = new Map<ClusterId, Array<{ sym: SymbolId; pin: Pin }>>()
  for (const [sym] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined || remaining.has(c)) {
      continue
    }
    const cl = clusters[c]!
    if (cl.kind !== 'declaration' || cl.gens.length > 0) {
      continue
    }
    // (no candidate when it may run code, as extraction judges it: `roots.ts`)
    const cause: Pin = graph.runsCode(c)
      ? { reason: 'effects' }
      : t1.mutation.isReassigned(sym, liveInEnv) ||
          graph.regionWrittenSyms.has(sym)
        ? reassignment(sym)
        : (cancelled.get(c) ?? { reason: 'live' })
    if (cause.reason === 'live' || lazyNeeders(c).length === 0) {
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
  for (const [c, pin] of seeds.stayPins) {
    if (!envRoots.has(c)) {
      continue
    }
    statements.add(c)
    const blocker =
      pin.binding === undefined ? undefined : clusterOfSym.get(pin.binding)
    // (what the env module evaluates with it: a binding whose value holds
    // a claimed option value does not keep that value there)
    const kept = reads.reach('env', [c])
    const followed = events.statementChanges(c).clusters
    for (const d of clusters[c]!.declares.size > 0
      ? [c, ...followed]
      : followed) {
      if (
        d !== blocker &&
        !causes.has(d) &&
        kept.has(d) &&
        clusters[d]!.kind !== 'import' &&
        derivedNeeds(input, derivedReach, d)
      ) {
        causes.set(d, pin)
      }
    }
  }
  const kept: Array<KeptDeclaration> = []
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
  const envOwn = reads.reach(
    'env',
    [...envRoots].filter(
      (c) => !causes.has(c) && !statements.has(c) && !gluesCauses(c),
    ),
  )
  for (const [c, pin] of causes) {
    if (envOwn.has(c)) {
      continue
    }
    // an exported cause stays for its own effects or writes, whoever reads it
    let cascade = false
    for (const d of exported.has(c) ? [] : (reachedFrom.get(c) ?? [])) {
      if (!reachOf.get(c)!.has(d)) {
        cascade = true
        break
      }
    }
    if (cascade) {
      continue
    }
    const cl = clusters[c]!
    const exports = exported.get(c)
    if (exports !== undefined) {
      // one per exported binding (a destructuring declares several), each
      // with its own reason
      const needers = lazyNeeders(c)
      for (const { sym, pin: own } of exports) {
        kept.push({
          syms: [sym],
          exported: true,
          reason: own.reason,
          range: declaringRange(cl, sym),
          needers,
          ...pairOf(own),
        })
      }
      continue
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
    if (other || needers.length === 0) {
      continue
    }
    // (an import joined to the cluster is no declaration to report)
    const syms = [...cl.declares].filter(
      (s) => symbols.isModuleLevel(s) && !symbols.isImport(s),
    )
    kept.push({
      syms,
      exported: false,
      reason: pin.reason,
      range: declaringRange(cl, syms[0]),
      needers,
      ...pairOf(pin),
    })
  }
  return kept
}
