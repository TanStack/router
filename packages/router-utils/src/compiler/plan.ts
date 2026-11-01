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

type EdgeLocation = { range: Range } | { segment: number }

export interface EdgeRecord {
  /** The output's own canonical id. */
  importerId: string
  edgeKey: string
  form: EdgeForm
  kind: 'binding' | 'evaluation'
  specifier: string
  locations: Array<EdgeLocation>
  typeOnly: boolean
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
  planners: Record<string, unknown>
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

/** What planners see in phase B. */
export interface PlanContext {
  readonly analysis: ModuleAnalysis
  readonly t1: Tier1
  readonly identity: SourceIdentity
  readonly env: EnvInfo
  readonly config: unknown
  readonly rewrites: RewriteSet
  readonly names: NameAllocator
  readonly symbols: SymbolTable
  /** Phase A results, by planner name. */
  readonly prefetched: ReadonlyMap<string, unknown>
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
   * Allows an exported, pure, unwritten declaration into `output` (an
   * extracted-export output): the core moves it there when only
   * derived outputs need it, and the env module re-exports it.
   */
  extract: (sym: SymbolId, output: OutputId) => void
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
  renameRefs: (
    sym: SymbolId,
    to: RefTarget,
    scope: EditScope,
    by: string,
    /** References inside these ranges are left to their owner (another planner rewrites them). */
    except?: ReadonlyArray<Range>,
  ) => void
  setFacts: (planner: string, data: unknown) => void
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
  readonly facts: Record<string, unknown> = {}
  readonly benignEffects = new Set<UnitId>()
  readonly extractions = new Map<SymbolId, OutputId>()
  private readonly keptSyms = new Set<SymbolId>()
  /** Whether the module has a value `export * from …` (`glueExportBase`). */
  private starExports: boolean | undefined
  routeModule = false
  moduleWords: ModuleWords | null = null
  placement: Placement | null = null
  /** Renamed directly-exported declarations: sym → export names. */
  readonly exportedRenames = new Map<
    SymbolId,
    { to: RefTarget; names: Array<string>; units: Array<UnitId> }
  >()
  /** Module-wide renames (`renameRefs`): the symbol glue and generated text name instead. */
  readonly renames = new Map<SymbolId, SymbolId>()
  config: unknown = undefined

  constructor(
    readonly analysis: ModuleAnalysis,
    readonly identity: SourceIdentity,
    readonly env: EnvInfo,
    readonly prefetched: ReadonlyMap<string, unknown>,
    readonly fallbacks: ReadonlyArray<FallbackRecord>,
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

  extract(sym: SymbolId, output: OutputId): void {
    if (!this.outputs.has(output)) {
      throw new Error(`extract: unknown output ${output}`)
    }
    if (!this.keptSyms.has(sym)) {
      this.extractions.set(sym, output)
    }
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

  setFacts(planner: string, data: unknown): void {
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
    return this.starExports ? `tsr$${this.nameOf(sym)}` : this.nameOf(sym)
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
    const exportNames: Array<string> = []
    const renamedUnits: Array<UnitId> = []
    const code = this.analysis.source.code
    const name = this.symbols.name(sym)
    for (const uid of declaringUnits.get(sym) ?? []) {
      const u = units[uid]!
      for (const r of u.declNameRanges) {
        if (code.slice(r.start, r.end) !== name) {
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
      const item = this.t1.items[u.item]!
      if (item.exportKeyword !== null && u.exported.length > 0) {
        for (const name of u.exported) {
          if (name === 'default' && item.kind === 'ExportDefaultDeclaration') {
            continue // `export default function a` keeps `export default`
          }
          if (!exportNames.includes(name)) {
            exportNames.push(name) // overloads: one export per name
          }
        }
        renamedUnits.push(uid)
      }
    }
    if (exportNames.length > 0) {
      this.exportedRenames.set(sym, {
        to,
        names: exportNames,
        units: renamedUnits,
      })
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
      out.push({ range: r.range, kind: r.kind, reason: f.reason })
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
