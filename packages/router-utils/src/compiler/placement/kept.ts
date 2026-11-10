/**
 * Placement, stage 5: what only lazy outputs need that stays in the env
 * module, with the reason (`Placement.kept`, worded for the user by
 * `kept-diagnostics.ts`). The exported declarations a chunk reaches that are
 * not extracted, and the unexported clusters the movable test kept
 * (evaluation order, writes, eager reads), reported once at the cause and
 * only when the env module does not need them anyway.
 */
import { READ_KINDS } from './clusters'
import { derivedNeeds } from './settle'
import type { Cluster, ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Seeds } from './roots'
import type { Pin, Roots } from './settle'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { OutputId } from '../rewrite'
import type { KeptDeclaration, PlacementInput } from '../reach'

export function keptDeclarations(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  seeds: Seeds,
  roots: Roots,
): Array<KeptDeclaration> {
  const { t1, outputs } = input
  const extractions = input.extractions ?? new Map<SymbolId, OutputId>()
  const { units, symbols } = t1
  const { regions } = input.rewrites
  const { clusters, clusterOfRegion, clusterOfSym } = graph
  const { cancelled, derivedReach, envRoots, movable, remaining } = roots
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
  const effectStays = (effect: number) =>
    !movable.has(clusterOfRegion.get(units[effect]!.region)!)
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
  // assigned; or cancelled, with its cause), the unexported clusters the
  // movable test kept, and the clusters an augmentation roots up front
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
    const cause: Pin = cl.sideEffects
      ? { reason: 'effects' }
      : t1.mutation.isReassigned(sym, liveInEnv) ||
          graph.regionWrittenSyms.has(sym)
        ? { reason: 'reassigned' }
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
  for (const [c, at] of seeds.augmentedRoots) {
    if (derivedNeeds(input, derivedReach, c)) {
      causes.set(c, { reason: 'written', at })
    }
  }
  const kept: Array<KeptDeclaration> = []
  /** The clusters reported below. */
  const reported = new Set<ClusterId>()
  if (causes.size === 0) {
    stateReaders(input, graph, roots, reported, kept)
    return kept
  }
  // reported once, at the cause: a cluster kept because another kept one
  // reads it (the env-roots cascade) is not, nor one the env module needs
  // through anything else (its loader, `Route`, an extraction cancelled
  // later); an export statement (`export { x as y }`) needs nothing beyond
  // the export itself
  const reachOf = new Map<ClusterId, Set<ClusterId>>()
  for (const c of causes.keys()) {
    reachOf.set(c, reads.reach('env', [c]))
  }
  const envOwn = reads.reach(
    'env',
    [...envRoots].filter((c) => !causes.has(c) && !gluesCauses(c)),
  )
  for (const [c, pin] of causes) {
    if (envOwn.has(c)) {
      continue
    }
    // an exported cause stays for its own effects or writes, whoever reads it
    let cascade = false
    for (const [d, set] of exported.has(c) ? [] : reachOf) {
      if (d !== c && set.has(c) && !reachOf.get(c)!.has(d)) {
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
          ...(own.effect !== undefined && {
            effect: own.effect,
            effectStays: effectStays(own.effect),
          }),
        })
      }
      reported.add(c)
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
    const syms = [...cl.declares].filter((s) => symbols.isModuleLevel(s))
    kept.push({
      syms,
      exported: false,
      reason: pin.reason,
      range: declaringRange(cl, syms[0]),
      needers,
      ...(pin.effect !== undefined && {
        effect: pin.effect,
        effectStays: effectStays(pin.effect),
      }),
      ...(pin.at !== undefined && { at: pin.at }),
      ...(pin.read !== undefined && { read: pin.read }),
    })
    reported.add(c)
  }
  stateReaders(input, graph, roots, reported, kept)
  return kept
}

/**
 * A declaration that reads, when it loads, a binding of its cluster the
 * module writes at load joins that binding's cluster (ordered evaluation),
 * which the env module keeps when it reads the binding too (`loader: () =>
 * n`): the declaration stays with it although only split code reads it,
 * the movable test's `state` at one declaration of the cluster.
 */
function stateReaders(
  input: PlacementInput,
  graph: ClusterGraph,
  roots: Roots,
  reported: ReadonlySet<ClusterId>,
  kept: Array<KeptDeclaration>,
): void {
  const { t1, outputs } = input
  const { units, refs, symbols } = t1
  const { regions } = input.rewrites
  const { clusterOfRegion, clusterOfSym } = graph
  const { liveEnv, derivedReach } = roots
  const mutated = new Set<SymbolId>()
  const mutatedClusters = new Set<ClusterId>()
  for (const w of graph.writes) {
    const c = w.live && w.eager ? clusterOfSym.get(w.sym) : undefined
    if (c !== undefined && liveEnv.has(c) && !reported.has(c)) {
      mutated.add(w.sym)
      mutatedClusters.add(c)
    }
  }
  if (mutated.size === 0) {
    return
  }
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')
  const clusterOf = (ref: ClassifiedRef) =>
    clusterOfRegion.get(regions.ownerOf(ref))
  for (const u of units) {
    const c = clusterOfRegion.get(u.region)
    if (
      u.kind !== 'declaration' ||
      u.exported.length > 0 ||
      u.declares.length === 0 ||
      c === undefined ||
      !mutatedClusters.has(c)
    ) {
      continue
    }
    // the read ordered evaluation merged it for (clusters.ts)
    const read = refs
      .refsIn(u.range)
      .find(
        (ref) =>
          ref.eager &&
          READ_KINDS.has(ref.kind) &&
          mutated.has(ref.sym) &&
          clusterOfSym.get(ref.sym) === c &&
          !u.declares.includes(ref.sym) &&
          liveInEnv(ref) &&
          regions.ownerOf(ref) === u.region,
      )
    if (read === undefined) {
      continue
    }
    // only split code (a chunk, a Hydrate chunk) reads or writes what it
    // declares: a use by a cluster the env module evaluates keeps it there
    const needers = new Set<OutputId>()
    /** Records a use by cluster `d`; whether the env module evaluates it. */
    const usedInEnv = (d: ClusterId | undefined, live: boolean): boolean => {
      if (d === undefined) {
        return false
      }
      if (liveEnv.has(d) && live) {
        return true
      }
      for (const [id, set] of derivedReach) {
        const kind = outputs.get(id)?.kind
        if (set.has(d) && (kind === 'split' || kind === 'hydrate')) {
          needers.add(id)
        }
      }
      return false
    }
    let envReads = false
    for (const s of u.declares) {
      for (const ref of refs.valueRefsOf(s)) {
        if (READ_KINDS.has(ref.kind)) {
          envReads ||= usedInEnv(clusterOf(ref), liveInEnv(ref))
        }
      }
      for (const w of graph.writesOfSym.get(s) ?? []) {
        if (w.owner !== null && w.owner !== u.region) {
          envReads ||= usedInEnv(clusterOfRegion.get(w.owner), w.live)
        }
      }
    }
    if (envReads || needers.size === 0) {
      continue
    }
    kept.push({
      syms: u.declares.filter((s) => symbols.isModuleLevel(s)),
      exported: false,
      reason: 'state',
      range: { start: u.range.start, end: u.range.end },
      needers: [...needers],
      read: read.sym,
    })
  }
}
