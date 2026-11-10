/**
 * The two-layer plan: the ephemeral `AnalysisPlan` holds
 * the analysis, the rewrite set, the declared outputs and the planners'
 * facts for one compile attempt; `resolve()` runs the core phase (claims,
 * clusters, movable effects, roots, homes, inclusion, glue needs; `reach.ts`
 * over `placement/`)
 * and `freeze()` renders everything into a plain `EmitPlan` from which no
 * Yuku object is reachable (`freeze.ts`).
 */
import { deriveId, edgeKeyOf } from './identity'
import { NameAllocator } from './names'
import { computePlacement } from './reach'
import { firstImpure, keptDiagnostic } from './kept-diagnostics'
import { freezePlan } from './freeze'
import { cleanOrphanedDeclarations } from './orphans'
import { RewriteSet } from './rewrite'
import type {
  Fallback,
  HeaderPolicy,
  OutputDecl,
  OutputKind,
  Placement,
  RootRef,
} from './reach'
import type { ModuleAnalysis, Tier1 } from './analysis'
import type { Diagnostic } from './diagnostics'
import type { Range } from './header'
import type { DerivedQuery, SourceIdentity } from './identity'
import type { SymbolId, SymbolTable } from './symbols'
import type { RegionId, RegionKind, UnitId } from './units'
import type {
  EdgeProvenance,
  EditScope,
  GlueImport,
  LivenessView,
  OutputId,
  RefTarget,
} from './rewrite'
import type { DependencyFingerprint } from './cache'
import type {
  PlannerConfig,
  PlannerFacts,
  PlannerFactsByName,
  PlannerPrefetches,
} from './host'

export type {
  OutputDecl,
  OutputKind,
  RootRef,
  HeaderPolicy,
  Fallback,
} from './reach'

export interface EnvInfo {
  name: string
  type: 'client' | 'server'
  isProvider?: boolean
  mode: 'dev' | 'build'
  layer?: string
}

export type EdgeForm =
  | 'static'
  | 'bare'
  | 'reexport'
  | 'star'
  | 'dynamic'
  | 'require'

export interface EdgeRecord {
  /** The output's own canonical id. */
  importerId: string
  edgeKey: string
  form: EdgeForm
  kind: 'binding' | 'evaluation'
  specifier: string
  /** The source literals of this specifier; a generated specifier has none. */
  locations: Array<{ range: Range }>
  names: Array<string>
  provenance: EdgeProvenance
}

export type Segment =
  | { k: 'slice'; start: number; end: number; edgeKey?: string }
  | { k: 'text'; text: string; mapTo?: number; edgeKey?: string }

export interface OutputRecipe {
  kind: OutputKind
  /** The derived canonical id (null for env). */
  derivedId: string | null
  mapSource: string
  segments: Array<Segment>
}

export interface PlanFacts {
  marker: 'server-only' | 'client-only' | 'conflict' | null
  /** Planner facts by planner name; plain data only. */
  planners: PlannerFactsByName
}

export interface EmitPlan {
  revision: string
  outputs: Record<string, OutputRecipe>
  edges: Record<string, Array<EdgeRecord>>
  facts: PlanFacts
  dependencies: Array<DependencyFingerprint>
  diagnostics: Array<Diagnostic>
  sideEffects: Record<string, boolean>
}

export interface FallbackRecord {
  range: Range
  kind: RegionKind
  reason: Fallback['reason']
  /** The name of the binding a writer fallback writes. */
  binding?: string
}

interface OutputSpec {
  kind: Exclude<OutputKind, 'env' | 'shared'>
  key: string
  /** The owned query; the output id is `deriveId(canonicalId, derived)`. */
  derived: DerivedQuery
  roots?: Array<RootRef>
  header?: HeaderPolicy
  sideEffectFree?: boolean
  /** How the core's diagnostics name the output (default: its key, `` `component` ``). */
  describe?: string
}

/** How the core's diagnostics name a module (`describeModule`). */
interface ModuleWords {
  /** `route module` (default `module`). */
  name: string
  /** The prefix of the planner's own diagnostics, `[tanstack-router]`. */
  tag: string
}

