/**
 * Placement: clusters, reachability, provenance-based orphans, the
 * movable-effect test, ordered evaluation and needers/homes (see README.md,
 * "Reachability = splitting = dead-code removal"). A generic service:
 * planners supply roots and derived outputs; the core decides what each
 * output contains and what it imports. `computePlacement` composes the
 * stages in `placement/` in an order that carries meaning: two of them change
 * what earlier stages produced, in place (see there).
 */
import { buildClusters } from './placement/clusters'
import { readIndex } from './placement/reads'
import { seedRoots } from './placement/roots'
import {
  extractedExports,
  foldExtractions,
  settleRoots,
} from './placement/settle'
import { keptDeclarations } from './placement/kept'
import { assignHomes } from './placement/homes'
import { includeAndImport } from './placement/inclusion'
import type { Cluster, ClusterId } from './placement/clusters'
import type { Tier1 } from './analysis'
import type { SymbolId } from './symbols'
import type { RegionId, UnitId } from './units'
import type { GenUnitId, OutputId, RewriteSet } from './rewrite'

export type RootRef =
  | { t: 'unit'; id: UnitId }
  | { t: 'gen'; id: GenUnitId }
  /** A module binding a derived output's root reads as its value (J2.8: reported when its effects keep it in the env module). */
  | { t: 'sym'; id: SymbolId }

export type OutputKind =
  | 'env'
  | 'split'
  | 'shared'
  | 'export'
  | 'hydrate'
  | 'provider'
  | 'custom'

export interface HeaderPolicy {
  dropDirectives?: ReadonlyArray<string>
  addDirective?: string
}

export interface OutputDecl {
  id: OutputId
  kind: OutputKind
  /** Short key for shared-module ids and diagnostics (`component`, `h1`, …). */
  key: string
  /** The derived canonical id (null for env). */
  derivedId: string | null
  roots: Array<RootRef>
  header?: HeaderPolicy
  /**
   * Whether the output may be flagged side-effect free to the bundler
   * (`moduleSideEffects: false`). The plan flags it only when no effectful
   * cluster is placed in it: the flag is computed from the content, the
   * declaration opts the output in. Default false.
   */
  sideEffectFree?: boolean
  /** How the core's diagnostics name the output (`` `<Hydrate>` boundary ``; default its key). */
  describe?: string
}

export type Home = OutputId | 'duplicate' | 'removed'

export interface Fallback {
  region: RegionId
  reason:
    | 'shared-writer'
    | 'multi-writer'
    | 'ordered-effect'
    | 'hydrate-writer'
    | 'env-declared'
    /** The planning rounds did not settle: every sub-region is kept in place (reported by the pipeline). */
    | 'exhausted'
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  /** The module's text, for the dev-only invariants' messages. */
  code: string
  routeModule: boolean
  /** Whether an effect unit is a recognised framework call known not to touch user state (asked only when a cluster could move past it). */
  isBenign: (unit: UnitId) => boolean
  /** Exported symbols a planner allows into an extracted-export output. */
  extractions?: ReadonlyMap<SymbolId, OutputId>
  /**
   * Whether extracted-export outputs are emitted (a build) or folded into
   * the env module (dev: `env.mode !== 'build'`); the decision which exports
   * leave, and which of them chunks copy, is the same either way.
   */
  extractedOutputs: boolean
}

/**
 * Why a declaration only split code needs stays in the env module
 * (`Placement.kept`). An exported one (an extraction candidate a chunk
 * reaches): `effects` (an observable initialiser effect), `reassigned`,
 * `live` (the env module reads it), `reads` (it reads, at its evaluation,
 * a binding the env module keeps), `order` (an effect keeps its order). An
 * unexported effectful one, or an eager reader of state: `order` (a surviving effect after its first one, `effect`),
 * `needers` (several lazy outputs need it), `written` (it is written
 * outside its declaration when the module loads, `at`), `state`
 * (it reads, at its evaluation, `read`, which something writes), `reads`
 * (it reads `read`, an effectful or `let` binding the env module keeps).
 * An unexported value with an identity, or a written one, that an
 * extracted export's module and other split code both need: `shared`
 * (one instance, in the env module).
 */
export type KeptReason =
  | 'effects'
  | 'reassigned'
  | 'live'
  | 'reads'
  | 'order'
  | 'needers'
  | 'written'
  | 'state'
  | 'shared'

