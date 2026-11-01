/**
 * Placement, stage 3: the roots before any decision. The env module's own
 * roots (effect statements, exports, effectful generated units, the roots
 * planners named), each derived output's roots, the clusters pinned to an
 * output by a fixed-home generated unit, the extracted-export candidates
 * (decided later, with the env roots), and provenance: what erased text
 * read, from which "orphaned by us" is decided once env liveness is final.
 */
import { NEED_KINDS, describeCluster, ownAugmentation } from './clusters'
import type { ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Node } from 'yuku'
import type { ClassifiedRef } from '../analysis'
import type { SymbolId } from '../symbols'
import type { GenUnitId, OutputId } from '../rewrite'
import type { PlacementInput, RootRef } from '../reach'

/** An exported cluster a planner allows into an extracted-export output. */
export interface Candidate {
  output: OutputId
  /** The exported symbols the planner allowed out, and those its companions export. */
  syms: Set<SymbolId>
  /** The export-specifier / `export default x` clusters that only read it (rendered as the env module's re-export glue when it leaves). */
  companions: Set<ClusterId>
}

export interface Seeds {
  /** Extracted-export candidates (cluster → candidate); neither they nor their companions are env roots yet. */
  candidates: Map<ClusterId, Candidate>
  /** Clusters placed nowhere: generated units whose claim is erased with an ancestor in their home (later, the companions of extracted exports too). */
  deadClusters: Set<ClusterId>
  /** Clusters a fixed-home generated unit pins to its output. */
  pinned: Map<ClusterId, OutputId>
  envRoots: Set<ClusterId>
  /** Unexported declaration clusters an augmentation keeps as effect roots (their initialiser has effects), with its position (`kept`, `written`). */
  augmentedRoots: Map<ClusterId, number>
  derivedRoots: Map<OutputId, Set<ClusterId>>
  /** The clusters reachable in the env module's source from what its erased text reads. */
  fromErased: Set<ClusterId>
}

