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
  KeptDeclaration,
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
import type { DerivedQuery, SourceIdentity } from './identity'
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
  revision: string
  sourceLength: number
  outputs: Record<string, OutputRecipe>
  edges: Record<string, Array<EdgeRecord>>
  facts: PlanFacts
  dependencies: Array<DependencyFingerprint>
  fingerprint: string
  diagnostics: Array<Diagnostic>
  sideEffects: Record<string, boolean>
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
  liveness: (output: OutputId) => LivenessView
  /** The binding name a symbol renders as (after module-wide renames). */
  nameOf: (sym: SymbolId) => string
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
  private readonly keptSyms = new Set<SymbolId>()
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

  /** The binding name a symbol renders as (after module-wide renames). */
  nameOf(sym: SymbolId): string {
    const to = this.renames.get(sym)
    return this.symbols.name(to ?? sym)
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
    const benign = new Map<UnitId, boolean>()
    const placement = computePlacement({
      t1: this.t1,
      rewrites: this.rewrites,
      outputs: this.outputs,
      canonicalId: this.identity.canonicalId,
      routeModule: this.routeModule,
      isBenign: (u) => {
        if (!this.benignEffects.has(u)) {
          return false
        }
        let hit = benign.get(u)
        if (hit === undefined) {
          hit = this.benignUnit(this.t1.units[u]!)
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
      this.diagnostic(this.keptDiagnostic(k))
    }
    this.placement = placement
    return placement
  }

  /**
   * A declaration only split code needs stays in the env module, so it
   * loads with the module instead of lazily (R77, R78): the user is told
   * which, why and how to free it, once per declaration and wording (the
   * hosts' ledgers), positioned at the declaration. An exported one is not
   * extracted (its export names are the module's own); an unexported one is
   * kept by the movable test, the cause named with its line.
   */
  private keptDiagnostic(k: KeptDeclaration): Diagnostic {
    const tag = this.routeModule ? '[tanstack-router] ' : ''
    const module = this.routeModule ? 'route module' : 'module'
    const file = this.identity.path
    const code = this.analysis.source.code
    const text = (n: Node) => {
      const t = code.slice(n.start, n.end)
      return t.length > 40 || t.includes('\n')
        ? `${t.slice(0, 37).split('\n')[0]}…`
        : t
    }
    // `the call \`f(…)\` in \`validateSearch\``
    const describe = ({ node, key }: { node: Node; key: string | null }) => {
      const where = key === null ? '' : ` in \`${key}\``
      switch (node.type) {
        case 'CallExpression':
          return `the call \`${text(node.callee)}(…)\`${where}`
        case 'NewExpression':
          return `\`new ${text(node.callee)}(…)\`${where}`
        case 'AssignmentExpression':
          return `the assignment to \`${text(node.left)}\`${where}`
        default:
          return `\`${text(node)}\`${where}`
      }
    }
    if (k.exported) {
      const names = this.analysis.exports.flatMap((e) =>
        e.kind === 'local' && e.local === k.syms[0] && !e.typeOnly
          ? [`\`${e.name}\``]
          : [],
      )
      const why: Partial<Record<KeptDeclaration['reason'], string>> = {
        effects: 'its initialiser has side effects',
        reassigned: 'it is reassigned',
        live: `the ${module} itself reads it`,
        reads: 'it reads, when it loads, a binding the module keeps',
        order:
          k.effect === undefined
            ? 'an effect of the module keeps it in place'
            : `${describe(this.effectAt(k.effect))} runs after it and ${k.effectStays ? 'stays' : 'does not move with it'}`,
      }
      return {
        severity: 'warning',
        message: `${tag}The export ${names.join(', ')} of "${file}" stays in the ${module} (${why[k.reason]}), so the code split from it loads it with the module instead of lazily. Drop the export or move it to another module.`,
        range: k.range,
        by: 'core',
        code: `eager-export:${k.reason}`,
      }
    }
    const names = k.syms.map((s) => `\`${this.symbols.name(s)}\``)
    const subject = names.join(', ')
    const it = names.length === 1 ? 'it' : 'they'
    const own = names.length === 1 ? 'its' : 'their'
    const split = k.needers
      .map((o) => {
        const decl = this.outputs.get(o)!
        return decl.kind === 'hydrate'
          ? '`<Hydrate>` boundary'
          : `\`${decl.key.split('~').join('`, `')}\``
      })
      .join(', ')
    const line = (at: number) =>
      `line ${this.analysis.source.locate(at).line + 1}`
    const read = k.read === undefined ? '' : `\`${this.symbols.name(k.read)}\``
    let because: string
    let fix: string
    switch (k.reason) {
      case 'order': {
        // the least effort first: move the declaration below the effect
        // (it then follows it, wherever it loads), or the effect's value
        // above it; an annotation only where the effect is a call
        const effect = this.effectAt(k.effect!)
        because = `${describe(effect)} (${line(effect.node.start)}) runs after ${names.length === 1 ? 'it' : 'them'} and ${k.effectStays ? 'stays' : 'does not move with it'}`
        const unit = this.t1.units[k.effect!]!
        const after =
          unit.declares.length > 0
            ? unit.declares.map((s) => `\`${this.symbols.name(s)}\``).join(', ')
            : 'it'
        const fixes = [`declare ${subject} after ${after}`]
        if (this.benignEffects.has(k.effect!)) {
          fixes.push(`create that value in a \`const\` before ${subject}`)
        }
        if (
          effect.node.type === 'CallExpression' ||
          effect.node.type === 'NewExpression'
        ) {
          const local = this.localFunctionName(effect.node.callee)
          const annotations = [
            ...(local === null
              ? []
              : [`mark \`${local}\` \`/* #__NO_SIDE_EFFECTS__ */\``]),
            'mark the call `/* @__PURE__ */`',
          ]
          annotations[annotations.length - 1] += ' if it has no side effects'
          fixes.push(...annotations)
        }
        const last = fixes.pop()!
        fix = fixes.length === 0 ? last : `${fixes.join(', ')}, or ${last}`
        break
      }
      case 'needers':
        because = `several split options read ${it} (${split}) and ${own} initialiser has side effects, which run once`
        fix = `move ${subject} to its own module, or mark ${own} initialiser \`/* @__PURE__ */\` if it has none`
        break
      case 'written':
        because = `the module changes ${it} outside ${own} declaration when it loads (${line(k.at!)})`
        fix = `move ${subject} and what writes ${it} to their own module, or mark ${own} initialiser \`/* @__PURE__ */\` if it has no side effects`
        break
      case 'state':
        because =
          k.read === undefined
            ? `${it} read${it === 'it' ? 's' : ''}, when the module loads, a binding the module changes`
            : `${it} read${it === 'it' ? 's' : ''} ${read} when the module loads, and the module writes ${read}`
        fix = `read ${k.read === undefined ? 'that binding' : read} inside the code that needs it, or move both to their own module`
        break
      default:
        because = `${it} read${it === 'it' ? 's' : ''} ${read} when the module loads, and ${read} ${this.symbols.isConst(k.read!) ? 'has side effects' : 'is a `let`'}`
        fix = `move ${subject} and ${read} to their own module, or mark ${read}'s initialiser \`/* @__PURE__ */\` if it has no side effects`
        break
    }
    return {
      severity: 'warning',
      message: `${tag}${subject} in "${file}" stay${names.length === 1 ? 's' : ''} in the ${module} because ${because}; ${fix}, so ${subject} can load with the split ${split}.`,
      range: k.range,
      by: 'core',
      code: `eager-split:${k.reason}`,
    }
  }

  /** The name of a callee that is a function declared in this module (`function f`, `const f = () => …`), which `#__NO_SIDE_EFFECTS__` can mark. */
  private localFunctionName(callee: Node): string | null {
    const id = unwrapExpression(callee)
    if (id.type !== 'Identifier') {
      return null
    }
    const file = this.analysis.file
    const b = file.referenceOf(id)?.binding
    const decl = b?.scope === file.rootScope ? b.declarations[0] : undefined
    const parent = decl ? file.parentOf(decl) : null
    const fn =
      parent?.type === 'FunctionDeclaration' ||
      (parent?.type === 'VariableDeclarator' &&
        parent.init !== null &&
        (unwrapExpression(parent.init).type === 'ArrowFunctionExpression' ||
          unwrapExpression(parent.init).type === 'FunctionExpression'))
    return fn ? id.name : null
  }

  /** The expression that makes a unit an effect: for a recognised call a planner named, the option value or argument that is not pure (`firstImpure`). */
  private effectAt(u: UnitId): { node: Node; key: string | null } {
    const unit = this.t1.units[u]!
    const option = this.benignEffects.has(u) ? this.firstImpure(unit) : null
    const node =
      option?.node ??
      (unit.node.type === 'ExpressionStatement'
        ? unit.node.expression
        : unit.node.type === 'VariableDeclarator' && unit.node.init
          ? unit.node.init
          : unit.node)
    return { node: unwrapExpression(node), key: option?.key ?? null }
  }

  /**
   * Whether a unit a planner named benign is: its expression is a call
   * chain (`f(a)(b)`, `f(a).g(b)`) whose every argument is a pure value. An
   * object literal argument is judged per property; a value that is a
   * claimed region evaluates in another output through a pure wrapper, and
   * one the env output erases not at all.
   */
  private benignUnit(unit: Unit): boolean {
    return this.firstImpure(unit) === null
  }

  /**
   * The value that makes a unit no benign call chain (`benignUnit`): the
   * first impure argument, or option value with its property key; the
   * unit's own expression when it is no call chain; null when benign.
   */
  private firstImpure(unit: Unit): { node: Node; key: string | null } | null {
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
      return { node, key: null }
    }
    const env = this.rewrites.tree('env')
    const claimed = (v: Node): boolean => {
      for (const claim of this.rewrites.claims.values()) {
        const r = this.t1.regions.get(claim.region).range
        if (r.start === v.start && r.end === v.end) {
          return true
        }
      }
      return false
    }
    const impureIn = (
      v: Node,
      key: string | null,
    ): { node: Node; key: string | null } | null => {
      const n = unwrapExpression(v)
      // the common values: a function, an identifier, a literal
      if (
        n.type === 'ArrowFunctionExpression' ||
        n.type === 'FunctionExpression' ||
        n.type === 'Identifier' ||
        n.type === 'Literal'
      ) {
        return null
      }
      if (claimed(v) || env.isErasedAt(v.start)) {
        return null
      }
      if (n.type === 'ObjectExpression') {
        for (const p of n.properties) {
          if (p.type === 'SpreadElement') {
            if (!isPureExpression(this.analysis.purity, p)) {
              return { node: p, key }
            }
            continue
          }
          if (
            p.computed &&
            !isPureExpression(this.analysis.purity, p.key as Node)
          ) {
            return { node: p.key as Node, key }
          }
          if (p.kind !== 'init' || env.isErasedAt(p.start)) {
            continue
          }
          const found = impureIn(
            p.value as Node,
            p.computed ? key : propertyName(p.key as Node),
          )
          if (found !== null) {
            return found
          }
        }
        return null
      }
      return isPureExpression(this.analysis.purity, v) ? null : { node: v, key }
    }
    let n: Node = unwrapExpression(expr)
    let calls = 0
    for (;;) {
      if (n.type === 'CallExpression') {
        calls++
        for (const a of n.arguments) {
          const found =
            a.type === 'SpreadElement'
              ? { node: a, key: null }
              : impureIn(a, null)
          if (found !== null) {
            return found
          }
        }
        n = unwrapExpression(n.callee)
      } else if (n.type === 'MemberExpression' && !n.computed) {
        n = unwrapExpression(n.object)
      } else {
        return calls > 0 ? null : { node: expr, key: null }
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

  freeze(revision: string): EmitPlan {
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
    // the units of each import declaration, once for every output
    const unitsOfImport = new Map<number, Array<Unit>>()
    for (const u of this.t1.units) {
      if (u.importIndex !== null) {
        let list = unitsOfImport.get(u.importIndex)
        if (!list) {
          list = []
          unitsOfImport.set(u.importIndex, list)
        }
        list.push(u)
      }
    }

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
      this.sourceEdges(
        id,
        importerId,
        included,
        renderer.tree,
        segments,
        unitsOfImport,
        recipeEdges,
      )
      outputs[id] = {
        kind: decl.kind,
        derivedId: decl.derivedId,
        mapSource: this.identity.path,
        segments,
      }
      edges[id] = dedupeEdges(recipeEdges)
      // the flag is a property of the content: a cluster with observable
      // effects placed in an opted-in output (it moved with its only needer)
      // keeps it; augmentations of what the output exports do not
      sideEffects[id] =
        decl.sideEffectFree === true &&
        ![...included].some((c) => placement.clusters[c]!.sideEffects)
    }

    const plan: EmitPlan = {
      revision,
      sourceLength: code.length,
      outputs,
      edges,
      facts: {
        marker: analysis.markers,
        publishedSummaryDigest: null,
        planners: this.facts,
      },
      dependencies: [],
      fingerprint: '',
      diagnostics: this.diagnostics.map((d) => ({
        ...d,
        range: d.range ? { ...d.range } : undefined,
      })),
      sideEffects,
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
      if (u.kind === 'type') {
        // type units stay in the env module (erased by TypeScript) whatever
        // their cluster, except the TypeScript-only specifiers placement
        // dropped (`importStays`); ambient value declarations (`declare
        // enum`, `declare var`, …) are copied: erased by TypeScript, but a
        // TS transform resolves the names through them (Oxc inlines
        // `declare enum` members)
        if (
          derived
            ? isAmbientValueDeclaration(u.node)
            : !placement.droppedTypeUnits.has(uid)
        ) {
          set.add(uid)
        }
        continue
      }
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

  /** The source import edges of an output (every live import, re-export and dynamic edge of the included units). */
  private sourceEdges(
    output: OutputId,
    importerId: string,
    included: ReadonlySet<number>,
    tree: RenderTree,
    segments: ReadonlyArray<Segment>,
    unitsOfImport: ReadonlyMap<number, ReadonlyArray<Unit>>,
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
      const live = (unitsOfImport.get(imp.index) ?? []).filter(
        (u) => u.kind !== 'type' && includedUnit(u),
      )
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
      into.push({
        output,
        importerId,
        edgeKey: this.edgeKey(imp.specifier, form),
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
      into.push({
        output,
        importerId,
        edgeKey: this.edgeKey(re.specifier, form),
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
      // only where its source text renders: not an output whose code left
      // the call out (another output's code, erased code)
      const { start, end } = dyn.specifierRange
      if (
        !segments.some(
          (s) => s.k === 'slice' && s.start <= start && s.end >= end,
        )
      ) {
        continue
      }
      into.push({
        output,
        importerId,
        edgeKey: this.edgeKey(dyn.specifier, dyn.form),
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
      // the first token's first character: a comment (`/* @__PURE__ */`) is no `/`
      const m = /^(?:\s|\/\*[\s\S]*?\*\/|\/\/.*)*(\S)/.exec(text)
      if (m) {
        first = m[1]!
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

/** The name of a non-computed property key (`validateSearch`, `'a-b'`), for diagnostics. */
function propertyName(key: Node): string | null {
  return key.type === 'Identifier'
    ? key.name
    : key.type === 'Literal'
      ? String(key.value)
      : null
}
