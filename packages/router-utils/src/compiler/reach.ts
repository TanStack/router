/**
 * Placement, a generic service: planners supply roots and derived outputs;
 * the core decides what each output contains and what it imports. The
 * types of the placement's input and result; `route-placement.ts` places
 * every plan.
 */
import type { ClusterId } from './placement/clusters'
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
  /** How the core's diagnostics name the output (`` `<Hydrate>` boundary ``; default its key). */
  describe?: string
  /**
   * A `hydrate` output: the module bindings it imports from the module that
   * holds them; it copies the others (H2 (a), spec-phase2-hydrate: the per-output
   * form of `RouteModule.imported`).
   */
  imported?: ReadonlySet<SymbolId>
}

export type Home = OutputId | 'duplicate' | 'removed'

export interface Fallback {
  region: RegionId
  reason: /** A derived output would assign a binding it imports, or (a `<Hydrate>` chunk) its copy of one the env module keeps. */
    | 'shared-writer'
    /** The planning rounds did not settle: every sub-region is kept in place (reported by the pipeline). */
    | 'exhausted'
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  /** The module's text, for the invariants' messages (`self-checks.ts`). */
  code: string
  /** A route file (`PlanContext.setRouteModule`): placed by `route-placement.ts`. */
  routeModule: RouteModule | null
  /** Exported symbols a planner allows into an extracted-export output. */
  extractions?: ReadonlyMap<SymbolId, OutputId>
  /**
   * Whether extracted-export outputs are emitted (a build) or folded into
   * the env module (dev: `env.mode !== 'build'`); the decision which exports
   * leave, and which of them chunks copy, is the same either way.
   */
  extractedOutputs: boolean
}

export interface ExtractedExport {
  output: OutputId
  /** The exported symbols of the cluster (the env module re-exports them from `output`). */
  syms: Array<SymbolId>
}

/** A route file's placement input (`PlanContext.setRouteModule`). */
export interface RouteModule {
  /** The module bindings a split chunk imports from the route module when it reads them (it copies the others). */
  imported: ReadonlySet<SymbolId>
  /** The names `main` shares (`computeSharedBindings`): an exported one only chunks read moves to the shared module, which the route module re-exports it from. */
  shared: ReadonlySet<SymbolId>
  /** The route binding (`Route`): a `<Hydrate>` chunk imports it too, whatever encloses the boundary (H2 (a)). */
  route?: SymbolId
}

export interface Placement {
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
  /** Type units the env module drops (TypeScript-only specifiers that follow their statement's value specifiers); every other type unit stays there, whatever its cluster. */
  droppedTypeUnits: Set<UnitId>
}