export interface KeptDeclaration {
  /** The declared symbols (one, an export's, for an exported declaration). */
  syms: Array<SymbolId>
  exported: boolean
  reason: KeptReason
  /** The declaring unit's range, for a positioned diagnostic. */
  range: { start: number; end: number }
  /** The lazy outputs that need it. */
  needers: Array<OutputId>
  /** `order`: the surviving effect that keeps it in place. */
  effect?: UnitId
  /** Whether that effect still evaluates in the env module (else it moves to another output). */
  effectStays?: boolean
  /** `written`: where it is written. */
  at?: number
  /** `state`, `reads`: the binding it reads. */
  read?: SymbolId
}

export interface ExtractedExport {
  output: OutputId
  /** The exported symbols of the cluster (the env module re-exports them from `output`). */
  syms: Array<SymbolId>
}

export interface Placement {
  clusters: Array<Cluster>
  clusterOfRegion: Map<RegionId, ClusterId>
  clusterOfGen: Map<GenUnitId, ClusterId>
  home: Map<ClusterId, Home>
  /** Clusters each output contains (homed or duplicated). */
  included: Map<OutputId, Set<ClusterId>>
  /** o → (home output → symbols o imports from it). */
  imports: Map<OutputId, Map<OutputId, Set<SymbolId>>>
  /** Symbols each output must export for other outputs. */
  exportsNeeded: Map<OutputId, Set<SymbolId>>
  fallbacks: Array<Fallback>
  /** Outputs created by placement (lazy shared modules). */
  created: Array<OutputDecl>
  /** Exported clusters homed in an extracted-export output (the env module re-exports them). */
  extracted: Array<ExtractedExport>
  /** Declarations only lazy outputs need that stay in the env module, with the reason (one per declaration, the cause of a cascade only). */
  kept: Array<KeptDeclaration>
  /** Type units the env module drops (TypeScript-only specifiers that follow their statement's value specifiers); every other type unit stays there, whatever its cluster. */
  droppedTypeUnits: Set<UnitId>
}

/**
 * The stages' order is load-bearing, and a reorder still compiles:
 * - `keptDeclarations` reads the settled `roots`, so it precedes
 *   `foldExtractions`, which rewrites them (dev folds extracted exports back
 *   into the route module: the "kept" reasons describe the build's placement;
 *   it leaves `copied`, so dev's chunks copy or import as a build's do);
 * - `extractedExports` adds to `seeds.deadClusters`, and `assignHomes` reads
 *   them, so it runs after `foldExtractions` and before `assignHomes`;
 * - `assignHomes` roots nothing: what it homes in the env module (an effect,
 *   an identity an extracted module and another output share) `settleRoots`
 *   rooted, inside its fixed point, so that a candidate reading it at load
 *   was cancelled;
 * - `includeAndImport` reads the final `roots` and homes.
 */
export function computePlacement(input: PlacementInput): Placement {
  // 1. clusters, the write table, ordered evaluation
  const graph = buildClusters(input)
  // 2. what each cluster reads, per output
  const reads = readIndex(input, graph)
  // 3. the roots planners and the module declare, extraction candidates, provenance
  const seeds = seedRoots(input, graph, reads)
  // 4. env roots, moving clusters and extracted exports: one fixed point
  const roots = settleRoots(input, graph, reads, seeds)
  // 5. what only split code needs that stays, and why
  const kept = keptDeclarations(input, graph, reads, seeds, roots)
  if (!input.extractedOutputs) {
    foldExtractions(reads, roots)
  }
  const extracted = extractedExports(input, graph, seeds, roots)
  // 6. homes, the single-writer rule
  const homes = assignHomes(input, graph, seeds, roots)
  // 7. inclusion, imports and exports
  const inclusion = includeAndImport(
    input,
    graph,
    reads,
    roots,
    homes,
    extracted,
  )
  return {
    clusters: graph.clusters,
    clusterOfRegion: graph.clusterOfRegion,
    clusterOfGen: graph.clusterOfGen,
    home: homes.home,
    included: inclusion.included,
    imports: inclusion.imports,
    exportsNeeded: inclusion.exportsNeeded,
    fallbacks: [...graph.fallbacks, ...homes.fallbacks],
    created: homes.created,
    extracted,
    kept,
    droppedTypeUnits: inclusion.droppedTypeUnits,
  }
}
