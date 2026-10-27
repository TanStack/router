/**
 * The two-layer plan: the ephemeral `AnalysisPlan` holds
 * the analysis, the rewrite set, the declared outputs and the planners'
 * facts for one compile attempt; `resolve()` runs the core phase (claims,
 * clusters, movable effects, roots, homes, inclusion, glue, statement-level
 * edits, per-output edges) and `freeze()` renders everything into a plain
 * `EmitPlan` from which no Yuku object is reachable.
 */
import { deriveId, edgeKeyOf, siblingSpecifier } from './identity'
import { NameAllocator } from './names'
import { computePlacement } from './reach'
import { RewriteSet } from './rewrite'
import { specifierLiteral, stringLiteral } from './strings'
import { statementRecipe } from './units'
import { isPureExpression } from './purity'
import { unwrapExpression } from './source'
import { isLineTerminator, pragmasOf } from './header'
import type {
  Fallback,
  HeaderPolicy,
  OutputDecl,
  OutputKind,
  Placement,
  RootRef,
} from './reach'
import type {
  ClassifiedRef,
  ModuleAnalysis,
  RefContext,
  Tier1,
} from './analysis'
import type { Diagnostic } from './diagnostics'
import type { Range } from './header'
import type { DerivedQuery, PlanKey, SourceIdentity } from './identity'
import type { SymbolId, SymbolTable } from './symbols'
import type { RegionId, RegionKind, TopLevelItem, Unit, UnitId } from './units'
import type {
  EdgeProvenance,
  EditScope,
  Frag,
  GeneratedUnit,
  GlueImport,
  LivenessView,
  OutputId,
  RefTarget,
  RenderTree,
  SubstEnv,
  SymRefContext,
  TreeEdit,
} from './rewrite'
import type { DependencyFingerprint } from './cache'
import type { Node } from 'yuku'

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
  bundler: 'vite' | 'rspack' | 'webpack' | 'esbuild' | 'test'
  framework: 'react' | 'solid' | 'vue' | null
  conditions: ReadonlyArray<string>
  routerSplit: boolean
  layer?: string
}

export type EdgeForm =
  | 'static'
  | 'bare'
  | 'reexport'
  | 'star'
  | 'dynamic'
  | 'require'

export type EdgeLocation = { range: Range } | { segment: number }

export interface EdgeRecord {
  output: OutputId
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
  id: OutputId
  kind: OutputKind
  /** The derived canonical id (null for env). */
  derivedId: string | null
  mapSource: string
  segments: Array<Segment>
}

export interface PlanFacts {
  marker: 'server-only' | 'client-only' | 'conflict' | null
  publishedSummaryDigest: string | null
  /** Planner facts by planner name; plain data only. */
  planners: Record<string, unknown>
}

export interface EmitPlan {
  key: PlanKey
  revision: string
  sourceLength: number
  outputs: Record<string, OutputRecipe>
  edges: Record<string, Array<EdgeRecord>>
  facts: PlanFacts
  dependencies: Array<DependencyFingerprint>
  fingerprint: string
  diagnostics: Array<Diagnostic>
  sideEffects: Record<string, boolean>
  /** Range-keyed fallbacks of the last planning round, for diagnostics. */
  fallbacks: Array<FallbackRecord>
}

export interface FallbackRecord {
  range: Range
  kind: RegionKind
  reason: Fallback['reason']
}

export interface OutputSpec {
  kind: Exclude<OutputKind, 'env' | 'shared'>
  key: string
  /** The owned query; the output id is `deriveId(canonicalId, derived)`. */
  derived: DerivedQuery
  roots?: Array<RootRef>
  header?: HeaderPolicy
  sideEffectFree?: boolean
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
  /** Fallbacks reported by the core in a previous planning round. */
  readonly fallbacks: ReadonlyArray<FallbackRecord>
  /** The core's fallback of a previous round on exactly `range` (of `kind`, when given). */
  fallbackAt: (range: Range, kind?: RegionKind) => FallbackRecord | undefined
  region: (range: Range, kind: Exclude<RegionKind, 'unit'>) => RegionId
  declareOutput: (spec: OutputSpec) => OutputId
  outputIdFor: (derived: DerivedQuery) => OutputId
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
  setRouteModule: () => void
  liveness: (output: OutputId) => LivenessView
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
  readonly facts: Record<string, unknown> = {}
  readonly benignEffects = new Set<UnitId>()
  readonly extractions = new Map<SymbolId, OutputId>()
  routeModule = false
  placement: Placement | null = null
  /** Renamed directly-exported declarations: sym → export names. */
  private readonly exportedRenames = new Map<
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

  outputIdFor(derived: DerivedQuery): OutputId {
    return `derived:${deriveId(this.identity.canonicalId, derived)}`
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
    this.extractions.set(sym, output)
  }

