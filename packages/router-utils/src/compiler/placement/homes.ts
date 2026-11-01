/**
 * Placement, stage 6: the home of every cluster (README.md, "placement"):
 * the env module, one derived output, a lazy shared module several split
 * outputs import, a copy in each needer (`duplicate`), or nowhere
 * (`removed`: orphaned by our erasures, dead generated code, dead pure
 * code that would pull a chunk's dependency). Then the single-writer rule
 * (a binding sub-regions write lives with its only writer, else the
 * writers fall back in place) and the derived roots the env module keeps
 * by their effects.
 */
import { deriveId } from '../identity'
import { describeCluster, symRefsOf } from './clusters'
import type { ClusterGraph, ClusterId } from './clusters'
import type { Roots } from './settle'
import type { Seeds } from './roots'
import type { SymbolId } from '../symbols'
import type { RegionId, UnitId } from '../units'
import type { Frag, OutputId } from '../rewrite'
import type { Fallback, Home, OutputDecl, PlacementInput } from '../reach'

export interface Homes {
  home: Map<ClusterId, Home>
  /** Outputs created by placement (lazy shared modules). */
  created: Array<OutputDecl>
  /** The derived outputs reaching each cluster (the env module: `liveEnv`). */
  derivedNeeders: Array<Array<OutputId>>
  /** `multi-writer`, `shared-writer`, `hydrate-writer`, `env-declared`. */
  fallbacks: Array<Fallback>
}

