/**
 * Placement, stage 5: what only lazy outputs need that stays in the env
 * module, with the reason (`Placement.kept`, worded for the user by
 * `kept-diagnostics.ts`). The exported declarations a chunk reaches that are
 * not extracted, and the unexported clusters the movable test kept
 * (evaluation order, writes, eager reads), reported once at the cause.
 */
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
  const { units, regions, symbols } = t1
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

  const kept: Array<KeptDeclaration> = []
  // exported: the candidate filter and `extractable` decided
  for (const [sym] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined || remaining.has(c)) {
      continue
    }
    const cl = clusters[c]!
    if (cl.kind !== 'declaration' || cl.gens.length > 0) {
      continue
    }
    const needers = lazyNeeders(c)
    if (needers.length === 0) {
      continue
    }
    // no candidate (observable effects, assigned), or cancelled with its cause
    const cause: Pin = cl.sideEffects
      ? { reason: 'effects' }
      : t1.mutation.isReassigned(sym, liveInEnv) ||
          graph.regionWrittenSyms.has(sym)
        ? { reason: 'reassigned' }
        : (cancelled.get(c) ?? { reason: 'live' })
    const { reason, effect } = cause
    kept.push({
      syms: [sym],
      exported: true,
      reason,
      range: declaringRange(cl, sym),
      needers,
      ...(effect !== undefined && {
        effect,
        effectStays: effectStays(effect),
      }),
    })
  }

  // unexported: the movable test's causes, and the clusters an augmentation
  // roots up front (`written`)
  const causes = new Map<ClusterId, Pin>(roots.pinnedNeeded)
  for (const [c, at] of seeds.augmentedRoots) {
    if (derivedNeeds(input, derivedReach, c)) {
      causes.set(c, { reason: 'written', at })
    }
  }
  if (causes.size === 0) {
    return kept
  }
  // reported once, at the cause: a cluster kept because another kept one
  // reads it (the env-roots cascade) is not, nor one the env module needs
  // through anything else (an extraction cancelled later)
  const reachOf = new Map<ClusterId, Set<ClusterId>>()
  for (const c of causes.keys()) {
    reachOf.set(c, reads.reach('env', [c]))
  }
  const envOwn = reads.reach(
    'env',
    [...envRoots].filter((c) => !causes.has(c)),
  )
  for (const [c, pin] of causes) {
    if (envOwn.has(c)) {
      continue
    }
    let cascade = false
    for (const [d, set] of reachOf) {
      if (d !== c && set.has(c) && !reachOf.get(c)!.has(d)) {
        cascade = true
        break
      }
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
    if (cascade || other || needers.length === 0) {
      continue
    }
    const cl = clusters[c]!
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
  }
  return kept
}