  setRouteModule(): void {
    this.routeModule = true
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

  /** Renames every reference and declaration of `sym` (context-aware; exports keep their public names). */
  /** The binding name a symbol renders as (after module-wide renames). */
  nameOf(sym: SymbolId): string {
    const to = this.renames.get(sym)
    return this.symbols.name(to ?? sym)
  }

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
    for (const ref of refs.refsOf(sym)) {
      if (ref.kind === 'implicitJsxFactory') {
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
    const benignEffects = new Set<UnitId>()
    for (const u of this.benignEffects) {
      if (this.benignUnit(this.t1.units[u]!)) {
        benignEffects.add(u)
      }
    }
    const placement = computePlacement({
      t1: this.t1,
      rewrites: this.rewrites,
      outputs: this.outputs,
      canonicalId: this.identity.canonicalId,
      routeModule: this.routeModule,
      benignEffects,
      extractions: this.extractions,
    })
    for (const created of placement.created) {
      this.outputs.set(created.id, created)
    }
    this.placement = placement
    return placement
  }

  /**
   * Whether a unit a planner named benign is: its expression is a call
   * chain (`f(a)(b)`, `f(a).g(b)`) whose every argument is a pure value. An
   * object literal argument is judged per property; a value that is a
   * claimed region evaluates in another output through a pure wrapper, and
   * one the env output erases not at all.
   */
  private benignUnit(unit: Unit): boolean {
    const node = unit.node
    const expr =
      node.type === 'VariableDeclarator'
        ? node.init
        : node.type === 'ExpressionStatement'
          ? node.expression
          : node.type === 'ExportDefaultDeclaration'
            ? node.declaration
            : null
    if (expr === null) {
      return false
    }
    const env = this.rewrites.tree('env')
    // the claimed regions by start offset (few per module)
    const claimedEnd = new Map<number, number>()
    for (const claim of this.rewrites.claims.values()) {
      const r = this.t1.regions.get(claim.region).range
      claimedEnd.set(r.start, r.end)
    }
    const benignValue = (v: Node): boolean => {
      if (claimedEnd.get(v.start) === v.end || env.isErasedAt(v.start)) {
        return true
      }
      const n = unwrapExpression(v)
      if (n.type === 'ObjectExpression') {
        return n.properties.every((p) =>
          p.type === 'SpreadElement'
            ? isPureExpression(this.analysis.purity, p)
            : (!p.computed ||
                isPureExpression(this.analysis.purity, p.key as Node)) &&
              (p.kind !== 'init' ||
                env.isErasedAt(p.start) ||
                benignValue(p.value as Node)),
        )
      }
      return isPureExpression(this.analysis.purity, v)
    }
    let n: Node = unwrapExpression(expr)
    let calls = 0
    for (;;) {
      if (n.type === 'CallExpression') {
        calls++
        if (
          !n.arguments.every(
            (a) => a.type !== 'SpreadElement' && benignValue(a),
          )
        ) {
          return false
        }
        n = unwrapExpression(n.callee)
      } else if (n.type === 'MemberExpression' && !n.computed) {
        n = unwrapExpression(n.object)
      } else {
        return calls > 0
      }
    }
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

  // ---------------------------------------------------------------------------
  // freeze
  // ---------------------------------------------------------------------------

  freeze(key: PlanKey, revision: string): EmitPlan {
    const placement = this.placement ?? this.resolve()
    const { analysis } = this
    const code = analysis.source.code
    const outputs: Record<string, OutputRecipe> = {}
    const edges: Record<string, Array<EdgeRecord>> = {}
    const sideEffects: Record<string, boolean> = {}

    // export names for symbols other outputs import from their home
    const exportNameOf = new Map<OutputId, Map<SymbolId, string>>()
    /** Symbols whose export is glue (not an existing export of the module). */
    const glueExports = new Set<SymbolId>()
    const existingExportName = (sym: SymbolId): string | null => {
      for (const e of analysis.exports) {
        if (e.kind === 'local' && e.local === sym && !e.typeOnly) {
          return e.name
        }
      }
      return null
    }
    for (const [home, syms] of placement.exportsNeeded) {
      const map = new Map<SymbolId, string>()
      for (const s of [...syms].sort((a, b) => a - b)) {
        let name: string
        if (home === 'env') {
          const existing = existingExportName(s)
          if (existing !== null && !this.exportedRenames.has(s)) {
            name = existing
          } else {
            name = this.names.allocExportName(this.nameOf(s))
            glueExports.add(s)
          }
        } else {
          name = this.nameOf(s)
        }
        map.set(s, name)
      }
      exportNameOf.set(home, map)
    }

    const renderer = new Renderer(this, code)
    const extractedOutputs = new Set(placement.extracted.map((e) => e.output))

    for (const [id, decl] of this.outputs) {
      // an extracted export the core kept in the env module produces no
      // module: a request for it (a stale importer) emits `export {}`
      if (decl.kind === 'export' && !extractedOutputs.has(id)) {
        continue
      }
      const included = placement.included.get(id) ?? new Set()
      const recipeEdges: Array<EdgeRecord> = []
      const importerId = decl.derivedId ?? this.identity.canonicalId
      renderer.begin(id, importerId, recipeEdges)
      const segments: Array<Segment> =
        id === 'env'
          ? this.renderEnv(
              renderer,
              placement,
              included,
              exportNameOf,
              glueExports,
            )
          : this.renderDerived(
              renderer,
              decl,
              placement,
              included,
              exportNameOf,
            )
      // source import edges: split the specifier literals into their own segments
      this.sourceEdges(
        id,
        importerId,
        included,
        renderer.tree,
        segments,
        recipeEdges,
      )
      outputs[id] = {
        id,
        kind: decl.kind,
        derivedId: decl.derivedId,
        mapSource: this.identity.path,
        segments,
      }
      edges[id] = dedupeEdges(recipeEdges)
      // the flag is a property of the content: an effectful cluster placed
      // in an opted-in output (it moved with its only needer) keeps it
      sideEffects[id] =
        decl.sideEffectFree === true &&
        ![...included].some((c) => placement.clusters[c]!.effectful)
    }

    const fallbacks = this.fallbackRecords()
    const plan: EmitPlan = {
      key,
      revision,
      sourceLength: code.length,
      outputs,
      edges,
      facts: {
        marker: analysis.markers,
        publishedSummaryDigest: null,
        planners: JSON.parse(JSON.stringify(this.facts)) as Record<
          string,
          unknown
        >,
      },
      dependencies: [],
      fingerprint: '',
      diagnostics: this.diagnostics.map((d) => ({
        ...d,
        range: d.range ? { ...d.range } : undefined,
      })),
      sideEffects,
      fallbacks,
    }
    return plan
  }

  private includedUnitsOf(
    item: TopLevelItem,
    included: ReadonlySet<number>,
    placement: Placement,
    derived: boolean,
  ): Set<UnitId> {
    const set = new Set<UnitId>()
    for (const uid of item.units) {
      const u = this.t1.units[uid]!
      if (u.kind === 'type' && derived) {
        // ambient value declarations (`declare enum`, `declare var`, …) are
        // copied: erased by TypeScript, but a TS transform resolves the
        // names through them (Oxc inlines `declare enum` members)
        if (isAmbientValueDeclaration(u.node)) {
          set.add(uid)
        }
        continue
      }
      // type units stay in the env module (erased by TypeScript), except
      // the TypeScript-only specifiers placement removed (`importStays`)
      const c = placement.clusterOfRegion.get(u.region)
      if (c !== undefined && included.has(c)) {
        set.add(uid)
      }
    }
    return set
  }

  private renderEnv(
    renderer: Renderer,
    placement: Placement,
    included: ReadonlySet<number>,
    exportNameOf: Map<OutputId, Map<SymbolId, string>>,
    glueExports: ReadonlySet<SymbolId>,
  ): Array<Segment> {
    const { t1, rewrites, analysis } = this
    const { items, units } = t1
    const code = analysis.source.code
    const extra: Array<TreeEdit> = []
    let seq = 2e9
    const baseTree = rewrites.tree('env')
    /** Exported declarators of statements whose `export` keyword a sibling's rename drops. */
    const siblingExports: Array<{ sym: SymbolId; name: string }> = []
    // statement-level DCE edits
    /** The statement rendered before the current one (as the source wrote it, or rewritten). */
    let previous: RenderedStatement | undefined
    for (const item of items) {
      if (baseTree.isErasedAt(item.nodeRange.start)) {
        continue
      }
      const retained = this.includedUnitsOf(item, included, placement, false)
      let keepExport = true
      for (const uid of item.units) {
        const u = units[uid]!
        for (const s of u.declares) {
          if (this.exportedRenames.has(s)) {
            keepExport = false
          }
        }
      }
      if (!keepExport && item.exportKeyword !== null) {
        // the statement loses its `export` keyword for the renamed binding
        // (re-exported under its public name by the glue); the other
        // exported declarators of the statement stay exported through the
        // same glue
        for (const uid of item.units) {
          const u = units[uid]!
          if (
            !retained.has(uid) ||
            u.exported.length === 0 ||
            u.declares.some((s) => this.exportedRenames.has(s))
          ) {
            continue
          }
          for (const s of u.declares) {
            for (const name of u.exported) {
              siblingExports.push({ sym: s, name })
            }
          }
        }
      }
      const recipe = statementRecipe(item, units, retained, keepExport, code)
      if (
        recipe !== 'drop' &&
        item.index > 0 &&
        needsLeadingSemicolon(code, item, previous)
      ) {
        extra.push({
          range: { start: item.nodeRange.start, end: item.nodeRange.start },
          body: [{ k: 'text', parts: [';'] }],
          by: 'core:dce',
          seq: seq++,
          claim: null,
          internal: true,
        })
      }
      previous = { item, intact: recipe === 'keep' }
      if (recipe === 'keep') {
        continue
      }
      extra.push({
        range: item.range,
        body: recipe === 'drop' ? [] : recipe,
        by: 'core:dce',
        seq: seq++,
        claim: null,
        internal: true,
      })
    }
    // generated units homed here, at their anchors
    const anchored = this.anchoredGenerated('env', placement)
    for (const { at, gen } of anchored) {
      extra.push({
        range: { start: at, end: at },
        body: gen.body,
        by: gen.by,
        seq: seq++,
        claim: null,
        internal: true,
        gen: gen.id,
      } as TreeEdit)
    }
    // glue imports of the env output (from shared/derived homes) after the header
    const glueImports = this.glueImportText(
      'env',
      placement,
      exportNameOf,
      anchored.map((a) => a.gen),
    )
    if (glueImports.length > 0) {
      extra.push({
        range: { start: analysis.header.end, end: analysis.header.end },
        body: glueImports,
        by: 'core:glue',
        seq: 1.5e9,
        claim: null,
        internal: true,
      })
    }
    // export glue at the end (re-exports of extracted exports first)
    const exportGlue = [
      ...this.reexportGlue(placement, exportNameOf),
      ...this.exportGlue(
        'env',
        placement,
        exportNameOf,
        glueExports,
        siblingExports,
      ),
    ]
    if (exportGlue.length > 0) {
      extra.push({
        range: { start: code.length, end: code.length },
        body: exportGlue,
        by: 'core:glue',
        seq: seq++,
        claim: null,
        internal: true,
      })
    }
    // text appended at the end starts on its own line
    if (
      code.length > 0 &&
      !isLineTerminator(code.charCodeAt(code.length - 1))
    ) {
      const atEnd = extra
        .filter((e) => e.range.start === code.length && e.body.length > 0)
        .sort((a, b) => a.seq - b.seq)
      const first = atEnd[0]
      if (first) {
        first.body = [{ k: 'text', parts: ['\n'] }, ...first.body]
      }
    }
    const tree = rewrites.tree('env', extra)
    renderer.setTree(tree)
    const out: Array<Segment> = []
    renderer.renderRange(0, code.length, null, null, out, null, true)
    return out
  }

  private anchoredGenerated(
    output: OutputId,
    placement: Placement,
  ): Array<{ at: number; order: number; gen: GeneratedUnit }> {
    const { items, units } = this.t1
    const out: Array<{ at: number; order: number; gen: GeneratedUnit }> = []
    const included = placement.included.get(output) ?? new Set()
    const code = this.analysis.source.code
    for (const gen of this.rewrites.generated) {
      const c = placement.clusterOfGen.get(gen.id)
      if (c === undefined || !included.has(c)) {
        continue
      }
      let at: number
      let order: number
      switch (gen.anchor.k) {
        case 'after-header':
          at = this.analysis.header.end
          order = 0
          break
        case 'before-unit':
          at = items[units[gen.anchor.unit]!.item]!.range.start
          order = 1
          break
        case 'after-unit':
          at = items[units[gen.anchor.unit]!.item]!.range.end
          order = 2
          break
        case 'end':
          at = code.length
          order = 3
          break
      }
      out.push({ at, order, gen })
    }
    out.sort((a, b) => a.at - b.at || a.order - b.order || a.gen.id - b.gen.id)
    return out
  }

  private glueImportText(
    output: OutputId,
    placement: Placement,
    exportNameOf: Map<OutputId, Map<SymbolId, string>>,
    gens: ReadonlyArray<GeneratedUnit>,
  ): Array<Frag> {
    const frags: Array<Frag> = []
    const imports = placement.imports.get(output)
    if (imports) {
      for (const [home, syms] of [...imports].sort(([a], [b]) =>
        a < b ? -1 : 1,
      )) {
        const homeDecl = this.outputs.get(home)
        const targetId = homeDecl?.derivedId ?? this.identity.canonicalId
        const names = [...syms]
          .sort((a, b) => a - b)
          .map((s) => {
            const exported = exportNameOf.get(home)?.get(s) ?? this.nameOf(s)
            const local = this.nameOf(s)
            return exported === local ? local : `${exported} as ${local}`
          })
        frags.push({
          k: 'text',
          parts: [`import { ${names.join(', ')} } from `],
        })
        frags.push({
          k: 'spec',
          specifier: siblingSpecifier(targetId),
          edgeKey: this.edgeKey(
            siblingSpecifier(targetId),
            'static',
            'runtime',
          ),
          provenance: { origin: 'runtime' },
        })
        frags.push({ k: 'text', parts: ['\n'] })
      }
    }
    for (const gen of gens) {
      for (const gi of gen.imports ?? []) {
        const names = gi.names.map((n) => {
          const local = this.symbols.name(n.local)
          return n.imported === local ? local : `${n.imported} as ${local}`
        })
        frags.push({
          k: 'text',
          parts: [`import { ${names.join(', ')} } from `],
        })
        frags.push(gi.spec)
        frags.push({ k: 'text', parts: ['\n'] })
      }
    }
    return frags
  }

  /** `export { x as name, … } from './file?tsr-split=export~x'` for every extracted cluster. */
  private reexportGlue(
    placement: Placement,
    exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  ): Array<Frag> {
    const frags: Array<Frag> = []
    for (const e of placement.extracted) {
      const decl = this.outputs.get(e.output)
      if (!decl?.derivedId) {
        continue
      }
      const parts: Array<string> = []
      for (const s of [...e.syms].sort((a, b) => a - b)) {
        const exported = exportNameOf.get(e.output)?.get(s) ?? this.nameOf(s)
        for (const x of this.analysis.exports) {
          if (x.kind === 'local' && x.local === s && !x.typeOnly) {
            parts.push(
              exported === x.name ? exported : `${exported} as ${x.name}`,
            )
          }
        }
      }
      if (parts.length === 0) {
        continue
      }
      frags.push({ k: 'text', parts: [`export { ${parts.join(', ')} } from `] })
      frags.push({
        k: 'spec',
        specifier: siblingSpecifier(decl.derivedId),
        edgeKey: this.edgeKey(
          siblingSpecifier(decl.derivedId),
          'reexport',
          'runtime',
        ),
        provenance: { origin: 'runtime' },
      })
      frags.push({ k: 'text', parts: ['\n'] })
    }
    return frags
  }

  private exportGlue(
    output: OutputId,
    placement: Placement,
    exportNameOf: Map<OutputId, Map<SymbolId, string>>,
    glueExports: ReadonlySet<SymbolId> | null = null,
    siblingExports: ReadonlyArray<{ sym: SymbolId; name: string }> = [],
  ): Array<Frag> {
    const parts: Array<string> = []
    const names = exportNameOf.get(output)
    if (names) {
      for (const [s, exported] of names) {
        if (glueExports !== null && !glueExports.has(s)) {
          continue
        }
        const local = this.nameOf(s)
        parts.push(exported === local ? local : `${local} as ${exported}`)
      }
    }
    for (const { sym, name } of siblingExports) {
      const local = this.nameOf(sym)
      const part = name === local ? local : `${local} as ${name}`
      if (!parts.includes(part)) {
        parts.push(part)
      }
    }
    if (output === 'env') {
      const extractedSyms = new Set(placement.extracted.flatMap((e) => e.syms))
      for (const [sym, r] of this.exportedRenames) {
        if (extractedSyms.has(sym)) {
          continue // re-exported from the extracted output under its public names
        }
        const local = 'sym' in r.to ? this.symbols.name(r.to.sym) : null
        if (local === null) {
          continue
        }
        for (const name of r.names) {
          parts.push(`${local} as ${name}`)
        }
      }
    }
    if (parts.length === 0) {
      return []
    }
    return [{ k: 'text', parts: [`export { ${parts.join(', ')} }\n`] }]
  }

  private renderDerived(
    renderer: Renderer,
    decl: OutputDecl,
    placement: Placement,
    included: ReadonlySet<number>,
    exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  ): Array<Segment> {
    const { t1, rewrites, analysis } = this
    const { items, units } = t1
    const code = analysis.source.code
    const tree = rewrites.tree(decl.id)
    renderer.setTree(tree)
    const out: Array<Segment> = []
    const anchored = this.anchoredGenerated(decl.id, placement)
    const empty =
      included.size === 0 &&
      anchored.length === 0 &&
      (placement.imports.get(decl.id)?.size ?? 0) === 0
    if (empty) {
      out.push({ k: 'text', text: 'export {}\n' })
      return out
    }
    // header: pragmas and directives (leadingness preserved), never license comments
    const header = analysis.header
    for (const p of header.pragmas) {
      if (!header.license.some((l) => l.start === p.range.start)) {
        if (!out.some((s) => s.k === 'slice' && s.start === p.range.start)) {
          out.push({ k: 'slice', start: p.range.start, end: p.range.end })
          out.push({ k: 'text', text: '\n' })
        }
      }
    }
    const afterPragmas = out.length
    for (const d of header.directives) {
      if (decl.header?.dropDirectives?.includes(d.value)) {
        continue
      }
      out.push({ k: 'slice', start: d.range.start, end: d.range.end })
      out.push({ k: 'text', text: '\n' })
    }
    if (decl.header?.addDirective) {
      out.push({
        k: 'text',
        text: `${specifierLiteral(decl.header.addDirective)}\n`,
      })
    }
    // glue imports
    const glue = this.glueImportText(
      decl.id,
      placement,
      exportNameOf,
      anchored.map((a) => a.gen),
    )
    renderer.renderFrags(glue, null, null, out)
    // pieces in order: generated units by anchor, items by position
    type Piece = Partial<RenderedStatement> & {
      pos: number
      order: number
      render: () => void
    }
    const pieces: Array<Piece> = []
    for (const item of items) {
      const inc = this.includedUnitsOf(item, included, placement, true)
      if (inc.size === 0) {
        continue
      }
      const recipe = statementRecipe(item, units, inc, false, code)
      if (recipe === 'drop') {
        continue
      }
      pieces.push({
        pos: item.range.start,
        order: 1,
        item,
        intact: recipe === 'keep',
        render: () => {
          if (recipe === 'keep') {
            renderer.renderRange(
              item.range.start,
              item.range.end,
              null,
              null,
              out,
            )
          } else {
            renderer.renderFrags(recipe, null, null, out)
          }
        },
      })
    }
    // in derived outputs, after-header units follow the included import statements
    let importsEnd = -1
    for (const item of items) {
      if (
        item.kind === 'ImportDeclaration' &&
        this.includedUnitsOf(item, included, placement, true).size > 0
      ) {
        importsEnd = Math.max(importsEnd, item.range.end)
      }
    }
    for (const a of anchored) {
      const pos =
        a.gen.anchor.k === 'after-header'
          ? importsEnd - 0.5
          : a.gen.anchor.k === 'end'
            ? Infinity
            : a.at
      const order =
        a.gen.anchor.k === 'before-unit'
          ? 0
          : a.gen.anchor.k === 'after-unit'
            ? 2
            : 1
      pieces.push({
        pos,
        order,
        render: () => renderer.renderFrags(a.gen.body, a.gen, null, out),
      })
    }
    pieces.sort((x, y) => x.pos - y.pos || x.order - y.order)
    // leadingness (J2.16): a pragma comment the source wrote after its
    // first statement (ineffective for a transform that reads leading
    // comments only) must not open this output; a token keeps it where the
    // source had it
    const first = pieces[0]
    if (
      out.length === afterPragmas &&
      first?.item !== undefined &&
      this.startsWithPragmaComment(first.item)
    ) {
      out.push({ k: 'text', text: 'export {}\n' })
    }
    let previous: Piece | undefined
    for (const p of pieces) {
      if (
        p.item !== undefined &&
        needsLeadingSemicolon(code, p.item, previous)
      ) {
        out.push({ k: 'text', text: ';' })
      }
      p.render()
      previous = p
    }
    const exportGlue = this.exportGlue(decl.id, placement, exportNameOf, null)
    renderer.renderFrags(exportGlue, null, null, out)
    return out
  }

  /** Whether the comments between an item's owned start and its statement carry a JSX pragma. */
  private startsWithPragmaComment(item: TopLevelItem): boolean {
    for (const c of this.analysis.file.comments) {
      if (c.start < item.range.start) {
        continue
      }
      if (c.end > item.nodeRange.start) {
        break
      }
      if (pragmasOf(c).length > 0) {
        return true
      }
    }
    return false
  }

  /** Records this output's surviving source edges and isolates their specifier literals as segments. */
  private sourceEdges(
    output: OutputId,
    importerId: string,
    included: ReadonlySet<number>,
    tree: RenderTree,
    segments: Array<Segment>,
    into: Array<EdgeRecord>,
  ): void {
    const { analysis, t1 } = this
    const { units } = t1
    const includedUnit = (u: Unit) => {
      const c = this.placement!.clusterOfRegion.get(u.region)
      return c !== undefined && included.has(c)
    }
    for (const imp of analysis.imports) {
      if (imp.typeOnly) {
        continue
      }
      const impUnits = units.filter((u) => u.importIndex === imp.index)
      const live = impUnits.filter((u) => u.kind !== 'type' && includedUnit(u))
      if (live.length === 0) {
        continue
      }
      if (tree.isErasedAt(imp.declRange.start)) {
        continue
      }
      const liveLocals = new Set(
        live
          .filter((u) => u.kind === 'import-specifier')
          .flatMap((u) => u.declares),
      )
      const names = analysis.importEdgeNames(
        imp,
        (start) => !tree.isErasedAt(start),
        (spec) => liveLocals.has(spec.local),
      )
      // classic-runtime JSX reads its factory implicitly (no Yuku reference)
      for (const spec of imp.specifiers) {
        if (
          liveLocals.has(spec.local) &&
          !names.includes(spec.imported) &&
          t1.refs
            .refsOf(spec.local)
            .some(
              (r) =>
                r.kind === 'implicitJsxFactory' &&
                !tree.isErasedAt(r.range.start),
            )
        ) {
          names.push(spec.imported)
        }
      }
      const form: EdgeForm = imp.bare ? 'bare' : 'static'
      const edgeKey = this.edgeKey(imp.specifier, form)
      const marked = markSegment(segments, imp.specifierRange, edgeKey)
      if (!marked) {
        continue
      }
      into.push({
        output,
        importerId,
        edgeKey,
        form,
        kind: names.length > 0 ? 'binding' : 'evaluation',
        specifier: imp.specifier,
        locations: [{ range: imp.specifierRange }],
        typeOnly: false,
        names,
        provenance: { origin: 'source' },
      })
    }
    for (const re of analysis.reexports) {
      if (re.typeOnly || tree.isErasedAt(re.statementRange.start)) {
        continue
      }
      const unit = units.find(
        (u) =>
          u.kind === 'reexport' &&
          u.range.start <= re.statementRange.start &&
          u.range.end >= re.statementRange.end,
      )
      if (!unit || !includedUnit(unit)) {
        continue
      }
      const form: EdgeForm = re.kind === 'star' ? 'star' : 'reexport'
      const edgeKey = this.edgeKey(re.specifier, form)
      if (!markSegment(segments, re.specifierRange, edgeKey)) {
        continue
      }
      into.push({
        output,
        importerId,
        edgeKey,
        form,
        kind: 'evaluation',
        specifier: re.specifier,
        locations: [{ range: re.specifierRange }],
        typeOnly: false,
        names: re.names,
        provenance: { origin: 'source' },
      })
    }
    for (const dyn of analysis.dynamicEdges) {
      const edgeKey = this.edgeKey(dyn.specifier, dyn.form)
      if (!markSegment(segments, dyn.specifierRange, edgeKey)) {
        continue
      }
      into.push({
        output,
        importerId,
        edgeKey,
        form: dyn.form,
        kind: 'evaluation',
        specifier: dyn.specifier,
        locations: [{ range: dyn.specifierRange }],
        typeOnly: false,
        names: dyn.names,
        provenance: { origin: 'source' },
      })
    }
  }
}

/** `declare enum|namespace|var|let|const|function|class` (an ambient declaration with a value-space name). */
function isAmbientValueDeclaration(node: Node): boolean {
  switch (node.type) {
    case 'TSEnumDeclaration':
    case 'VariableDeclaration':
    case 'ClassDeclaration':
    case 'FunctionDeclaration':
      return node.declare === true
    case 'TSDeclareFunction':
      return node.declare
    case 'TSModuleDeclaration':
      return node.declare === true && node.id.type === 'Identifier'
    default:
      return false
  }
}

/** Splits the slice segment containing `range` so the literal is its own segment carrying `edgeKey`. */
function markSegment(
  segments: Array<Segment>,
  range: Range,
  edgeKey: string,
): boolean {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.k !== 'slice' || s.start > range.start || s.end < range.end) {
      continue
    }
    if (s.edgeKey !== undefined) {
      return s.edgeKey === edgeKey
    }
    const parts: Array<Segment> = []
    if (s.start < range.start) {
      parts.push({ k: 'slice', start: s.start, end: range.start })
    }
    parts.push({ k: 'slice', start: range.start, end: range.end, edgeKey })
    if (range.end < s.end) {
      parts.push({ k: 'slice', start: range.end, end: s.end })
    }
    segments.splice(i, 1, ...parts)
    return true
  }
  return false
}

function dedupeEdges(edges: Array<EdgeRecord>): Array<EdgeRecord> {
  const byKey = new Map<string, EdgeRecord>()
  for (const e of edges) {
    const prev = byKey.get(e.edgeKey)
    if (!prev) {
      byKey.set(e.edgeKey, e)
      continue
    }
    prev.locations.push(...e.locations)
    for (const n of e.names) {
      if (!prev.names.includes(n)) {
        prev.names.push(n)
      }
    }
    if (e.kind === 'binding') {
      prev.kind = 'binding'
    }
  }
  return [...byKey.values()]
}

/**
 * Renders ranges and fragments of one output into segments, applying the
 * render tree (edits, placeholders), substitution environments and
 * context-aware reference rewrites.
 */
class Renderer {
  tree!: RenderTree
  private output!: OutputId
  private importerId!: string
  private edges!: Array<EdgeRecord>
  private readonly refByStart = new Map<number, ClassifiedRef>()
  /** Offsets starting a statement whose previous statement of the list has no `;`. */
  private readonly unterminatedBefore = new Map<number, boolean>()

