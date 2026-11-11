/**
 * Placement, stage 3: the roots before any decision. The env module's own
 * roots (effect statements touching an import or nothing of the module,
 * exports, effectful generated units, the roots planners named), the
 * followers (the other statements: `settle.ts` roots each in a chunk or
 * the env module), each derived output's roots, the clusters pinned to an
 * output by a fixed-home generated unit, the extracted-export candidates
 * (decided later, with the env roots), and provenance: what erased text
 * read, from which "orphaned by us" is decided once env liveness is final.
 */
import { NEED_KINDS, describeCluster } from './clusters'
import type { ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Events, Pin } from './events'
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
  /**
   * The unexported clusters holding a bare statement (a call, an
   * assignment, an `if`/`try`/loop block) whose touches are all module
   * bindings of this module (`Events.statementTouches`, no import): not
   * env roots yet; each follows what it touches into its one chunk or
   * becomes one (`settle.ts`). One touching an import, or no binding
   * (none it declares either), is an env root here.
   */
  followers: Set<ClusterId>
  /**
   * Statements kept in the env module, and why (`written`: what they change
   * that stays or goes elsewhere, or outside the module's bindings): the
   * declarations they change that only split code needs are reported with
   * that cause (`kept.ts`). Seeded here, added to when roots settle.
   */
  stayPins: Map<ClusterId, Pin>
  derivedRoots: Map<OutputId, Set<ClusterId>>
  /** The clusters reachable in the env module's source from what its erased text reads. */
  fromErased: Set<ClusterId>
}

export function seedRoots(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  events: Events,
): Seeds {
  const { t1, rewrites, outputs } = input
  const extractions = input.extractions ?? new Map<SymbolId, OutputId>()
  const { units, refs, symbols } = t1
  const gens = rewrites.generated
  const { clusters, clusterOfRegion, clusterOfGen, clusterOfSym } = graph
  const liveInEnv = (ref: ClassifiedRef) => graph.isLive(ref, 'env')

  // ---- extracted exports: candidates and their export companions -------
  // Planners allow every local value export out; a candidate is one whose
  // cluster is an unassigned declaration without effects as extraction judges
  // them (`runsCode`, not rule L: a host may flag its module side-effect
  // free whatever it holds, and a bundler then drops it while nothing
  // imports what it exports, so `new URL(text)` stays). Its pure
  // augmentations, `Page.p = …`, are writes that travel with it (the
  // binding's writers at load are its cluster). Its companions are the export-specifier /
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
      cl.gens.length > 0 ||
      graph.runsCode(c) ||
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
    // (a unit for the env module's readers owns no claim)
    const o = (g.home === 'auto' ? 'env' : g.home) as OutputId
    if (!graph.viewOf(o).hasClaim(claim.region)) {
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
    if (g.home === 'auto' || typeof g.home === 'object' || deadGens.has(g.id)) {
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
  const followers = new Set<ClusterId>()
  const stayPins = new Map<ClusterId, Pin>()
  /** `written` on what statement `u` of `c` changes outside the module. */
  const outsidePin = (c: ClusterId, u: (typeof units)[number]) => {
    const outside = events.unitChanges(u.id).outside
    if (outside !== null && !stayPins.has(c)) {
      stayPins.set(c, {
        reason: 'written',
        other: { at: u.range.start },
        outside,
        ...(events.statementChanges(c).syms.length === 0 && { uses: true }),
      })
    }
    return outside !== null
  }
  for (const u of units) {
    if (!graph.unitSurvives(u.id)) {
      continue
    }
    const c = clusterOfRegion.get(u.region)!
    if (u.kind === 'effect' || u.kind === 'import-effect') {
      // an augmentation of its own declaration cluster is decided with the
      // cluster (movable, else an effect root when roots settle), unless it
      // changes what the rest of the app sees, as a statement (R146
      // amendment); a bare statement of an unexported cluster may follow
      // what it changes
      if (graph.ownAugmentations.has(u.id)) {
        if (outsidePin(c, u)) {
          envRoots.add(c)
        }
      } else {
        if (
          u.kind === 'effect' &&
          u.node.type !== 'TSExportAssignment' &&
          !clusters[c]!.exported
        ) {
          followers.add(c)
        } else {
          envRoots.add(c)
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
  // a statement that changes what the rest of the app sees (`outside`),
  // or follows no binding of the module, stays (R146 amendment)
  for (const c of followers) {
    const changes = envRoots.has(c) ? null : events.statementChanges(c)
    if (
      changes === null ||
      changes.outside !== null ||
      (changes.clusters.length === 0 && clusters[c]!.declares.size === 0)
    ) {
      followers.delete(c)
      envRoots.add(c)
      if (changes?.outside != null) {
        for (const u of clusters[c]!.units) {
          const unit = units[u]!
          if (
            (unit.kind === 'effect' || unit.kind === 'declaration') &&
            outsidePin(c, unit)
          ) {
            break
          }
        }
      }
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
    if (
      g.home !== 'auto' &&
      typeof g.home !== 'object' &&
      !deadGens.has(g.id)
    ) {
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
  for (const part of graph.viewOf('env').erasedParts()) {
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
    followers,
    stayPins,
    derivedRoots,
    fromErased,
  }
}