export function seedRoots(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
): Seeds {
  const { t1, rewrites, outputs } = input
  const extractions = input.extractions ?? new Map<SymbolId, OutputId>()
  const { units, refs, symbols } = t1
  const gens = rewrites.generated
  const { clusters, clusterOfRegion, clusterOfGen, clusterOfSym } = graph
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')

  // ---- extracted exports: candidates and their export companions -------
  // Planners allow every local value export out; a candidate is one whose
  // cluster is an unassigned declaration without observable effects (its
  // augmentations, `Page.p = …`, travel with it under the effect-order rule
  // of every move, `effectStays`). Its companions are the export-specifier /
  // `export default x` clusters that only read it. Neither is an env root
  // for now: the decision (extract, or keep in the env module) is taken once
  // env liveness is known.
  const candidates = new Map<ClusterId, Candidate>()
  for (const [sym, output] of extractions) {
    const c = clusterOfSym.get(sym)
    if (c === undefined) {
      continue
    }
    const cl = clusters[c]!
    if (
      cl.kind !== 'declaration' ||
      cl.sideEffects ||
      cl.gens.length > 0 ||
      // a reassigned export stays: its writers would assign an import
      t1.mutation.isReassigned(sym, liveInEnv) ||
      // a binding a sub-region writes (Hydrate children, a split option
      // value) must meet the single-writer rule: pinning its cluster to an
      // extracted output would let the writer assign an import
      [...cl.declares].some((s) => graph.regionWrittenSyms.has(s))
    ) {
      continue
    }
    let e = candidates.get(c)
    if (!e) {
      e = { output, syms: new Set(), companions: new Set() }
      candidates.set(c, e)
    } else if (e.output !== output) {
      continue
    }
    e.syms.add(sym)
  }
  const snapshotDiffersAt = (id: Node): boolean =>
    refs
      .refsIn({ start: id.start, end: id.end })
      .some((r) => t1.snapshotDiffers(r.sym, id.start, liveInEnv))
  const extractRelated = new Set<ClusterId>()
  if (candidates.size > 0) {
    for (const cl of clusters) {
      if (
        cl.kind !== 'export' ||
        !cl.units.every((u) => {
          const { kind, node } = units[u]!
          // `export default () => <Page />` is no re-export of its target,
          // nor `export default count` of a reassigned `count`, or above
          // its `var` (it holds the value `count` has then)
          return (
            kind === 'export-specifier' ||
            (kind === 'export-default' &&
              node.type === 'ExportDefaultDeclaration' &&
              node.declaration.type === 'Identifier' &&
              !snapshotDiffersAt(node.declaration))
          )
        })
      ) {
        continue
      }
      const targets = new Set<ClusterId>()
      const exported = new Set<SymbolId>()
      for (const s of reads.clusterReads(cl.id, 'env', false).syms) {
        if (!symbols.isModuleLevel(s)) {
          continue
        }
        const d = clusterOfSym.get(s)
        if (d !== undefined && d !== cl.id) {
          targets.add(d)
          exported.add(s)
        }
      }
      if (targets.size !== 1) {
        continue
      }
      const [target] = targets
      const e = candidates.get(target!)
      if (e) {
        // it renders as the re-export glue: every binding it exports leaves
        // with the cluster (`export { Page, Other }` of one destructuring,
        // `export default Page` next to `export { Other }`), whatever output
        // the planner offered each one
        e.companions.add(cl.id)
        for (const s of exported) {
          e.syms.add(s)
        }
        extractRelated.add(cl.id)
      }
    }
    for (const c of candidates.keys()) {
      extractRelated.add(c)
    }
  }

  // ---- dead claims (ancestor erasure): the owner contributes nothing ----
  const deadGens = new Set<GenUnitId>()
  for (const claim of rewrites.claims.values()) {
    const g = gens[claim.owner]!
    const o: OutputId = g.home === 'auto' ? 'env' : g.home
    if (!graph.treeOf(o).hasClaim(claim.region)) {
      deadGens.add(claim.owner)
    }
  }
  const deadClusters = new Set<ClusterId>()
  for (const g of deadGens) {
    deadClusters.add(clusterOfGen.get(g)!)
  }
  // fixed-home generated units pin their cluster
  const pinned = new Map<ClusterId, OutputId>()
  for (const g of gens) {
    if (g.home === 'auto' || deadGens.has(g.id)) {
      continue
    }
    const c = clusterOfGen.get(g.id)!
    const prev = pinned.get(c)
    if (prev !== undefined && prev !== g.home) {
      throw new Error(
        `generated units ${g.by} pin ${describeCluster(input, graph.clusters[c]!)} to two outputs (${prev}, ${g.home})`,
      )
    }
    pinned.set(c, g.home)
  }

  // ---- roots -----------------------------------------------------------------
  const rootCluster = (r: RootRef): ClusterId | undefined => {
    switch (r.t) {
      case 'unit':
        return clusterOfRegion.get(units[r.id]!.region)
      case 'gen':
        return clusterOfGen.get(r.id)
      case 'sym':
        return clusterOfSym.get(r.id)
    }
  }
  const envRoots = new Set<ClusterId>()
  const augmentedRoots = new Map<ClusterId, number>()
  for (const u of units) {
    if (!graph.unitSurvives(u.id)) {
      continue
    }
    const c = clusterOfRegion.get(u.region)!
    if (u.kind === 'effect' || u.kind === 'import-effect') {
      // an augmentation of its own declaration cluster is decided with the
      // cluster (movable, else an effect root when roots settle)
      if (!ownAugmentation(units, u, clusters[c]!)) {
        envRoots.add(c)
        if (
          u.augments.length > 0 &&
          !clusters[c]!.exported &&
          !augmentedRoots.has(c) &&
          u.augments.every((s) => clusters[c]!.declares.has(s))
        ) {
          augmentedRoots.set(c, u.range.start)
        }
      }
    } else if (
      u.kind === 'export-specifier' ||
      u.kind === 'reexport' ||
      u.kind === 'export-default' ||
      u.exported.length > 0
    ) {
      if (!extractRelated.has(c)) {
        envRoots.add(c)
      }
    }
  }
  for (const g of gens) {
    if (g.effectful && g.home === 'auto' && !deadGens.has(g.id)) {
      envRoots.add(clusterOfGen.get(g.id)!)
    }
  }

  for (const r of outputs.get('env')?.roots ?? []) {
    const c = rootCluster(r)
    if (c !== undefined) {
      envRoots.add(c)
    }
  }
  const derivedRoots = new Map<OutputId, Set<ClusterId>>()
  for (const [id, decl] of outputs) {
    if (id === 'env') {
      continue
    }
    const set = new Set<ClusterId>()
    for (const r of decl.roots) {
      const c = rootCluster(r)
      if (c !== undefined) {
        set.add(c)
      }
    }
    derivedRoots.set(id, set)
  }
  for (const g of gens) {
    if (g.home !== 'auto' && !deadGens.has(g.id)) {
      let set = derivedRoots.get(g.home)
      if (!set) {
        set = new Set()
        derivedRoots.set(g.home, set)
      }
      set.add(clusterOfGen.get(g.id)!)
    }
  }

  // ---- provenance: clusters reachable in G0 from erased reads -------------
  const erasedSeeds = new Set<ClusterId>()
  for (const part of graph.treeOf('env').erasedParts()) {
    for (const ref of refs.refsIn(part)) {
      // a write names the binding too: an initialiser only an erased
      // handler assigns is orphaned with it
      if (!NEED_KINDS.has(ref.kind) || !symbols.isModuleLevel(ref.sym)) {
        continue
      }
      const d = clusterOfSym.get(ref.sym)
      if (d !== undefined) {
        erasedSeeds.add(d)
      }
    }
  }
  const fromErased = new Set<ClusterId>()
  const work = [...erasedSeeds]
  while (work.length > 0) {
    const c = work.pop()!
    if (fromErased.has(c)) {
      continue
    }
    fromErased.add(c)
    for (const d of reads.successors(c, 'env', false)) {
      work.push(d)
    }
  }

  return {
    candidates,
    deadClusters,
    pinned,
    envRoots,
    augmentedRoots,
    derivedRoots,
    fromErased,
  }
}