export function assignHomes(
  input: PlacementInput,
  graph: ClusterGraph,
  seeds: Seeds,
  roots: Roots,
): Homes {
  const { t1, rewrites, outputs, routeModule } = input
  const { units, regions, symbols } = t1
  const { clusters, clusterOfRegion, clusterOfGen, clusterOfSym } = graph
  const { liveEnv, derivedReach, movable, pinned, copied } = roots
  const pure = (c: ClusterId) => !clusters[c]!.effectful

  // ---- orphans: erased-only clusters the final env liveness does not reach ------
  // (after the extraction decision: a cancelled candidate is an env root again,
  // and what it reads is live, however an erased range also read it)
  const orphaned = new Set<ClusterId>()
  for (const c of seeds.fromErased) {
    if (!liveEnv.has(c) && !clusters[c]!.envPinned) {
      orphaned.add(c)
    }
  }
  // symbols generated text reads: uses the semantic model does not see (a Solid `use:x`)
  let generatedReads: Set<SymbolId> | null = null
  const readByGeneratedText = (s: SymbolId): boolean => {
    if (generatedReads === null) {
      generatedReads = new Set()
      const add = (frags: ReadonlyArray<Frag>) => {
        for (const r of symRefsOf(frags)) {
          generatedReads!.add(r)
        }
      }
      for (const e of rewrites.edits) {
        add(e.body)
      }
      for (const g of rewrites.generated) {
        add(g.body)
      }
      for (const c of rewrites.claims.values()) {
        add(c.placeholder)
      }
    }
    return generatedReads.has(s)
  }
  /**
   * Whether an import specifier no output needs stays in the env module.
   * Imports follow provenance like declarations: an import the source
   * never read was dead before the transform and stays as written (its
   * module still evaluates there); one our edits orphaned leaves with its
   * readers, and so does one read only by a dead pure cluster we dropped
   * (it would pull a chunk's dependency into the route module). A value
   * import a route module uses only in type positions leaves (TypeScript
   * erases it; the module is not loaded for types); plain modules keep it
   * as written.
   */
  const importStays = (u: UnitId): boolean => {
    const cl = clusters[clusterOfRegion.get(units[u]!.region)!]!
    if (orphaned.has(cl.id)) {
      return false
    }
    if (!routeModule) {
      return true
    }
    return [...cl.declares].every(
      (s) =>
        !readByGeneratedText(s) && symbols.binding(s)?.references.length === 0,
    )
  }

  // ---- needers and homes -----------------------------------------------------
  const derivedNeeders: Array<Array<OutputId>> = clusters.map(() => [])
  for (const [id, r] of derivedReach) {
    for (const c of r) {
      derivedNeeders[c]!.push(id)
    }
  }
  const home = new Map<ClusterId, Home>()
  const created: Array<OutputDecl> = []
  const sharedByKey = new Map<string, OutputId>()
  const keyOf = (o: OutputId) => outputs.get(o)?.key ?? o
  for (const cl of clusters) {
    const derived = derivedNeeders[cl.id]!
    if (
      seeds.deadClusters.has(cl.id) ||
      (orphaned.has(cl.id) && derived.length === 0)
    ) {
      // orphaned by an env erasure and needed by no derived output: gone;
      // still needed by a chunk (an erased option value named it): homed below
      home.set(cl.id, 'removed')
      continue
    }
    if (copied.has(cl.id)) {
      // rooted in its extracted module (a build) or the env module (dev),
      // copied into every chunk that reaches it
      home.set(cl.id, 'duplicate')
      continue
    }
    const pin = pinned.get(cl.id)
    if (pin !== undefined) {
      home.set(cl.id, pin)
      continue
    }
    if (cl.envPinned) {
      home.set(cl.id, 'env')
      continue
    }
    if (liveEnv.has(cl.id)) {
      home.set(cl.id, cl.copyable && derived.length > 0 ? 'duplicate' : 'env')
      continue
    }
    if (
      derived.length > 0 &&
      derived.every((o) => outputs.get(o)?.kind === 'provider')
    ) {
      // only the module's own instance in another layer needs it: it lives there
      home.set(cl.id, derived[0]!)
      continue
    }
    if (derived.length === 0) {
      // nobody needs it: a gen unit disappears; an import stays or leaves
      // by `importStays`; a pure unexported declaration that was not
      // rooted (dead code that would pull a chunk's dependency) is dropped;
      // other source stays in the env module (harmless)
      const dead =
        cl.kind === 'gen' ||
        (cl.kind === 'import' && !importStays(cl.units[0]!)) ||
        (cl.kind === 'declaration' && !cl.effectful && !cl.exported)
      home.set(cl.id, dead ? 'removed' : 'env')
      continue
    }
    if (derived.length === 1) {
      if (
        cl.copyable ||
        pure(cl.id) ||
        movable.has(cl.id) ||
        cl.kind === 'gen'
      ) {
        home.set(cl.id, derived[0]!)
      } else {
        home.set(cl.id, 'env')
      }
      continue
    }
    if (cl.copyable) {
      home.set(cl.id, 'duplicate')
      continue
    }
    if (!pure(cl.id)) {
      home.set(cl.id, 'env')
      continue
    }
    if (derived.some((o) => outputs.get(o)?.kind === 'export')) {
      // a pure cluster an extracted module and a chunk both need is copied
      // into each: a shared module the extracted module imported would be a
      // static dependency of the route module, which no chunk may import
      home.set(cl.id, 'duplicate')
      continue
    }
    const key = derived.map(keyOf).sort().join('+')
    let shared = sharedByKey.get(key)
    if (!shared) {
      const id = deriveId(input.canonicalId, { kind: 'shared', value: key })
      shared = `derived:${id}`
      sharedByKey.set(key, shared)
      created.push({
        id: shared,
        kind: 'shared',
        key: `shared~${key}`,
        derivedId: id,
        roots: [],
      })
    }
    home.set(cl.id, shared)
  }
  if (process.env.NODE_ENV !== 'production') {
    // an effectful cluster the env module keeps for a derived output is an
    // env root: decided when the roots settled, so that what it reads was
    // live when the moving set was decided
    for (const cl of clusters) {
      if (home.get(cl.id) === 'env' && cl.effectful && !liveEnv.has(cl.id)) {
        throw new Error(
          `placement: ${describeCluster(input, cl)}, which has effects, is homed in the env module and is not live there`,
        )
      }
    }
  }

  // ---- single-writer rule ------------------------------------------------------
  const fallbacks: Array<Fallback> = []
  for (const { cluster: c, writers } of graph.subRegionWriters) {
    const writerHomes = new Map<OutputId, RegionId>()
    for (const w of [...writers].sort(
      (a, b) => regions.get(a).range.start - regions.get(b).range.start,
    )) {
      const claim = rewrites.claims.get(w)
      const wc = claim
        ? clusterOfGen.get(claim.owner)!
        : clusterOfRegion.get(w)!
      const h = home.get(wc)
      const o: OutputId =
        h === undefined || h === 'duplicate' || h === 'removed' ? 'env' : h
      if (!writerHomes.has(o)) {
        writerHomes.set(o, w)
      } else {
        fallbacks.push({ region: w, reason: 'multi-writer' })
      }
    }
    const derivedHomes = [...writerHomes].filter(([o]) => o !== 'env')
    if (derivedHomes.length === 0) {
      continue
    }
    if (derivedHomes.length > 1) {
      for (const [, w] of derivedHomes.slice(1)) {
        fallbacks.push({ region: w, reason: 'multi-writer' })
      }
    }
    const [[g, w]] = derivedHomes as [[OutputId, RegionId]]
    if (liveEnv.has(c) || writerHomes.has('env')) {
      const kind = outputs.get(g)?.kind
      fallbacks.push({
        region: w,
        reason: kind === 'hydrate' ? 'hydrate-writer' : 'shared-writer',
      })
    } else {
      home.set(c, g)
    }
  }

  // ---- sym roots the env module keeps by their effects (J2.8) -------------
  // A derived output whose root value is a binding declared by an effect the
  // route module keeps (destructured from a call, written at the top level
  // where the route module needs it) would only import it: the planner is
  // told, keeps the option in place and reports it.
  for (const [id, decl] of outputs) {
    if (id === 'env') {
      continue
    }
    for (const r of decl.roots) {
      if (r.t !== 'sym') {
        continue
      }
      const d = clusterOfSym.get(r.id)
      if (d === undefined || home.get(d) !== 'env') {
        continue
      }
      const declaring = t1.declaringUnits.get(r.id) ?? []
      if (declaring.length === 0) {
        continue
      }
      // the two user-fixable patterns of J2.8: the declaration itself has effects (a call
      // result, a destructuring) or travels with an exported binding (a
      // writer of module state the route module exports); the value being
      // the exported declaration itself is imported from the env module (no report)
      const unit = units[declaring[0]!]!
      if (
        unit.kind === 'declaration' &&
        !unit.effectful &&
        (!clusters[d]!.exported || unit.exported.length > 0)
      ) {
        continue
      }
      fallbacks.push({ region: unit.region, reason: 'env-declared' })
    }
  }

  return { home, created, derivedNeeders, fallbacks }
}