  constructor(
    private readonly plan: AnalysisPlan,
    private readonly code: string,
  ) {
    for (const r of plan.t1.refs.all) {
      if (r.kind !== 'implicitJsxFactory') {
        this.refByStart.set(r.range.start, r)
      }
    }
  }

  begin(output: OutputId, importerId: string, edges: Array<EdgeRecord>): void {
    this.output = output
    this.importerId = importerId
    this.edges = edges
  }

  setTree(tree: RenderTree): void {
    this.tree = tree
  }

  renderRange(
    start: number,
    end: number,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    exclude: TreeEdit | null = null,
    includeEnd = false,
    skipZeroWidthAt: number | null = null,
  ): void {
    const cuts: Array<{
      start: number
      end: number
      edit: TreeEdit | null
      ref: ClassifiedRef | null
    }> = []
    for (const e of this.tree.topLevelWithin(
      start,
      end,
      exclude,
      includeEnd,
      skipZeroWidthAt,
    )) {
      cuts.push({ start: e.range.start, end: e.range.end, edit: e, ref: null })
    }
    if (env && env.size > 0) {
      for (const ref of this.plan.t1.refs.refsIn({ start, end })) {
        if (
          !env.has(ref.sym) ||
          ref.kind === 'implicitJsxFactory' ||
          ref.kind === 'exportSpecifier'
        ) {
          continue
        }
        if (
          cuts.some(
            (c) =>
              c.edit !== null &&
              c.start <= ref.range.start &&
              ref.range.start < c.end,
          )
        ) {
          continue
        }
        cuts.push({
          start: ref.range.start,
          end: ref.range.end,
          edit: null,
          ref,
        })
      }
      cuts.sort((a, b) => a.start - b.start || a.end - b.end)
    }
    let pos = start
    for (const cut of cuts) {
      if (cut.start > pos) {
        out.push({ k: 'slice', start: pos, end: cut.start })
      }
      if (cut.edit !== null) {
        const e = cut.edit
        const gen = (e as TreeEdit & { gen?: number }).gen
        const unit =
          gen !== undefined ? this.plan.rewrites.generated[gen]! : owner
        const nextEnv =
          gen !== undefined
            ? mergeEnv(env, this.plan.rewrites.generated[gen]!.env)
            : env
        const at = out.length
        this.renderFrags(
          e.body,
          unit,
          nextEnv,
          out,
          gen !== undefined ? this.plan.rewrites.generated[gen]! : null,
          e,
        )
        this.guardStatementStart(e.range.start, out, at)
      } else {
        const ref = cut.ref!
        const to = env!.get(ref.sym)!
        out.push({
          k: 'text',
          text: this.renderRefText(
            ref.ctx,
            to,
            env,
            ref.exportShorthand,
            this.code.slice(ref.range.start, ref.range.end),
          ),
          mapTo: ref.range.start,
        })
      }
      pos = Math.max(pos, cut.end)
    }
    if (end > pos) {
      out.push({ k: 'slice', start: pos, end })
    }
  }