/** What planner `TName` sees in phase B. */
export interface PlanContext<TName extends string = string> {
  readonly analysis: ModuleAnalysis
  readonly t1: Tier1
  readonly identity: SourceIdentity
  /** The module as messages name it: relative to the project root (`displayPath`). */
  readonly displayPath: string
  readonly env: EnvInfo
  readonly config: PlannerConfig<TName>
  readonly rewrites: RewriteSet
  readonly names: NameAllocator
  readonly symbols: SymbolTable
  /** Phase A results, by planner name. */
  readonly prefetched: PlannerPrefetches
  /** The core's fallback of a previous round on exactly `range` (of `kind`, when given). */
  fallbackAt: (range: Range, kind?: RegionKind) => FallbackRecord | undefined
  region: (range: Range, kind: Exclude<RegionKind, 'unit'>) => RegionId
  declareOutput: (spec: OutputSpec) => OutputId
  addRoot: (output: OutputId, root: RootRef) => void
  /**
   * Names a recognised framework call known not to touch user state (the
   * route factory chain): the core treats the unit as no effect for the
   * evaluation-order rules when its option values are pure expressions,
   * claimed regions (relocated: a lazy wrapper replaces them) or values the
   * env output erases; an impure option value keeps it an effect.
   */
  markBenignEffect: (unit: UnitId) => void
  /**
   * Allows an exported, pure, unwritten declaration into its extracted-export
   * output: the core moves it there when only derived outputs need it, and the
   * env module re-exports it. The output takes the first name the module
   * exports the binding under (`export { x as Public }`: the id and the
   * diagnostics say `Public`).
   */
  extractExport: (sym: SymbolId, exportName: string) => void
  /** Keeps an exported binding in the env module whatever another planner offered (the route itself). */
  keep: (sym: SymbolId) => void
  setRouteModule: () => void
  /** Names the module in the core's diagnostics (`the route module`, tagged like the planner's own). */
  describeModule: (words: ModuleWords) => void
  liveness: (output: OutputId) => LivenessView
  /** The binding name a symbol renders as (after module-wide renames). */
  nameOf: (sym: SymbolId) => string
  /**
   * The name the env module exports `sym` under as glue for another output,
   * as freeze allocates it (a module export or an earlier glue name takes
   * `x`, `x$1` …); a planner naming it ahead (route HMR) may miss a glue
   * name another binding's glue took first.
   */
  glueExportName: (sym: SymbolId) => string
  /**
   * Appends `$<tag>` to the env module's glue export names. A planner whose
   * glue joins the exports of a module user code imports (an in-place
   * server-fn provider) passes a tag of the file: a barrel's `export *` of
   * two such modules would otherwise see one generated name twice. Called
   * before any `glueExportName` of the module.
   */
  tagGlueExports: (tag: string) => void
  renameRefs: (
    sym: SymbolId,
    to: RefTarget,
    scope: EditScope,
    by: string,
    /** References inside these ranges are left to their owner (another planner rewrites them). */
    except?: ReadonlyArray<Range>,
  ) => void
  setFacts: <TPlanner extends string>(
    planner: TPlanner,
    data: PlannerFacts<TPlanner>,
  ) => void
  diagnostic: (d: Diagnostic) => void
  /**
   * A diagnostic about the code at `d.range`, reported only if that code
   * ships: once every planner erased what it erases and the core dropped what
   * only erased code read, some output that holds the range still renders
   * its position. An edit on exactly the range (the planner rewriting the
   * value there) does not hide it; a use inside code no output keeps (a
   * server-only option, a handler a stub replaced) is none. `at` judges
   * another range instead of `d.range` (a use the planner itself erases, in a
   * declaration that ships). With `unlessLive`, it is reported only if none of
   * those ranges ships either (a parameter whose every read was erased).
   */
  liveDiagnostic: (
    d: Diagnostic & { range: Range },
    when?: { at?: Range; unlessLive?: ReadonlyArray<Range> },
  ) => void
  /** One logical edge per user dependency; glue edges of another origin hash separately. */
  edgeKey: (
    rawSpecifier: string,
    form: EdgeForm,
    origin?: EdgeProvenance['origin'],
  ) => string
}

