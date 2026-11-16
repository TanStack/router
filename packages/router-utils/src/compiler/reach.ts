/**
 * Placement, a generic service: planners supply roots and derived outputs;
 * the core decides what each output contains and what it imports. The
 * types of the placement's input and result; `route-placement.ts` places
 * every plan.
 */
import type { ClusterId } from './placement/clusters'
import type { Tier1 } from './analysis'
import type { InvariantViolation } from './self-checks'
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
  /** `shared-writer`, `multi-writer`: the module binding the region writes; `ordered-effect`: the one it writes or reads. */
  binding?: SymbolId
  /** `ordered-effect`: the value writes `binding` (when it loads, or in a function its call runs) rather than reading what other code writes, and other code uses it (`used`) or it stays where the value does not evaluate (`kept`). */
  writes?: 'used' | 'kept'
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

/**
 * Why a declaration only split code needs stays in the env module
 * (`Placement.kept`). An exported one (an extraction candidate a chunk
 * reaches): `live` (the env module reads it), `reads` (it reads, at its
 * evaluation, a binding the env module keeps), `unneeded` (no derived
 * output needs it once extraction is decided). An
 * unexported effectful one, or an eager reader of state:
 * `needers` (several lazy outputs need it), `written` (it is written
 * outside its declaration when the module loads, `at`), `state`
 * (it reads, at its evaluation, `read`, which something writes).
 * An unexported value with an identity, or a written one, that an
 * extracted export's module and other split code both need: `shared`
 * (one instance, in the env module).
 */
export type KeptReason =
  | 'live'
  | 'reads'
  | 'unneeded'
  | 'needers'
  | 'written'
  | 'state'
  | 'shared'
  /** Unused code (R148) keeping bindings in the env module, or putting bindings of several split outputs in one shared module (`shared`). */
  | 'unused'

export interface KeptDeclaration {
  /** The declared symbols (one, an export's, for an exported declaration). */
  syms: Array<SymbolId>
  exported: boolean
  reason: KeptReason
  /** The declaring unit's range, for a positioned diagnostic. */
  range: { start: number; end: number }
  /** The lazy outputs that need it. */
  needers: Array<OutputId>
  /** `written`: where it is written; `state`: where the module writes `read` when it loads (O; none: later, V). */
  at?: number
  /** `state`, `reads`: the binding it reads; `written`: the binding the statement also changes, which keeps it. */
  read?: SymbolId
  /** `written`: the split output using `read`, or the subject's second one. */
  in?: OutputId
  /** `written`: the statement only uses it (it changes none of its bindings). */
  uses?: boolean
  /** `written`: the statement changes `read` (else it uses it). */
  readChanged?: boolean
  /** `written`: the statement can change `read` in a statement of its own. */
  split?: boolean
  /** `written`: the statement is the declaration of `syms` itself (its initialiser changes `read`). */
  declaration?: boolean
  /** `written`: where code the env module keeps uses `read`, which the statement changes: moved or deleted, the statement would change what that code sees (no move is offered). */
  seen?: number
  /** `unused`: the unused declaration (R148), positioned at by `range`. */
  unused?: SymbolId
  /** `unused`: the other unused declarations joining the same bindings (each with its position): deleting all of them separates them. */
  moreUnused?: Array<{ sym: SymbolId; at: number }>
  /** `unused`: it puts `syms` in one lazy shared module its `needers` import (R151), not in the env module. */
  shared?: boolean
  /** `written`: code that runs later changes it, there. */
  later?: number
  /** `written`: the binding of the code using `read` when the module loads, which the statement changes later. */
  reader?: SymbolId
  /** `state`: it uses `read` only in what it hands to this call (`''`: too long to quote), which may or may not run it then. */
  handedTo?: string
  /**
   * `state`, `reads`, `written`: what the move to a module of their own
   * takes besides it and `read` (`Events.movedWith`): the other bindings,
   * the statements reading one before a write when the module loads (their
   * positions), and whether the module writes a moved binding then (the
   * statements writing them move; `written`: besides the statement named).
   */
  moves?: { syms: Array<SymbolId>; statements: Array<number>; written: boolean }
  /** `state`, `reads`, `written`: no module of its own can take it: it would need this code, which stays in the env module (its binding, if it has one, and position). */
  stuck?: { sym?: SymbolId; at: number }
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
  /** Declarations only lazy outputs need that stay in the env module, with the reason (one per declaration, the cause of a cascade only). */
  kept: Array<KeptDeclaration>
  /** Type units the env module drops (TypeScript-only specifiers that follow their statement's value specifiers); every other type unit stays there, whatever its cluster. */
  droppedTypeUnits: Set<UnitId>
  /**
   * The placement's invariants (`self-checks.ts`): the first violated one,
   * when the run warns instead of throwing. Asked by the pipeline of the
   * plan it compiles the module with only: an earlier round's placement is
   * planned again, and the last one may keep a fallback nobody acted on.
   */
  check: () => InvariantViolation | undefined
}