  renderFrags(
    frags: ReadonlyArray<Frag>,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    entering: GeneratedUnit | null = null,
    within: TreeEdit | null = null,
  ): void {
    const unit = entering ?? owner
    const mergedEnv = mergeEnv(env, unit?.env)
    for (const f of frags) {
      switch (f.k) {
        case 'slice': {
          // a claimed region embedded by its owner renders its content, not the placeholder
          let exclude: TreeEdit | null = null
          if (unit) {
            for (const e of this.tree.edits) {
              if (
                e.claim !== null &&
                e.range.start === f.range.start &&
                e.range.end === f.range.end
              ) {
                const claim = this.plan.rewrites.claims.get(e.claim)
                if (claim && claim.owner === unit.id) {
                  exclude = e
                }
                break
              }
            }
          }
          this.renderRange(
            f.range.start,
            f.range.end,
            unit,
            mergedEnv,
            out,
            exclude,
            false,
            within?.range.start ?? null,
          )
          break
        }
        case 'text': {
          let text = ''
          for (const p of f.parts) {
            if (typeof p === 'string') {
              text += p
            } else {
              text += this.renderSymRef(p.sym, p.ctx ?? 'expr', mergedEnv)
            }
          }
          if (text.length > 0) {
            out.push(
              f.mapTo !== undefined
                ? { k: 'text', text, mapTo: f.mapTo }
                : { k: 'text', text },
            )
          }
          break
        }
        case 'spec': {
          out.push({
            k: 'text',
            text: specifierLiteral(f.specifier),
            edgeKey: f.edgeKey,
          })
          this.edges.push({
            output: this.output,
            importerId: this.importerId,
            edgeKey: f.edgeKey,
            form: f.form ?? 'static',
            kind: f.form === 'dynamic' ? 'evaluation' : 'binding',
            specifier: f.specifier,
            locations: [{ segment: out.length - 1 }],
            typeOnly: false,
            names: [...(f.names ?? [])],
            provenance: f.provenance ?? { origin: 'runtime' },
          })
          break
        }
        case 'ref': {
          out.push({
            k: 'text',
            text: this.renderRefText(
              f.ctx,
              f.to,
              mergedEnv,
              f.exportShorthand,
              this.code.slice(f.range.start, f.range.end),
            ),
            mapTo: f.range.start,
          })
          break
        }
      }
    }
  }