export class AnalysisPlan implements PlanContext {
  readonly t1: Tier1
  readonly rewrites: RewriteSet
  readonly names: NameAllocator
  readonly symbols: SymbolTable
  readonly outputs = new Map<OutputId, OutputDecl>()
  readonly diagnostics: Array<Diagnostic> = []
  /** `liveDiagnostic`s, decided in `resolve()`. */
  private readonly liveDiagnostics: Array<{
    d: Diagnostic & { range: Range }
    at: Range
    unlessLive: ReadonlyArray<Range>
  }> = []
  readonly facts: PlannerFactsByName = {}
  readonly benignEffects = new Set<UnitId>()
  readonly extractions = new Map<SymbolId, OutputId>()
  private readonly keptSyms = new Set<SymbolId>()
  /** Whether the module has a value `export * from …` (`glueExportBase`). */
  private starExports: boolean | undefined
  /** `tagGlueExports` (`glueExportBase`). */
  private glueTag: string | null = null
  routeModule = false
  moduleWords: ModuleWords | null = null
  placement: Placement | null = null
  /**
   * Renamed directly-exported declarations (`export const a = …`, exported
   * under the binding's own name): sym → the new binding.
   */
  readonly exportedRenames = new Map<SymbolId, RefTarget>()
  /** Module-wide renames (`renameRefs`): the symbol glue and generated text name instead. */
  readonly renames = new Map<SymbolId, SymbolId>()
  config: unknown = undefined

  constructor(
    readonly analysis: ModuleAnalysis,
    readonly identity: SourceIdentity,
    readonly env: EnvInfo,
    readonly prefetched: PlannerPrefetches,
    readonly fallbacks: ReadonlyArray<FallbackRecord>,
    /** The module as messages name it (`displayPath`). */
    readonly displayPath: string = identity.path,
  ) {
    this.t1 = analysis.t1()
    this.symbols = this.t1.symbols
    this.rewrites = new RewriteSet(this.t1.regions)
    this.names = new NameAllocator(
      this.t1.names,
      this.t1.exportNames,
      this.symbols,
    )
    this.outputs.set('env', {
      id: 'env',
      kind: 'env',
      key: 'env',
      derivedId: null,
      roots: [],
    })
    // J2.17: the deprecated `assert` keyword of import attributes is printed
    // as `with` wherever the import lands (browsers dropped `assert`)
    const code = analysis.source.code
    for (const imp of analysis.imports) {
      if (!imp.attributesRange) {
        continue
      }
      const start = attributesKeywordStart(
        code,
        imp.specifierRange.end,
        imp.attributesRange.start,
      )
      if (code.startsWith('assert', start)) {
        this.rewrites.add({
          range: { start, end: start + 'assert'.length },
          body: [{ k: 'text', parts: ['with'] }],
          scope: 'all-outputs',
          by: 'core:attributes',
        })
      }
    }
  }

  region(range: Range, kind: Exclude<RegionKind, 'unit'>): RegionId {
    return this.t1.regions.register(range, kind)
  }

  declareOutput(spec: OutputSpec): OutputId {
    const derivedId = deriveId(this.identity.canonicalId, spec.derived)
    const id: OutputId = `derived:${derivedId}`
    const existing = this.outputs.get(id)
    if (existing) {
      for (const r of spec.roots ?? []) {
        existing.roots.push(r)
      }
      return id
    }
    this.outputs.set(id, {
      id,
      kind: spec.kind,
      key: spec.key,
      derivedId,
      roots: [...(spec.roots ?? [])],
      header: spec.header,
      sideEffectFree: spec.sideEffectFree,
      describe: spec.describe,
    })
    return id
  }

  addRoot(output: OutputId, root: RootRef): void {
    const decl = this.outputs.get(output)
    if (!decl) {
      throw new Error(`addRoot: unknown output ${output}`)
    }
    decl.roots.push(root)
  }

  markBenignEffect(unit: UnitId): void {
    this.benignEffects.add(unit)
  }

  extractExport(sym: SymbolId, exportName: string): void {
    if (this.extractions.has(sym) || this.keptSyms.has(sym)) {
      return
    }
    this.extractions.set(
      sym,
      this.declareOutput({
        kind: 'export',
        key: `export~${exportName}`,
        derived: { kind: 'export', value: exportName },
        sideEffectFree: true,
      }),
    )
  }

  keep(sym: SymbolId): void {
    this.keptSyms.add(sym)
    this.extractions.delete(sym)
  }

  setRouteModule(): void {
    this.routeModule = true
  }

  describeModule(words: ModuleWords): void {
    this.moduleWords = words
  }

  liveness(output: OutputId): LivenessView {
    return this.rewrites.liveness(output)
  }

  setFacts<TPlanner extends string>(
    planner: TPlanner,
    data: PlannerFacts<TPlanner>,
  ): void {
    this.facts[planner] = data
  }

  diagnostic(d: Diagnostic): void {
    this.diagnostics.push(d)
  }

  liveDiagnostic(
    d: Diagnostic & { range: Range },
    when: { at?: Range; unlessLive?: ReadonlyArray<Range> } = {},
  ): void {
    this.liveDiagnostics.push({
      d,
      at: when.at ?? d.range,
      unlessLive: when.unlessLive ?? [],
    })
  }

  edgeKey(
    rawSpecifier: string,
    form: EdgeForm,
    origin: EdgeProvenance['origin'] = 'source',
  ): string {
    return edgeKeyOf(
      this.env.name,
      this.env.layer,
      this.identity.canonicalId,
      rawSpecifier,
      form,
      origin,
    )
  }

  /** The binding name a symbol renders as (after module-wide renames). */
  nameOf(sym: SymbolId): string {
    const to = this.renames.get(sym)
    return this.symbols.name(to ?? sym)
  }

  glueExportName(sym: SymbolId): string {
    return this.names.peekExportName(this.glueExportBase(sym))
  }

  /**
   * What a glue export of `sym` is named after: its name, or in a module
   * with `export * from …`, which may export any name (its modules are not
   * read), a name of the compiler's own (`tsr$x`), so the glue never
   * shadows a re-exported binding for the module's importers.
   */
  glueExportBase(sym: SymbolId): string {
    this.starExports ??= this.analysis.exports.some(
      (e) => e.kind === 'star' && !e.typeOnly,
    )
    const base = this.starExports ? `tsr$${this.nameOf(sym)}` : this.nameOf(sym)
    return this.glueTag === null ? base : `${base}$${this.glueTag}`
  }

  tagGlueExports(tag: string): void {
    this.glueTag = tag
  }

  /** Renames every reference and declaration of `sym` (context-aware; exports keep their public names). */
  renameRefs(
    sym: SymbolId,
    to: RefTarget,
    scope: EditScope,
    by: string,
    except: ReadonlyArray<Range> = [],
  ): void {
    const { refs, units, declaringUnits } = this.t1
    if ('sym' in to) {
      this.renames.set(sym, to.sym)
    }
    const declared = (declaringUnits.get(sym) ?? []).flatMap(
      (u) => units[u]!.declNameRanges,
    )
    for (const ref of refs.refsOf(sym)) {
      if (
        ref.kind === 'implicitJsxFactory' ||
        // renamed as a declaration below (a `var` declared again is a write too)
        declared.some((r) => r.start === ref.range.start)
      ) {
        continue
      }
      if (
        except.some((r) => ref.range.start >= r.start && ref.range.end <= r.end)
      ) {
        continue
      }
      this.rewrites.ref(ref, to, scope, by)
    }
    const name = this.symbols.name(sym)
    for (const uid of declaringUnits.get(sym) ?? []) {
      const u = units[uid]!
      for (const r of u.declNameRanges) {
        const id = this.t1.nodeAt(r.start)
        if (id?.type !== 'Identifier' || id.name !== name) {
          continue // another binding of the same declarator (destructuring)
        }
        if (this.isShorthandPatternName(r)) {
          // `const { a } = …` / `{ a = d }`: the key stays, the binding is renamed
          this.rewrites.add({
            range: r,
            body: [{ k: 'ref', range: r, to, ctx: 'shorthandPattern' }],
            scope,
            by,
          })
        } else {
          this.rewrites.declName(r, to, scope, by)
        }
      }
      // an exported declaration exports each binding under its own name
      // (`export default function a` exports `default` and keeps it; a
      // declarator's sibling bindings keep theirs)
      if (
        this.t1.items[u.item]!.exportKeyword !== null &&
        u.exported.includes(name)
      ) {
        this.exportedRenames.set(sym, to)
      }
    }
  }