  /**
   * A `;` before text rendered at `offset` when it starts a statement of a
   * list whose previous statement has no `;` and its first token could
   * continue that statement (`const x = foo` + `(() => 1)()` would be a call
   * of `foo`): an edit replacing a call with a parenthesised function, an
   * orphaned initialiser kept as a statement, a placeholder.
   */
  private guardStatementStart(
    offset: number,
    out: Array<Segment>,
    from: number,
  ): void {
    let first = ''
    for (let i = from; i < out.length && first === ''; i++) {
      const seg = out[i]!
      const text =
        seg.k === 'slice' ? this.code.slice(seg.start, seg.end) : seg.text
      const m = /\S/.exec(text)
      if (m) {
        first = m[0]
      }
    }
    if (first === '' || !'([`+-/<'.includes(first)) {
      return
    }
    let guard = this.unterminatedBefore.get(offset)
    if (guard === undefined) {
      guard = this.unterminatedStatementBefore(offset)
      this.unterminatedBefore.set(offset, guard)
    }
    if (guard) {
      out.splice(from, 0, { k: 'text', text: ';' })
    }
  }

  /** Whether a statement of a statement list starts at `offset` after a statement without `;`. */
  private unterminatedStatementBefore(offset: number): boolean {
    const file = this.plan.analysis.file
    let node = file.nodeAt(offset)
    if (!node || node.start !== offset) {
      return false
    }
    let parent = file.parentOf(node)
    while (parent && parent.start === offset) {
      node = parent
      parent = file.parentOf(node)
    }
    if (!parent) {
      return false
    }
    const list =
      parent.type === 'Program' ||
      parent.type === 'BlockStatement' ||
      parent.type === 'StaticBlock'
        ? parent.body
        : parent.type === 'SwitchCase'
          ? parent.consequent
          : null
    if (!list) {
      return false
    }
    const index = (list as ReadonlyArray<Node>).indexOf(node)
    if (index <= 0) {
      return false
    }
    const prev = (list as ReadonlyArray<Node>)[index - 1]!
    return this.code[prev.end - 1] !== ';'
  }

  /** The id of the module the current output takes `sym` from: the home it imports it from, else its own. */
  private homeIdOf(sym: SymbolId): string {
    for (const [home, syms] of this.plan.placement?.imports.get(this.output) ??
      []) {
      if (syms.has(sym)) {
        return (
          this.plan.outputs.get(home)?.derivedId ??
          this.plan.identity.canonicalId
        )
      }
    }
    return this.importerId
  }

  private targetText(to: RefTarget, env: SubstEnv | null): string {
    if ('sym' in to) {
      const sub = env?.get(to.sym)
      return sub ? this.targetText(sub, null) : this.plan.nameOf(to.sym)
    }
    const [root, ...path] = to.member
    const sub = env?.get(root)
    const rootText = sub ? this.targetText(sub, null) : this.plan.nameOf(root)
    return [rootText, ...path].join('.')
  }

  private renderSymRef(
    sym: SymbolId,
    ctx: SymRefContext,
    env: SubstEnv | null,
  ): string {
    if (ctx === 'homeId') {
      return stringLiteral(this.homeIdOf(sym), '"')
    }
    const t = this.targetText({ sym }, env)
    if (ctx === 'callee' && t.includes('.')) {
      return `(0, ${t})`
    }
    return t
  }

  private renderRefText(
    ctx: RefContext,
    to: RefTarget,
    env: SubstEnv | null,
    exportShorthand: boolean | undefined,
    original: string,
  ): string {
    const t = this.targetText(to, env)
    const isMember = t.includes('.')
    switch (ctx) {
      case 'callee':
        return isMember ? `(0, ${t})` : t
      case 'shorthandProp':
      case 'shorthandPattern':
        return `${original}: ${t}`
      case 'exportSpec':
        if (isMember) {
          throw new Error(
            `cannot export a member expression (${t}) as ${original}`,
          )
        }
        return exportShorthand ? `${t} as ${original}` : t
      case 'importLocal':
      case 'declName':
        if (isMember) {
          throw new Error(
            `a declaration name cannot become a member expression (${t})`,
          )
        }
        return t
      default:
        return t
    }
  }
}

function mergeEnv(
  outer: SubstEnv | null,
  inner: SubstEnv | undefined,
): SubstEnv | null {
  if (!inner || inner.size === 0) {
    return outer
  }
  if (!outer || outer.size === 0) {
    return inner
  }
  const m = new Map(outer)
  for (const [k, v] of inner) {
    m.set(k, v)
  }
  return m
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

/** A statement an output rendered: as the source wrote it (`intact`, with the `;` that may end it) or rewritten. */
interface RenderedStatement {
  item: TopLevelItem
  intact: boolean
}

/**
 * Whether a statement gets a `;` of its own: its first token would continue
 * a statement before it that has no `;` (a parenthesis, a bracket, a
 * template, a sign, a regular expression, JSX or a type assertion), and what
 * renders before it is not its intact source predecessor, which ended with
 * the `;` it relies on (semicolon-free code writes `;(x as any).y = 1`).
 */
function needsLeadingSemicolon(
  code: string,
  item: TopLevelItem,
  previous: Partial<RenderedStatement> | undefined,
): boolean {
  return (
    '([`+-/<'.includes(code[item.nodeRange.start]!) &&
    !(previous?.intact && previous.item?.index === item.index - 1)
  )
}