  /** Whether a declaration name is the shorthand of an object pattern property (`{ a }`, `{ a = d }`). */
  private isShorthandPatternName(r: Range): boolean {
    const node = this.t1.nodeAt(r.start)
    if (!node || node.start !== r.start || node.end !== r.end) {
      return false
    }
    let parent = this.t1.parentOf(node)
    if (parent?.type === 'AssignmentPattern' && parent.left === node) {
      parent = this.t1.parentOf(parent)
    }
    return parent?.type === 'Property' && parent.shorthand === true
  }

  /** The core phase after all planners: placement over the live rewrite tree. */
  resolve(): Placement {
    // function-scope declarations only erased code read go once every
    // planner erased what it erases (placement decides the module level)
    if (this.rewrites.tree('env').erasedParts().length > 0) {
      cleanOrphanedDeclarations(this, this.outputs)
    }
    const benign = new Map<UnitId, boolean>()
    const placement = computePlacement({
      t1: this.t1,
      rewrites: this.rewrites,
      outputs: this.outputs,
      canonicalId: this.identity.canonicalId,
      code: this.analysis.source.code,
      routeModule: this.routeModule,
      isBenign: (u) => {
        if (!this.benignEffects.has(u)) {
          return false
        }
        let hit = benign.get(u)
        if (hit === undefined) {
          hit = firstImpure(this, this.t1.units[u]!) === null
          benign.set(u, hit)
        }
        return hit
      },
      extractions: this.extractions,
      extractedOutputs: this.env.mode === 'build',
    })
    for (const created of placement.created) {
      this.outputs.set(created.id, created)
    }
    for (const k of placement.kept) {
      this.diagnostic(keptDiagnostic(this, k))
    }
    for (const { d, at, unlessLive } of this.liveDiagnostics) {
      if (
        this.ships(placement, at) &&
        !unlessLive.some((r) => this.ships(placement, r))
      ) {
        this.diagnostic(d)
      }
    }
    this.placement = placement
    return placement
  }

  /** Whether an output that holds the code at `range` renders its position (`liveDiagnostic`). */
  private ships(placement: Placement, range: Range): boolean {
    const region = this.t1.regions.innermostAt(range.start, range.end)
    const cluster =
      region === null ? undefined : placement.clusterOfRegion.get(region)
    for (const [output, clusters] of placement.included) {
      if (cluster !== undefined && !clusters.has(cluster)) {
        continue
      }
      if (!this.rewrites.tree(output).isErasedAt(range.start, null, range)) {
        return true
      }
    }
    return false
  }

  fallbackAt(range: Range, kind?: RegionKind): FallbackRecord | undefined {
    return this.fallbacks.find(
      (f) =>
        f.range.start === range.start &&
        f.range.end === range.end &&
        (kind === undefined || f.kind === kind),
    )
  }

  /** Fallbacks of the last `resolve()`, keyed by range (planners re-plan with them). */
  fallbackRecords(): Array<FallbackRecord> {
    const out: Array<FallbackRecord> = []
    for (const f of this.placement?.fallbacks ?? []) {
      const r = this.t1.regions.get(f.region)
      out.push({
        range: r.range,
        kind: r.kind,
        reason: f.reason,
        ...(f.binding !== undefined && {
          binding: this.symbols.name(f.binding),
        }),
      })
    }
    return out
  }

  freeze(revision: string): EmitPlan {
    return freezePlan(this, revision)
  }
}

export type { GlueImport }

/** The start of the first word between `from` and `to`, skipping whitespace and comments. */
function attributesKeywordStart(
  code: string,
  from: number,
  to: number,
): number {
  let i = from
  while (i < to) {
    const c = code.charCodeAt(i)
    if (c === 47 /* / */ && code.charCodeAt(i + 1) === 42 /* * */) {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? to : end + 2
    } else if (c === 47 && code.charCodeAt(i + 1) === 47) {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? to : end + 1
    } else if (/\s/.test(code[i]!)) {
      i++
    } else {
      return i
    }
  }
  return to
}
