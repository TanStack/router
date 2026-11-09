/**
 * `ModuleAnalysis` — tiered, read-only: modules that only need their edges
 * never pay for the rest.
 *
 * Tier 0 (always): import/export tables, evaluation edges, header, markers.
 * Own effects (`effects()`, what raw facts describe of a target) and Tier 1
 * (items, units, regions, symbols, classified references, JSX info, name
 * universe) on demand. Both are views over one Yuku parse that lives for the
 * compile attempt only (nothing cached may reach a Yuku object).
 */
import { BindingFlags, walk } from 'yuku'
import { analyzeHeader } from './header'
import { namespaceName, patternIdentifiers, unwrapExpression } from './source'
import { SymbolTable, valueBinding } from './symbols'
import {
  buildItems,
  buildUnits,
  callsWhenEvaluated,
  writesMember,
} from './units'
import { MutationModel } from './mutation'
import {
  builderCall,
  seedNoSideEffectDeclarations,
  statementHasEffects,
} from './purity'
import { ownEntry } from './strings'
import type { BuilderPurity, PurityContext } from './purity'
import type { Header, Range } from './header'
import type { SymbolId } from './symbols'
import type { RegionId, RegionTable, TopLevelItem, Unit, UnitId } from './units'
import type { Binding, Node, SourceFile } from 'yuku'
import type { SourceText } from './output-builder'
import type { RecognizerTable } from './values'

export type { Range } from './header'

interface ImportSpecifierEntry {
  local: SymbolId
  /** 'default', '*' or the imported name. */
  imported: string
  typeOnly: boolean
  localName: string
}

export interface ImportEntry {
  index: number
  specifier: string
  /** The specifier literal (quotes included). */
  specifierRange: Range
  /** The statement node. */
  declRange: Range
  attributesRange: Range | null
  bare: boolean
  /** `import type …` (the whole declaration). */
  typeOnly: boolean
  specifiers: Array<ImportSpecifierEntry>
}

/** The namespace imports of a module without any (shared, never written). */
const NO_NAMESPACES: ReadonlySet<number> = new Set()

type ExportEntry =
  | {
      kind: 'local'
      name: string
      local: SymbolId | null
      typeOnly: boolean
      range: Range
      /**
       * `export default x`: the export holds the value `x` has when the
       * statement runs, not the binding (a reassigned `x` does not change it).
       */
      snapshot?: true
    }
  | { kind: 'expression'; name: 'default'; range: Range }
  | {
      kind: 'reExport'
      name: string
      specifier: string
      fromName: string
      typeOnly: boolean
      range: Range
    }
  | {
      kind: 'namespace'
      name: string
      specifier: string
      typeOnly: boolean
      range: Range
    }
  | { kind: 'star'; specifier: string; typeOnly: boolean; range: Range }

interface ReexportEntry {
  specifier: string
  specifierRange: Range
  statementRange: Range
  kind: 'star' | 'named' | 'namespace'
  names: Array<string>
  typeOnly: boolean
}

interface DynamicEdge {
  specifier: string
  specifierRange: Range
  form: 'dynamic' | 'require'
  /**
   * The names a `require()` edge reads of its result (J6 edge names): the
   * keys of a destructuring pattern, the static member reads of the binding
   * holding it or of the call itself; `'*'` when it escapes any other way.
   * Empty for `import()` (a promise of the namespace).
   */
  names: Array<string>
}

type Marker = 'server-only' | 'client-only' | 'conflict' | null

type RefKind =
  | 'value'
  | 'write'
  | 'jsxTag'
  | 'exportSpecifier'
  | 'implicitJsxFactory'

export type RefContext =
  | 'plain'
  | 'callee'
  | 'shorthandProp'
  | 'shorthandPattern'
  | 'exportSpec'
  | 'exportDecl'
  | 'jsxOpen'
  | 'jsxClose'
  | 'jsxTag'
  | 'assignTarget'
  /** The target of `n++`, `n += 1`, `n ??= x`: written, and read first. */
  | 'updateTarget'
  /** The callee of `new`: called at the reference, and its identity observed (a constructor). */
  | 'newCallee'
  /** An operand of `instanceof`, `===`, `!==`, `==` or `!=`, a `switch` value or `case` test, or the object of a `.prototype` read: the value's identity is observed. */
  | 'identity'
  | 'declName'

export interface ClassifiedRef {
  sym: SymbolId
  range: Range
  kind: RefKind
  ctx: RefContext
  /** Evaluated at module load (not inside any function body). */
  eager: boolean
  /** `export { a }` (true) vs `export { a as b }` (false); only for exportSpec. */
  exportShorthand?: boolean
  /** The root of a member write (`a.p = …`, `a.p.q++`, `delete a.p`, `a.list.push(…)`, `Object.assign(a, …)`); always present (one object shape for every reference). */
  memberWrite: boolean
}

/** Whether the reference calls its value (the callee of a call, a `new` or a tagged template): the callee's body runs where the reference evaluates. */
export const callsValue = (ref: ClassifiedRef): boolean =>
  ref.ctx === 'callee' || ref.ctx === 'newCallee'

/** Whether the reference observes its value's identity (`newCallee`, `identity`): a copy of a function used so is a second constructor or sentinel. */
export const observesIdentity = (ref: ClassifiedRef): boolean =>
  ref.ctx === 'newCallee' || ref.ctx === 'identity'

interface FreeRef {
  name: string
  range: Range
}

export class RefIndex {
  /** Every classified reference, sorted by start. */
  readonly all: Array<ClassifiedRef>
  private readonly bySym = new Map<SymbolId, Array<ClassifiedRef>>()
  /** Declaration ranges per symbol (self-references inside them are excluded from `valueRefsOf`). */
  private readonly declRanges = new Map<SymbolId, Array<Range>>()

  constructor(all: Array<ClassifiedRef>, units: ReadonlyArray<Unit>) {
    this.all = all
    for (const r of all) {
      let list = this.bySym.get(r.sym)
      if (!list) {
        list = []
        this.bySym.set(r.sym, list)
      }
      list.push(r)
    }
    for (const u of units) {
      if (u.kind !== 'declaration') {
        continue
      }
      for (const s of u.declares) {
        let list = this.declRanges.get(s)
        if (!list) {
          list = []
          this.declRanges.set(s, list)
        }
        list.push(u.range)
      }
    }
  }

  /** References starting inside `range`. */
  refsIn(range: Range): Array<ClassifiedRef> {
    const all = this.all
    let lo = 0
    let hi = all.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (all[mid]!.range.start < range.start) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    const out: Array<ClassifiedRef> = []
    for (let i = lo; i < all.length && all[i]!.range.start < range.end; i++) {
      out.push(all[i]!)
    }
    return out
  }

  refsOf(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    return this.bySym.get(sym) ?? []
  }

  /** Reads of `sym` outside its own declarations (value, JSX tag, implicit factory). */
  valueRefsOf(sym: SymbolId): Array<ClassifiedRef> {
    const decls = this.declRanges.get(sym)
    return this.refsOf(sym).filter(
      (r) =>
        (r.kind === 'value' ||
          r.kind === 'jsxTag' ||
          r.kind === 'implicitJsxFactory') &&
        !(
          decls &&
          decls.some((d) => r.range.start >= d.start && r.range.end <= d.end)
        ),
    )
  }
}

interface JsxInfo {
  runtime: 'automatic' | 'classic' | 'unknown'
  factory: SymbolId | null
  fragment: SymbolId | null
}

export interface Tier1 {
  items: ReadonlyArray<TopLevelItem>
  units: ReadonlyArray<Unit>
  regions: RegionTable
  symbols: SymbolTable
  refs: RefIndex
  /** References to names without a binding (globals, `arguments`). */
  freeRefs: ReadonlyArray<FreeRef>
  jsx: JsxInfo
  names: ReadonlySet<string>
  exportNames: ReadonlySet<string>
  declaringUnits: ReadonlyMap<SymbolId, ReadonlyArray<UnitId>>
  /** What writes each binding, and where (one model for every mutation rule). */
  mutation: MutationModel
  /**
   * Whether `export default x` at `at` (the value `x` has when the statement
   * runs) may not be the binding: `x` is assigned (`live`: in code an output
   * keeps), or a declaration after the statement, other than a hoisted
   * function or a type, may give it a value afterwards (a later `var`: the
   * export holds what it had, `undefined` if nothing came before).
   */
  snapshotDiffers: (
    sym: SymbolId,
    at: number,
    live?: (ref: ClassifiedRef) => boolean,
  ) => boolean
  /**
   * Whether code at `offset` evaluates lazily (not when the module loads):
   * inside a function body other than one called where it is written (an
   * immediately invoked function runs at module load, like a class static
   * block or static field initialiser).
   */
  isLazyAt: (offset: number) => boolean
  /** Whether `offset` sits inside a function's scope (a declaration there is local to it, whenever it runs). */
  inFunctionAt: (offset: number) => boolean
  parentOf: (node: Node) => Node | null
  nodeAt: (offset: number) => Node | null
  /** The innermost region owning a reference. */
  ownerOf: (ref: ClassifiedRef) => RegionId
  /** Non-module symbols read inside `range` whose declaring scope lies outside it (captures). */
  capturesOf: (range: Range) => Array<SymbolId>
}

interface ModuleAnalysisOptions {
  path: string
  /** Bare import specifiers that mark a module (default: 'server-only' / 'client-only'). */
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
  /**
   * The recognizer: the pure exports of its known packages
   * (`RecognizerTable.pureCalls`, members of the default imports of
   * `pureDefaultNamespaces`) are pure callees.
   */
  recognizer?: RecognizerTable
  /**
   * A compile's environment type: the planners' purity takes the
   * recognizer's builder chains with pure arguments as no effect there
   * (`builderCall`; what that environment's compile erases does not count).
   * Both types take them, so both compiles home a builder alike. A builder
   * is one instance in every output of an environment: a call result is
   * never copied (the server-fn provider, the module's instance in another
   * layer, copies what it reaches whatever its purity). A link called on a
   * `const` holding a builder stays an effect: a middleware's links write
   * the options of the builder they are called on, which another link of it
   * then reads. Raw reads give none (`effects()` derives each one's).
   */
  env?: 'client' | 'server'
}

/** Per environment type, whether a module's own statements have effects there. */
export interface CodeEffects {
  client: boolean
  server: boolean
}

/** What a module's own top-level statements do when it is evaluated (`ModuleAnalysis.effects`). */
export interface ModuleEffects {
  /** Whether a statement has an effect, module loading included. */
  own: boolean
  /**
   * Whether the module's own statements have effects, module loading aside
   * (bare imports and re-exports are followed by consumers), per environment
   * type: with `builders`, a builder chain with pure arguments is none, and
   * an argument the environment's compile erases is not evaluated there.
   */
  code: CodeEffects
  /**
   * Per environment type, the specifiers whose every import only erased
   * code reads (`code`): that environment's compile does not evaluate them.
   * Null when none is (always without `builders`).
   */
  erasedImports: {
    client: ReadonlyArray<string>
    server: ReadonlyArray<string>
  } | null
}

export const DEFAULT_MARKERS: Record<string, 'server-only' | 'client-only'> = {
  'server-only': 'server-only',
  'client-only': 'client-only',
}

export class ModuleAnalysis {
  readonly source: SourceText
  readonly file: SourceFile
  readonly path: string
  readonly header: Header
  readonly imports: ReadonlyArray<ImportEntry>
  readonly exports: ReadonlyArray<ExportEntry>
  readonly reexports: ReadonlyArray<ReexportEntry>
  readonly dynamicEdges: ReadonlyArray<DynamicEdge>
  readonly markers: Marker
  readonly sourceType: 'module' | 'script' | 'commonjs'
  readonly hasImportOrExport: boolean
  /** The planners' purity (with a compile's builder chains: `env`). */
  readonly purity: PurityContext
  /** The purity of the module's own statements, whatever the environment (`effects()` derives each one's). */
  private readonly ownPurity: PurityContext
  /** The recognizer's chain factories the module imports, if any (each environment's builder purity). */
  private readonly builderImports: BuilderImports | null
  private tier1: Tier1 | null = null
  private readonly markerSpecifiers: Record<
    string,
    'server-only' | 'client-only'
  >
  private readonly importByStatement = new Map<number, number>()
  /**
   * The declaration (declarator or function) of each top-level declared
   * name, by the name's offset (`declaredIn`): what a value analysis asks
   * of a module's exports, without `parentOf` (which indexes every node).
   */
  readonly declarations: ReadonlyMap<number, Node>

  constructor(
    file: SourceFile,
    source: SourceText,
    opts: ModuleAnalysisOptions,
  ) {
    this.file = file
    this.source = source
    this.path = opts.path
    this.header = analyzeHeader(file)
    const noSideEffectCallees = new Set<number>()
    const pureNamespaces = new Map<number, ReadonlySet<string>>()
    let namespaceImports: Set<number> | null = null
    const pureCalls = opts.recognizer?.pureCalls
    const pureDefaults = opts.recognizer?.pureDefaultNamespaces
    const markers = opts.markerSpecifiers ?? DEFAULT_MARKERS
    this.markerSpecifiers = markers
    const imports: Array<ImportEntry> = []
    const exportEntries: Array<ExportEntry> = []
    const reexports: Array<ReexportEntry> = []
    let marker: Marker = null
    const noteMarker = (specifier: string) => {
      const m = ownEntry(markers, specifier)
      if (m) {
        marker = marker === null || marker === m ? m : 'conflict'
      }
    }
    // the bindings import specifiers declare and exports name, from Yuku's
    // module records by node position: a node lookup (`bindingOf`) would
    // build the file's node index, which a Tier-0-only module never needs
    const declarations = new Map<number, Node>()
    this.declarations = declarations
    const importLocals = new Map<number, SymbolId>()
    // the imports of the recognizer's chain factories (`BuilderImports`),
    // in the same pass (a record's fields are decoded on every read)
    const chains = opts.recognizer?.builderLinks ? opts.recognizer : null
    const chainFactories = chains && factoryTable(chains)
    let builderImports: BuilderImports | null = null
    for (const record of file.imports) {
      const local = record.local
      if (local) {
        importLocals.set(record.node.start, local.id as SymbolId)
        if (record.typeOnly) {
          continue
        }
        const kind = record.kind
        if (kind === 'namespace') {
          ;(namespaceImports ??= new Set()).add(local.id)
        }
        const specifier = pureCalls || chainFactories ? record.specifier : ''
        // an import of a known package's pure export: before any
        // statement is classified (a call may precede its hoisted import)
        const pure = pureCalls && ownEntry(pureCalls, specifier)
        const factories = chainFactories?.get(specifier)
        const name = pure || factories ? record.name : null
        if (pure) {
          if (
            kind === 'namespace' ||
            (name === 'default' && pureDefaults?.has(specifier) === true)
          ) {
            pureNamespaces.set(local.id, pure)
          } else if (kind === 'named' && name !== null && pure.has(name)) {
            noSideEffectCallees.add(local.id)
          }
        }
        if (factories) {
          builderImports ??= {
            table: chains!,
            factories: new Map(),
            namespaces: new Map(),
          }
          if (kind === 'namespace') {
            builderImports.namespaces.set(local.name, {
              binding: local.id,
              factories,
            })
          } else if (kind === 'named' && name !== null) {
            const factory = ownEntry(factories, name)
            // (a chain's: other kinds need no per-environment purity)
            if (
              factory !== undefined &&
              (ownEntry(chains!.builderLinks!, factory) !== undefined ||
                ownEntry(chains!.envOnlyKinds, factory) !== undefined)
            ) {
              builderImports.factories.set(local.name, {
                binding: local.id,
                kind: factory,
              })
            }
          }
        }
      }
    }
    if (
      builderImports?.factories.size === 0 &&
      builderImports.namespaces.size === 0
    ) {
      builderImports = null
    }
    this.builderImports = builderImports
    const ownPurity: PurityContext = {
      file,
      comments: file.comments,
      noSideEffectCallees,
      pureNamespaces,
      namespaceImports: namespaceImports ?? NO_NAMESPACES,
      calls: 0,
      // (every context has the same shape: the per-environment ones below
      // set it, and the purity checks run on both)
      builders: undefined,
    }
    const exportLocals = new Map<number, SymbolId>()
    for (const record of file.exports) {
      const local = record.local
      if (local) {
        exportLocals.set(record.node.start, local.id as SymbolId)
      }
    }
    const body = file.program.body
    seedNoSideEffectDeclarations(ownPurity, noSideEffectCallees, body)
    this.ownPurity = ownPurity
    this.purity =
      opts.env && builderImports
        ? builderPurityOf(ownPurity, builderImports, opts.env).ctx
        : ownPurity
    for (let i = this.header.directiveCount; i < body.length; i++) {
      const stmt = body[i]!
      switch (stmt.type) {
        case 'ImportDeclaration': {
          const entry: ImportEntry = {
            index: imports.length,
            specifier: stmt.source.value,
            specifierRange: { start: stmt.source.start, end: stmt.source.end },
            declRange: { start: stmt.start, end: stmt.end },
            attributesRange:
              stmt.attributes.length > 0
                ? {
                    start: stmt.attributes[0]!.start,
                    end: stmt.attributes[stmt.attributes.length - 1]!.end,
                  }
                : null,
            bare: stmt.specifiers.length === 0,
            typeOnly: stmt.importKind === 'type',
            specifiers: stmt.specifiers.map((spec) => {
              return {
                local: importLocals.get(spec.start) ?? (-1 as SymbolId),
                imported:
                  spec.type === 'ImportDefaultSpecifier'
                    ? 'default'
                    : spec.type === 'ImportNamespaceSpecifier'
                      ? '*'
                      : spec.imported.type === 'Identifier'
                        ? spec.imported.name
                        : spec.imported.value,
                typeOnly:
                  stmt.importKind === 'type' ||
                  (spec.type === 'ImportSpecifier' &&
                    spec.importKind === 'type'),
                localName: spec.local.name,
              }
            }),
          }
          this.importByStatement.set(stmt.start, entry.index)
          imports.push(entry)
          if (
            !entry.typeOnly &&
            (entry.bare || entry.specifiers.some((spec) => !spec.typeOnly))
          ) {
            noteMarker(entry.specifier)
          }
          break
        }
        case 'ExportAllDeclaration': {
          const typeOnly = stmt.exportKind === 'type'
          if (!typeOnly) {
            noteMarker(stmt.source.value)
          }
          if (stmt.exported) {
            const name =
              stmt.exported.type === 'Identifier'
                ? stmt.exported.name
                : stmt.exported.value
            exportEntries.push({
              kind: 'namespace',
              name,
              specifier: stmt.source.value,
              typeOnly,
              range: { start: stmt.start, end: stmt.end },
            })
            reexports.push({
              specifier: stmt.source.value,
              specifierRange: {
                start: stmt.source.start,
                end: stmt.source.end,
              },
              statementRange: { start: stmt.start, end: stmt.end },
              kind: 'namespace',
              names: [name],
              typeOnly,
            })
          } else {
            exportEntries.push({
              kind: 'star',
              specifier: stmt.source.value,
              typeOnly,
              range: { start: stmt.start, end: stmt.end },
            })
            reexports.push({
              specifier: stmt.source.value,
              specifierRange: {
                start: stmt.source.start,
                end: stmt.source.end,
              },
              statementRange: { start: stmt.start, end: stmt.end },
              kind: 'star',
              names: [],
              typeOnly,
            })
          }
          break
        }
        case 'ExportNamedDeclaration': {
          const typeOnly = stmt.exportKind === 'type'
          if (stmt.source !== null) {
            if (!typeOnly) {
              noteMarker(stmt.source.value)
            }
            const names: Array<string> = []
            for (const spec of stmt.specifiers) {
              const exported = moduleExportNameOf(spec.exported)
              const local = moduleExportNameOf(spec.local)
              names.push(exported)
              exportEntries.push({
                kind: 'reExport',
                name: exported,
                specifier: stmt.source.value,
                fromName: local,
                typeOnly: typeOnly || spec.exportKind === 'type',
                range: { start: spec.start, end: spec.end },
              })
            }
            reexports.push({
              specifier: stmt.source.value,
              specifierRange: {
                start: stmt.source.start,
                end: stmt.source.end,
              },
              statementRange: { start: stmt.start, end: stmt.end },
              kind: 'named',
              names,
              typeOnly,
            })
          } else if (stmt.declaration !== null) {
            for (const id of declaredNames(stmt.declaration)) {
              exportEntries.push({
                kind: 'local',
                name: id.name,
                local: exportLocals.get(id.start) ?? null,
                typeOnly: typeOnly || isTypeDeclaration(stmt.declaration),
                range: { start: id.start, end: id.end },
              })
            }
          } else {
            for (const spec of stmt.specifiers) {
              const exported = moduleExportNameOf(spec.exported)
              exportEntries.push({
                kind: 'local',
                name: exported,
                local: exportLocals.get(spec.start) ?? null,
                typeOnly: typeOnly || spec.exportKind === 'type',
                range: { start: spec.start, end: spec.end },
              })
            }
          }
          break
        }
        case 'ExportDefaultDeclaration': {
          const d = stmt.declaration
          if (
            (d.type === 'FunctionDeclaration' ||
              d.type === 'ClassDeclaration') &&
            d.id !== null
          ) {
            exportEntries.push({
              kind: 'local',
              name: 'default',
              local: exportLocals.get(stmt.start) ?? null,
              typeOnly: false,
              range: { start: stmt.start, end: stmt.end },
            })
          } else if (d.type === 'Identifier') {
            exportEntries.push({
              kind: 'local',
              name: 'default',
              local: exportLocals.get(stmt.start) ?? null,
              typeOnly: false,
              range: { start: stmt.start, end: stmt.end },
              snapshot: true,
            })
          } else {
            exportEntries.push({
              kind: 'expression',
              name: 'default',
              range: { start: stmt.start, end: stmt.end },
            })
          }
          break
        }
        default:
          break
      }
      const declaration =
        stmt.type === 'ExportNamedDeclaration' ||
        stmt.type === 'ExportDefaultDeclaration'
          ? stmt.declaration
          : stmt
      if (declaration?.type === 'VariableDeclaration') {
        for (const d of declaration.declarations) {
          if (d.id.type === 'Identifier') {
            declarations.set(d.id.start, d)
          }
        }
      } else if (
        declaration?.type === 'FunctionDeclaration' &&
        declaration.id
      ) {
        declarations.set(declaration.id.start, declaration)
      }
    }
    const dynamicEdges: Array<DynamicEdge> = []
    for (const imp of file.imports) {
      if (imp.kind !== 'dynamic' && imp.kind !== 'require') {
        continue
      }
      const node = imp.node
      const specNode =
        node.type === 'ImportExpression'
          ? node.source
          : node.type === 'CallExpression'
            ? (node.arguments[0] ?? null)
            : null
      if (!specNode) {
        continue
      }
      // (loaded when the module evaluates: in a function, it may be code an output erases)
      if (
        ownEntry(markers, imp.specifier) !== undefined &&
        ![...file.ancestors(node)].some(
          (a) =>
            a.type === 'ArrowFunctionExpression' ||
            a.type === 'FunctionExpression' ||
            a.type === 'FunctionDeclaration',
        )
      ) {
        noteMarker(imp.specifier)
      }
      dynamicEdges.push({
        specifier: imp.specifier,
        specifierRange: { start: specNode.start, end: specNode.end },
        form: imp.kind === 'dynamic' ? 'dynamic' : 'require',
        names: imp.kind === 'require' ? this.requireNames(node) : [],
      })
    }
    this.imports = imports
    this.exports = exportEntries
    this.reexports = reexports
    this.dynamicEdges = dynamicEdges
    this.markers = marker
    this.sourceType =
      file.sourceType === 'commonjs' ? 'commonjs' : file.program.sourceType
    this.hasImportOrExport = imports.length > 0 || exportEntries.length > 0
  }

  /**
   * The module's own effects, classified statement by statement (raw facts
   * ask, for a module read as a target; a compile never does). The
   * recognizer's builder chains are no effect per environment
   * (`RecognizerTable.builderLinks`; the planners' purity takes the
   * compile's environment's: `env`).
   */
  effects(): ModuleEffects {
    const file = this.file
    const body = file.program.body
    let own = false
    const code: CodeEffects = { client: false, server: false }
    // the purity of each environment type, with its builder chains
    const envPurity = this.builderImports
      ? ENV_TYPES.map((env) =>
          builderPurityOf(this.ownPurity, this.builderImports!, env),
        )
      : null
    for (let i = this.header.directiveCount; i < body.length; i++) {
      const stmt = body[i]!
      // module loading counts as an own effect, not as an effect of its own
      // code; a marker import declares the module's environment and loads
      // nothing
      if (
        stmt.type === 'ImportDeclaration' &&
        ownEntry(this.markerSpecifiers, stmt.source.value) !== undefined
      ) {
        continue
      }
      if (loadsModule(stmt)) {
        own ||= statementHasEffects(this.ownPurity, stmt)
        continue
      }
      if (code.client && code.server) {
        continue
      }
      const declaration =
        stmt.type === 'ExportNamedDeclaration' ||
        stmt.type === 'ExportDefaultDeclaration'
          ? stmt.declaration
          : stmt
      if (statementHasEffects(this.ownPurity, stmt)) {
        own = true
        if (!envPurity) {
          code.client = code.server = true
          continue
        }
        for (const p of envPurity) {
          if (
            !code[p.env] &&
            // (a TS namespace's body has scopes of its own: the names of
            // `BuilderPurity` are the module's)
            (declaration?.type === 'TSModuleDeclaration' ||
              statementHasEffects(p.ctx, stmt))
          ) {
            // a declaration only erased code reads is erased with it:
            // decided once every statement was read
            const names = erasableNames(stmt, this.source.code)
            if (names) {
              p.pending.push(names)
            } else {
              code[p.env] = true
            }
          }
        }
      }
      if (envPurity && declaration?.type === 'VariableDeclaration') {
        noteBuilderConsts(envPurity, declaration)
      }
    }
    // per environment: the bindings only the arguments its compile erases
    // read, transitively, are erased with them (the compile removes what its
    // edits orphaned): their declarations' effects and their imports'
    // evaluation do not count there
    let erasedImports: { client: Array<string>; server: Array<string> } | null =
      null
    for (const p of envPurity ?? NO_ENV_PURITY) {
      if (code[p.env]) {
        continue
      }
      const erased = erasedBindings(
        file,
        body,
        this.imports,
        p.ctx.builders.erased,
      )
      if (!p.pending.every((names) => names.every((n) => erased.has(n)))) {
        code[p.env] = true
        continue
      }
      const specifiers = erasedImportSpecifiers(
        this.imports,
        this.reexports,
        erased,
      )
      if (specifiers.length > 0) {
        erasedImports ??= { client: [], server: [] }
        erasedImports[p.env] = specifiers
      }
    }
    return { own, code, erasedImports }
  }

  importIndexOfStatement(stmtStart: number): number | null {
    return this.importByStatement.get(stmtStart) ?? null
  }

  /**
   * The names a `require(...)` call's result is read by: `const { a, b } =
   * require(…)` its pattern keys, `const m = require(…)` the static member
   * reads of `m` (`'*'` when `m` escapes), `require(…).a` the member; any
   * other use is opaque (`'*'`). A mock of a denied CommonJS or unknown
   * target then owns the names the importer reads (J6.3).
   */
  private requireNames(call: Node): Array<string> {
    const names: Array<string> = []
    const add = (n: string | null) => {
      if (n !== null && !names.includes(n)) {
        names.push(n)
      }
    }
    const parent = this.file.parentOf(call)
    if (
      parent &&
      parent.type === 'MemberExpression' &&
      parent.object === call
    ) {
      add(staticMemberName(parent) ?? '*')
      return names
    }
    if (
      parent &&
      parent.type === 'VariableDeclarator' &&
      parent.init === call
    ) {
      const id = parent.id
      if (id.type === 'ObjectPattern') {
        for (const prop of id.properties) {
          if (prop.type === 'RestElement') {
            add('*')
          } else if (!prop.computed) {
            add(
              prop.key.type === 'Identifier'
                ? prop.key.name
                : prop.key.type === 'Literal' &&
                    typeof prop.key.value === 'string'
                  ? prop.key.value
                  : '*',
            )
          } else {
            add('*')
          }
        }
        return names
      }
      if (id.type === 'Identifier') {
        const binding = this.file.bindingOf(id)
        if (binding) {
          for (const ref of binding.references) {
            const node = ref.node
            if (node === id || ref.isWrite || ref.inTypePosition) {
              continue
            }
            const parent = this.file.parentOf(node)
            add(
              parent &&
                parent.type === 'MemberExpression' &&
                parent.object === node
                ? (staticMemberName(parent) ?? '*')
                : '*',
            )
          }
          return names
        }
      }
    }
    add('*')
    return names
  }

  /**
   * How an import binding is used as a value (J6 edge names): `live` when a
   * value-space reference (a read, a JSX tag, an `export { x }`) starts where
   * `keep` holds; for a namespace binding, the member names read statically
   * (`ns.x`, `ns['x']`, `<ns.X/>`), `opaque` when the namespace is used any
   * other way (any other binding has no members to read: its first live
   * reference answers). A semantic query over the binding's references, no
   * walk.
   */
  importUses(
    local: SymbolId,
    keep: (start: number) => boolean = () => true,
  ): ImportUses {
    const b = (local as number) >= 0 ? this.file.bindings[local] : undefined
    const uses: ImportUses = { live: false, members: [], opaque: false }
    if (!b) {
      return uses
    }
    const namespace = b.import?.kind === 'namespace'
    for (const ref of b.references) {
      if (ref.inTypePosition || ref.space === 'type') {
        continue
      }
      const node = ref.node
      if (!keep(node.start)) {
        continue
      }
      uses.live = true
      if (!namespace) {
        return uses
      }
      const parent = this.file.parentOf(node)
      const member =
        parent &&
        (parent.type === 'MemberExpression' ||
          parent.type === 'JSXMemberExpression') &&
        parent.object === node
          ? staticMemberName(parent)
          : null
      if (member === null) {
        uses.opaque = true
      } else if (!uses.members.includes(member)) {
        uses.members.push(member)
      }
    }
    return uses
  }

  /**
   * The names an import edge binds and reads (J6): each live
   * named/default specifier by its imported name; a live namespace by its
   * static member reads, plus '*' when opaque. Type-only specifiers and
   * specifiers `include` rejects are skipped.
   */
  importEdgeNames(
    imp: ImportEntry,
    keep: (start: number) => boolean = () => true,
    include: (spec: ImportSpecifierEntry) => boolean = () => true,
  ): Array<string> {
    const names: Array<string> = []
    const add = (n: string) => {
      if (!names.includes(n)) {
        names.push(n)
      }
    }
    for (const spec of imp.specifiers) {
      if (spec.typeOnly || !include(spec)) {
        continue
      }
      const uses = this.importUses(spec.local, keep)
      if (!uses.live) {
        continue
      }
      if (spec.imported !== '*') {
        add(spec.imported)
        continue
      }
      for (const m of uses.members) {
        add(m)
      }
      if (uses.opaque) {
        add('*')
      }
    }
    return names
  }

  private jsxInfo: JsxInfo | null = null
  /**
   * The JSX runtime from the leading pragmas, and the bindings JSX reads
   * implicitly under the classic runtime: the factory every element reads
   * and the fragment factory every fragment reads. Without a pragma the
   * project's transform decides the runtime; a module-level `React` binding
   * with a runtime value (not `import type * as React`) is read by every
   * JSX element when it is classic (Babel's default factory, and the
   * TypeScript transforms keep its import whatever the runtime), so it is
   * counted as a read.
   */
  jsx(): JsxInfo {
    if (this.jsxInfo !== null) {
      return this.jsxInfo
    }
    let runtime: JsxInfo['runtime'] = 'unknown'
    let factoryName: string | null = null
    let fragmentName: string | null = null
    for (const p of this.header.pragmas) {
      if (p.kind === 'jsxImportSource') {
        runtime = 'automatic'
      } else if (p.kind === 'jsxRuntime') {
        runtime = p.value === 'classic' ? 'classic' : 'automatic'
      } else if (p.kind === 'jsx') {
        factoryName = p.value
        if (runtime === 'unknown') {
          runtime = 'classic'
        }
      } else {
        fragmentName = p.value
      }
    }
    const rootScope = this.file.rootScope
    const rootSym = (name: string | null): SymbolId | null => {
      if (!name) {
        return null
      }
      const b = valueBinding(rootScope, name.split('.')[0]!)
      return b ? (b.id as SymbolId) : null
    }
    const factory =
      runtime === 'classic'
        ? rootSym(factoryName ?? 'React')
        : runtime === 'unknown'
          ? rootSym('React')
          : null
    const fragment =
      runtime === 'classic'
        ? rootSym(fragmentName ?? factoryName ?? 'React')
        : runtime === 'unknown'
          ? factory
          : null
    return (this.jsxInfo = { runtime, factory, fragment })
  }

  private implicitReads: ReadonlySet<SymbolId> | null = null
  /**
   * The bindings the module's JSX reads implicitly (`jsx()`), without Tier
   * 1: whether it has an element (the factory) and a fragment (the fragment
   * factory), one walk that stops once it saw both, or either when both read
   * the same binding. TypeScript (`.ts`) has no JSX.
   */
  implicitJsxReads(): ReadonlySet<SymbolId> {
    if (this.implicitReads !== null) {
      return this.implicitReads
    }
    const reads = new Set<SymbolId>()
    const jsx = this.jsx()
    const factory = jsx.factory
    if (factory !== null && this.file.lang !== 'ts') {
      const fragment = jsx.fragment ?? factory
      // (the walk's callbacks set them)
      const seen = { element: false, fragment: false }
      walk(this.file.program, {
        JSXElement: (_n, w) => {
          seen.element = true
          if (seen.fragment || fragment === factory) {
            w.stop()
          }
        },
        JSXFragment: (_n, w) => {
          seen.fragment = true
          if (seen.element || fragment === factory) {
            w.stop()
          }
        },
      })
      if (seen.element) {
        reads.add(factory)
      }
      if (seen.fragment) {
        reads.add(fragment)
      }
    }
    return (this.implicitReads = reads)
  }

  t1(): Tier1 {
    if (this.tier1) {
      return this.tier1
    }
    const file = this.file
    const symbols = new SymbolTable(file)
    const items = buildItems(file, this.header)
    const { units, regions, declaringUnits } = buildUnits(
      file,
      items,
      symbols,
      this.purity,
      (s) => this.importIndexOfStatement(s),
    )

    // Function ranges from the scope table: every function's scope (a
    // declaration inside is local to it), and the lazily evaluated ones
    // (an immediately invoked function runs where it is written). Each
    // set is reduced to its outermost ranges and searched by offset.
    const fnRanges: Array<Range> = []
    const lazyRanges: Array<Range> = []
    for (const scope of file.scopes) {
      if (scope.kind !== 'function') {
        continue
      }
      const n = scope.node
      const r = { start: n.start, end: n.end }
      fnRanges.push(r)
      if (!isImmediatelyInvoked(file, n)) {
        lazyRanges.push(r)
      }
    }
    lazyRanges.sort((a, b) => a.start - b.start || b.end - a.end)
    const isLazyAt = offsetTest(outermost(lazyRanges))
    // the scope question is asked for function-local orphans only
    let inFunction: ((offset: number) => boolean) | null = null
    const inFunctionAt = (offset: number): boolean => {
      if (inFunction === null) {
        fnRanges.sort((a, b) => a.start - b.start || b.end - a.end)
        inFunction = offsetTest(outermost(fnRanges))
      }
      return inFunction(offset)
    }

    const refs: Array<ClassifiedRef> = []
    const freeRefs: Array<FreeRef> = []
    const names = new Set<string>(symbols.names())
    for (const ref of file.references) {
      if (ref.inTypePosition || ref.space === 'type') {
        continue
      }
      const node = ref.node
      const b = ref.binding
      if (b === null) {
        names.add(ref.name)
        freeRefs.push({
          name: ref.name,
          range: { start: node.start, end: node.end },
        })
        continue
      }
      if (symbols.kind(symbols.ofBinding(b)) === 'ambient') {
        continue
      }
      const c = classify(file, ref)
      refs.push({
        sym: symbols.ofBinding(b),
        range: { start: node.start, end: node.end },
        kind: c.kind,
        ctx: c.ctx,
        eager: !isLazyAt(node.start),
        exportShorthand: c.exportShorthand,
        memberWrite: c.kind === 'value' && writesMember(file, node),
      })
    }

    // a `var` declared again: what that declaration gives it is a write, like
    // an assignment, except what its declaring unit starts it with (a nested
    // declaration runs with its statement, whatever its position)
    for (const b of file.rootScope.bindings) {
      // (reading `declarations` builds them: a `var` is the rare case)
      if (!b.has(BindingFlags.FunctionScopedVariable)) {
        continue
      }
      const declarations = b.declarations.filter((id) => {
        const type = file.parentOf(id)?.type
        return (
          type !== 'TSTypeAliasDeclaration' && type !== 'TSInterfaceDeclaration'
        )
      })
      if (declarations.length < 2) {
        continue
      }
      const sym = symbols.ofBinding(b)
      const own = units[declaringUnits.get(sym)?.[0] ?? -1]
      declarations.forEach((id, i) => {
        if (
          (i > 0 || !own || id.start < own.range.start) &&
          declarationAssigns(file, id)
        ) {
          refs.push({
            sym,
            range: { start: id.start, end: id.end },
            ...classify(file, { node: id, isWrite: true }),
            eager: !isLazyAt(id.start),
            memberWrite: false,
          })
        }
      })
    }

    // classic (or unknown) runtime → implicit factory reads per element
    const jsx = this.jsx()
    const { factory, fragment } = jsx
    if (factory !== null) {
      walk(file.program, {
        JSXElement: (n) => {
          refs.push({
            sym: factory,
            range: { start: n.start, end: n.start },
            kind: 'implicitJsxFactory',
            ctx: 'plain',
            eager: !isLazyAt(n.start),
            memberWrite: false,
          })
        },
        JSXFragment: (n) => {
          refs.push({
            sym: fragment ?? factory,
            range: { start: n.start, end: n.start },
            kind: 'implicitJsxFactory',
            ctx: 'plain',
            eager: !isLazyAt(n.start),
            memberWrite: false,
          })
        },
      })
    }
    // Solid directives (`<p use:tip>`) name their function in a JSX
    // attribute only: a value read of the binding where the JSX is
    if (this.source.code.includes('use:')) {
      walk(file.program, {
        JSXAttribute: (n) => {
          const name = n.name
          if (
            name.type !== 'JSXNamespacedName' ||
            name.namespace.name !== 'use'
          ) {
            return
          }
          const b = valueBinding(file.scopeOf(n), name.name.name)
          if (!b || b.has(BindingFlags.Ambient)) {
            return
          }
          refs.push({
            sym: symbols.ofBinding(b),
            range: { start: name.name.start, end: name.name.end },
            kind: 'value',
            ctx: 'plain',
            eager: !isLazyAt(n.start),
            memberWrite: false,
          })
        },
      })
    }
    refs.sort(
      (a, b) => a.range.start - b.range.start || a.range.end - b.range.end,
    )
    const refIndex = new RefIndex(refs, units)
    const mutation = new MutationModel(refIndex)

    const exportNames = new Set<string>()
    for (const e of this.exports) {
      if (e.kind !== 'star') {
        exportNames.add(e.name)
      }
    }

    const tier1: Tier1 = {
      items,
      units,
      regions,
      symbols,
      refs: refIndex,
      freeRefs,
      jsx,
      names,
      exportNames,
      declaringUnits,
      mutation,
      snapshotDiffers: (sym, at, live) => {
        if (mutation.isReassigned(sym, live)) {
          return true
        }
        if (symbols.isImport(sym)) {
          return false
        }
        return (symbols.binding(sym)?.declarations ?? []).some((id) => {
          const parent = id.start < at ? null : file.parentOf(id)
          return (
            parent !== null &&
            parent.type !== 'FunctionDeclaration' &&
            parent.type !== 'TSDeclareFunction' &&
            parent.type !== 'TSInterfaceDeclaration' &&
            parent.type !== 'TSTypeAliasDeclaration'
          )
        })
      },
      isLazyAt,
      inFunctionAt,
      parentOf: (node) => file.parentOf(node),
      nodeAt: (offset) => file.nodeAt(offset),
      ownerOf: (ref) => {
        const id = regions.innermostAt(ref.range.start, ref.range.end)
        if (id === null) {
          throw new Error(
            `reference at ${ref.range.start} is outside every region`,
          )
        }
        return id
      },
      capturesOf: (range) => {
        const out: Array<SymbolId> = []
        const seen = new Set<SymbolId>()
        for (const r of refIndex.refsIn(range)) {
          if (seen.has(r.sym) || symbols.isModuleLevel(r.sym)) {
            continue
          }
          const scope = symbols.scopeRange(r.sym)
          if (scope && scope.start >= range.start && scope.end <= range.end) {
            continue
          }
          seen.add(r.sym)
          out.push(r.sym)
        }
        return out
      },
    }
    this.tier1 = tier1
    return tier1
  }
}

/** The ranges of `ranges` (sorted by start, longest first) not nested in another one. */
function outermost<TRange extends Range>(
  ranges: ReadonlyArray<TRange>,
): Array<TRange> {
  const outer: Array<TRange> = []
  for (const r of ranges) {
    const last = outer[outer.length - 1]
    if (last && r.start >= last.start && r.end <= last.end) {
      continue
    }
    outer.push(r)
  }
  return outer
}

/** Whether an offset lies in one of `outer` (disjoint, sorted). */
function offsetTest(outer: ReadonlyArray<Range>): (offset: number) => boolean {
  return (offset) => {
    let lo = 0
    let hi = outer.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = outer[mid]!
      if (r.start <= offset) {
        if (offset < r.end) {
          return true
        }
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return false
  }
}

/**
 * Whether a function node is invoked where it is written: the callee of a
 * call, a `new` or a tagged template (`(() => …)()`, `(function () { … })()`,
 * `(async () => …)()`, `(() => …)?.()`, `new (function () { … })()`), through
 * the wrappers a value passes (`(f)`, `f as T`, `f!`, `f satisfies T`,
 * `<T>f`, `f<T>`) and `.call(…)`, `.apply(…)` or `.bind(…)(…)`. Its body
 * evaluates with the surrounding code (the part of an async one after its
 * first `await` later, but nothing can be known about that: eager is the
 * safe classification). Asked of the parents: the text around the function
 * cannot tell (`const f = () => { … }` followed by a line starting with
 * `(` is two statements).
 */
function isImmediatelyInvoked(file: SourceFile, fn: Node): boolean {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression'
  ) {
    return false // a declaration is never a callee
  }
  let n = outermostWrapper(file, fn)
  let parent = file.parentOf(n)
  const method =
    parent !== null &&
    parent.type === 'MemberExpression' &&
    parent.object === n &&
    !parent.computed &&
    parent.property.type === 'Identifier'
      ? parent.property.name
      : null
  if (method === 'call' || method === 'apply' || method === 'bind') {
    n = outermostWrapper(file, parent!)
    parent = file.parentOf(n)
    if (parent?.type !== 'CallExpression' || parent.callee !== n) {
      return false
    }
    if (method !== 'bind') {
      return true
    }
    // `.bind(…)` gives the function to invoke
    n = outermostWrapper(file, parent)
    parent = file.parentOf(n)
  }
  if (parent === null) {
    return false
  }
  switch (parent.type) {
    case 'CallExpression':
    case 'NewExpression':
      return parent.callee === n
    case 'TaggedTemplateExpression':
      return parent.tag === n
    default:
      return false
  }
}

/** `node`, or the outermost of the wrappers around it that pass its value. */
function outermostWrapper(file: SourceFile, node: Node): Node {
  let n = node
  let parent = file.parentOf(n)
  while (parent !== null && WRAPPER_TYPES.has(parent.type)) {
    n = parent
    parent = file.parentOf(n)
  }
  return n
}

const WRAPPER_TYPES = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
])

/** An import or re-export statement (it evaluates another module). */
function loadsModule(stmt: Node): boolean {
  return (
    stmt.type === 'ImportDeclaration' ||
    stmt.type === 'ExportAllDeclaration' ||
    (stmt.type === 'ExportNamedDeclaration' && stmt.source !== null)
  )
}

interface ImportUses {
  live: boolean
  /** Statically read member names (namespace bindings). */
  members: Array<string>
  /** Used other than through a static member read. */
  opaque: boolean
}

function staticMemberName(member: Node): string | null {
  if (member.type === 'JSXMemberExpression') {
    return member.property.name
  }
  if (member.type !== 'MemberExpression') {
    return null
  }
  const p = member.property
  if (!member.computed) {
    return p.type === 'Identifier' ? p.name : null
  }
  return p.type === 'Literal' && typeof p.value === 'string' ? p.value : null
}

function moduleExportNameOf(n: Node): string {
  return n.type === 'Identifier'
    ? n.name
    : String((n as { value: unknown }).value)
}

function declaredNames(
  decl: Node,
): Array<Extract<Node, { type: 'Identifier' }>> {
  switch (decl.type) {
    case 'VariableDeclaration': {
      const out: Array<Extract<Node, { type: 'Identifier' }>> = []
      for (const d of decl.declarations) {
        for (const id of patternIdentifiers(d.id)) {
          out.push(id)
        }
      }
      return out
    }
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
      return decl.id ? [decl.id] : []
    case 'TSImportEqualsDeclaration':
      return [decl.id]
    case 'TSModuleDeclaration': {
      const id = namespaceName(decl)
      return id === null ? [] : [id]
    }
    default:
      return []
  }
}

function isTypeDeclaration(decl: Node): boolean {
  return (
    decl.type === 'TSTypeAliasDeclaration' ||
    decl.type === 'TSInterfaceDeclaration' ||
    (decl.type === 'TSModuleDeclaration' && decl.declare) ||
    (decl.type === 'TSImportEqualsDeclaration' && decl.importKind === 'type') ||
    ((decl.type === 'VariableDeclaration' ||
      decl.type === 'ClassDeclaration' ||
      decl.type === 'FunctionDeclaration') &&
      decl.declare === true) ||
    decl.type === 'TSDeclareFunction'
  )
}

/**
 * Whether the `var` name `id` declares takes a value there: an initialiser, or
 * the head of a for-in/of (not in `catch (x) { var x = 1 }`: that writes the
 * parameter).
 */
function declarationAssigns(file: SourceFile, id: Node): boolean {
  let declarator = file.parentOf(id)
  while (declarator !== null && declarator.type !== 'VariableDeclarator') {
    declarator = file.parentOf(declarator)
  }
  if (declarator === null) {
    return false
  }
  const declaration = file.parentOf(declarator)!
  const loop = file.parentOf(declaration)
  if (
    declarator.init === null &&
    !(
      (loop?.type === 'ForInStatement' || loop?.type === 'ForOfStatement') &&
      loop.left === declaration
    )
  ) {
    return false
  }
  for (let n = loop; n !== null; n = file.parentOf(n)) {
    if (
      n.type === 'CatchClause' &&
      n.param?.type === 'Identifier' &&
      n.param.name === (id as { name?: string }).name
    ) {
      return false
    }
  }
  return true
}

/**
 * Which references run when the module loads: the eager ones, and every
 * reference inside a module-level function or class that the load may run.
 * The load runs what an eager reference calls, and a unit whose evaluation
 * calls anything (effectful or not) may run whatever it reads: its callee
 * can be an alias, a method of an object it reads (`o.m()`, `read.call()`),
 * a function it returns, or take the function as an argument (`apply(read)`,
 * `['x'].map((k) => n + k)`: `callsWhenEvaluated`). A function nested in an
 * object or array argument (`defineComponent({ setup() {} })`) runs only
 * when called. What such a body reads may run too, transitively. A static
 * module that evaluates
 * `const config = build()` runs `build`'s body before the route module's own
 * body, whatever `build` reads; the position of a read says nothing about
 * when it happens once a call is involved. Holding a function runs nothing
 * (`const config = { read }`), nor does writing one of its properties.
 * `live`: a reference in code the output evaluates where it is written
 * (kept, and not relocated by a claim).
 */
export function runsAtLoad(
  t1: Pick<Tier1, 'refs' | 'units' | 'regions' | 'declaringUnits' | 'ownerOf'>,
  live: (ref: ClassifiedRef) => boolean = () => true,
): (ref: ClassifiedRef) => boolean {
  const marked = new Set<UnitId>()
  const seeds: Array<ClassifiedRef> = []
  /** References inside a function a calling unit passes on: they run at load. */
  const loadCallbackRefs = new Set<ClassifiedRef>()
  for (const r of t1.refs.all) {
    if (r.eager && callsValue(r) && live(r)) {
      seeds.push(r)
    }
  }
  // a unit whose evaluation calls something, effectful or not: what it
  // reads may be called, and a function it passes to a call may run
  for (const unit of t1.units) {
    // an effectful unit's purity check stopped before the calls after its
    // first impure part
    if (
      !unit.callsAtLoad &&
      !(unit.effectful && EVALUATED_KINDS.has(unit.kind))
    ) {
      continue
    }
    const { calls, callbacks } = callsWhenEvaluated(unit.node)
    if (!calls) {
      continue
    }
    for (const inner of t1.refs.refsIn(unit.range)) {
      if (inner.eager && mayRun(inner, live)) {
        seeds.push(inner)
      }
    }
    for (const range of callbacks) {
      for (const inner of t1.refs.refsIn(range)) {
        if (!inner.eager && mayRun(inner, live)) {
          seeds.push(inner)
          loadCallbackRefs.add(inner)
        }
      }
    }
  }
  // (a calling unit's own references count through `loadCallbackRefs`: a
  // function it holds, or nests in an argument, runs only when called)
  unitsRunBy(t1, seeds, live, marked)
  if (marked.size === 0 && loadCallbackRefs.size === 0) {
    return (ref) => ref.eager
  }
  return (ref) => {
    if (ref.eager || loadCallbackRefs.has(ref)) {
      return true
    }
    const u = t1.regions.unitOf(t1.ownerOf(ref))
    return u !== null && marked.has(u)
  }
}

/** Units whose text the module evaluates (imports, re-exports and types aside). */
const EVALUATED_KINDS = new Set(['declaration', 'effect', 'export-default'])

/**
 * Whether what a live reference reads may run where it is evaluated: not
 * the root of a member write (`Page.displayName = f()` writes `Page`, it does
 * not call it).
 */
const mayRun = (
  ref: ClassifiedRef,
  live: (ref: ClassifiedRef) => boolean,
): boolean => !ref.memberWrite && live(ref)

/**
 * The module-level declarations whose bodies may run where `refs` run (what
 * they read, transitively), added to `marked`: a reference may call what it
 * reads, or hand it to something that does.
 */
export function unitsRunBy(
  t1: Pick<Tier1, 'refs' | 'units' | 'declaringUnits'>,
  refs: Iterable<ClassifiedRef>,
  live: (ref: ClassifiedRef) => boolean,
  marked: Set<UnitId> = new Set(),
): Set<UnitId> {
  const work = [...refs]
  while (work.length > 0) {
    const r = work.pop()!
    for (const u of t1.declaringUnits.get(r.sym) ?? []) {
      const unit = t1.units[u]!
      if (unit.kind !== 'declaration' || marked.has(u)) {
        continue
      }
      marked.add(u)
      for (const inner of t1.refs.refsIn(unit.range)) {
        if (mayRun(inner, live)) {
          work.push(inner)
        }
      }
    }
  }
  return marked
}

/** The wrappers a value passes through unchanged (`(X)`, `X as T`, `X!`, `X satisfies T`, `<T>X`). */
const VALUE_WRAPPERS = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
])

/**
 * How the value a reference reads is used by its parent, looking through
 * the value wrappers: `callee` (a call, a tagged template), `newCallee`
 * (constructed: called, identity observed), `identity` (an operand of
 * `instanceof`, `===`, `!==`, `==`, `!=`, a `switch` value or `case` test,
 * the object of a `.prototype` read), else null.
 */
function valueUse(
  file: SourceFile,
  node: Node,
  parent: Node,
): RefContext | null {
  let child = node
  let p: Node | null = parent
  while (p !== null && VALUE_WRAPPERS.has(p.type)) {
    child = p
    p = file.parentOf(p)
  }
  if (p === null) {
    return null
  }
  switch (p.type) {
    case 'CallExpression':
      return p.callee === child ? 'callee' : null
    case 'NewExpression':
      return p.callee === child ? 'newCallee' : null
    case 'TaggedTemplateExpression':
      return p.tag === child ? 'callee' : null
    case 'BinaryExpression':
      return p.operator === '===' ||
        p.operator === '!==' ||
        p.operator === '==' ||
        p.operator === '!=' ||
        (p.operator === 'instanceof' && p.right === child)
        ? 'identity'
        : null
    case 'MemberExpression':
      return p.object === child &&
        !p.computed &&
        p.property.type === 'Identifier' &&
        p.property.name === 'prototype'
        ? 'identity'
        : null
    // `switch` compares its value with each `case` by `===`
    case 'SwitchStatement':
      return p.discriminant === child ? 'identity' : null
    case 'SwitchCase':
      return p.test === child ? 'identity' : null
    default:
      return null
  }
}

function classify(
  file: SourceFile,
  ref: { node: Node; isWrite: boolean },
): {
  kind: RefKind
  ctx: RefContext
  exportShorthand?: boolean
} {
  const node = ref.node
  const parent = file.parentOf(node)
  if (node.type === 'JSXIdentifier') {
    if (parent?.type === 'JSXOpeningElement') {
      return { kind: 'jsxTag', ctx: 'jsxOpen' }
    }
    if (parent?.type === 'JSXClosingElement') {
      return { kind: 'jsxTag', ctx: 'jsxClose' }
    }
    return { kind: 'jsxTag', ctx: 'jsxTag' }
  }
  if (parent === null) {
    return { kind: ref.isWrite ? 'write' : 'value', ctx: 'plain' }
  }
  switch (parent.type) {
    case 'ExportSpecifier':
      return {
        kind: 'exportSpecifier',
        ctx: 'exportSpec',
        exportShorthand: parent.exported.start === parent.local.start,
      }
    case 'Property':
      if (parent.shorthand && parent.value === node) {
        const gp = file.parentOf(parent)
        return {
          kind: ref.isWrite ? 'write' : 'value',
          ctx:
            gp?.type === 'ObjectPattern' ? 'shorthandPattern' : 'shorthandProp',
        }
      }
      return { kind: ref.isWrite ? 'write' : 'value', ctx: 'plain' }
    case 'AssignmentPattern': {
      // `{ a = 1 }`: `a` names the property too
      const property = parent.left === node ? file.parentOf(parent) : null
      if (property?.type === 'Property' && property.shorthand) {
        return { kind: 'write', ctx: 'shorthandPattern' }
      }
      return {
        kind: ref.isWrite ? 'write' : 'value',
        ctx: ref.isWrite ? 'assignTarget' : 'plain',
      }
    }
    case 'CallExpression':
      return { kind: 'value', ctx: parent.callee === node ? 'callee' : 'plain' }
    case 'TaggedTemplateExpression':
      return { kind: 'value', ctx: parent.tag === node ? 'callee' : 'plain' }
    case 'AssignmentExpression':
      // `n += 1`, `n ||= x` read `n` too, as `n++` does
      return parent.left === node
        ? {
            kind: 'write',
            ctx: parent.operator === '=' ? 'assignTarget' : 'updateTarget',
          }
        : { kind: 'value', ctx: 'plain' }
    case 'UpdateExpression':
      return { kind: 'write', ctx: 'updateTarget' }
    // the identity uses, inline for the common parents (a member read is
    // the most frequent parent of a reference): `valueUse` only walks the
    // value wrappers
    case 'MemberExpression':
      return {
        kind: ref.isWrite ? 'write' : 'value',
        ctx: ref.isWrite
          ? 'assignTarget'
          : parent.object === node &&
              !parent.computed &&
              parent.property.type === 'Identifier' &&
              parent.property.name === 'prototype'
            ? 'identity'
            : 'plain',
      }
    case 'NewExpression':
      return {
        kind: 'value',
        ctx: parent.callee === node ? 'newCallee' : 'plain',
      }
    case 'BinaryExpression':
      return {
        kind: 'value',
        ctx:
          parent.operator === '===' ||
          parent.operator === '!==' ||
          parent.operator === '==' ||
          parent.operator === '!=' ||
          (parent.operator === 'instanceof' && parent.right === node)
            ? 'identity'
            : 'plain',
      }
    case 'SwitchStatement':
      return {
        kind: 'value',
        ctx: parent.discriminant === node ? 'identity' : 'plain',
      }
    case 'SwitchCase':
      return {
        kind: 'value',
        ctx: parent.test === node ? 'identity' : 'plain',
      }
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion': {
      if (ref.isWrite) {
        return { kind: 'write', ctx: 'assignTarget' }
      }
      return { kind: 'value', ctx: valueUse(file, node, parent) ?? 'plain' }
    }
    default:
      return {
        kind: ref.isWrite ? 'write' : 'value',
        ctx: ref.isWrite ? 'assignTarget' : 'plain',
      }
  }
}

/**
 * Records the module-level `const`s of `declaration` whose value is a
 * builder chain's builder in an environment's purity (its later links read
 * them as receivers): after its statement is classified, so a read before
 * the declaration (a TDZ error) is no such receiver.
 */
function noteBuilderConsts(
  envPurity: ReadonlyArray<{
    ctx: PurityContext & { builders: BuilderPurity }
  }>,
  declaration: Extract<Node, { type: 'VariableDeclaration' }>,
): void {
  if (declaration.kind !== 'const') {
    return
  }
  for (const d of declaration.declarations) {
    if (d.id.type !== 'Identifier' || d.init === null) {
      continue
    }
    const init = unwrapExpression(d.init)
    if (init.type !== 'CallExpression') {
      continue
    }
    for (const { ctx } of envPurity) {
      const call = builderCall(ctx, ctx.builders, init)
      if (call?.open) {
        ctx.builders.locals.set(d.id.name, call.kind)
      }
    }
  }
}

/**
 * The names a statement declares when only erased code may read them: a
 * module-level `const` of plain identifiers (an exported one is read by its
 * importers). Not one with `await` in its text: an async module delays its
 * importers' evaluation, whatever reads it.
 */
function erasableNames(stmt: Node, code: string): Array<string> | null {
  if (
    stmt.type !== 'VariableDeclaration' ||
    stmt.kind !== 'const' ||
    code.slice(stmt.start, stmt.end).includes('await')
  ) {
    return null
  }
  const names: Array<string> = []
  for (const d of stmt.declarations) {
    if (d.id.type !== 'Identifier') {
      return null
    }
    names.push(d.id.name)
  }
  return names
}

/**
 * The names of the module-level bindings (value imports, unexported
 * `const`s and function declarations) the erasure of `erased` orphans:
 * every value read of one lies in `erased` or in the declaration of
 * another, and a chain of such reads reaches it from `erased`. A binding
 * nothing reads, or only code unreferenced in the source reads, is never
 * one (that code stays). By name: module-level names are unique.
 */
function erasedBindings(
  file: SourceFile,
  body: ReadonlyArray<Node>,
  imports: ReadonlyArray<ImportEntry>,
  erased: ReadonlyArray<{ start: number; end: number }>,
): Set<string> {
  if (erased.length === 0) {
    return new Set()
  }
  const exported = new Set<string>()
  for (const record of file.exports) {
    if (record.local) {
      exported.add(record.local.name)
    }
  }
  const importBindings = new Map<string, Binding>()
  for (const record of file.imports) {
    if (record.local && !record.typeOnly) {
      importBindings.set(record.local.name, record.local)
    }
  }
  /** Candidate name → its declaration's range (none for an import). */
  const declared = new Map<string, { start: number; end: number } | null>()
  for (const imp of imports) {
    if (imp.typeOnly || imp.bare) {
      continue
    }
    for (const spec of imp.specifiers) {
      if (!spec.typeOnly) {
        declared.set(spec.localName, null)
      }
    }
  }
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const') {
      for (const d of stmt.declarations) {
        if (d.id.type === 'Identifier') {
          declared.set(d.id.name, { start: d.start, end: d.end })
        }
      }
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      declared.set(stmt.id.name, { start: stmt.start, end: stmt.end })
    }
  }
  // only a binding whose name the erased text (or a declaration it reaches)
  // holds can be read there: no other binding's references are read (each
  // reference's node is built on demand)
  const named = new Set<string>()
  let unnamed = [...declared.keys()].filter((name) => !exported.has(name))
  let text = erased.map((r) => file.source.slice(r.start, r.end)).join('\n')
  while (text !== '' && unnamed.length > 0) {
    const rest: Array<string> = []
    const added: Array<string> = []
    for (const name of unnamed) {
      if (text.includes(name)) {
        named.add(name)
        const d = declared.get(name)
        if (d) {
          added.push(file.source.slice(d.start, d.end))
        }
      } else {
        rest.push(name)
      }
    }
    unnamed = rest
    // (the next round looks in the declarations just reached)
    text = added.join('\n')
  }
  const reads = new Map<string, Array<number>>()
  for (const name of named) {
    const binding =
      declared.get(name) === null
        ? importBindings.get(name)
        : file.rootScope.find(name)
    const at = (binding?.references ?? [])
      .filter((r) => !r.inTypePosition)
      .map((r) => r.node.start)
    if (at.length > 0) {
      reads.set(name, at)
    }
  }
  const inside = (
    at: number,
    ranges: Iterable<{ start: number; end: number } | null | undefined>,
  ) => {
    for (const r of ranges) {
      if (r && at >= r.start && at < r.end) {
        return true
      }
    }
    return false
  }
  let set = new Set(reads.keys())
  for (let changed = true; changed; ) {
    changed = false
    // every read inside the erased code
    const ranges = [...erased, ...[...set].map((n) => declared.get(n))]
    for (const name of set) {
      if (!reads.get(name)!.every((at) => inside(at, ranges))) {
        set.delete(name)
        changed = true
      }
    }
    // reached from the erased arguments
    const reached = new Set<string>()
    for (let grew = true; grew; ) {
      grew = false
      const from = [...erased, ...[...reached].map((n) => declared.get(n))]
      for (const name of set) {
        if (
          !reached.has(name) &&
          reads.get(name)!.some((at) => inside(at, from))
        ) {
          reached.add(name)
          grew = true
        }
      }
    }
    if (reached.size < set.size) {
      set = reached
      changed = true
    }
  }
  return set
}

/** The specifiers whose every value import binds only `erased` bindings, and that nothing re-exports. */
function erasedImportSpecifiers(
  imports: ReadonlyArray<ImportEntry>,
  reexports: ReadonlyArray<ReexportEntry>,
  erased: ReadonlySet<string>,
): Array<string> {
  const kept = new Set<string>()
  const dropped = new Set<string>()
  for (const imp of imports) {
    if (imp.typeOnly) {
      continue
    }
    const values = imp.specifiers.filter((spec) => !spec.typeOnly)
    if (
      !imp.bare &&
      values.length > 0 &&
      values.every((spec) => erased.has(spec.localName))
    ) {
      dropped.add(imp.specifier)
    } else if (imp.bare || values.length > 0) {
      kept.add(imp.specifier)
    }
  }
  for (const r of reexports) {
    if (!r.typeOnly) {
      kept.add(r.specifier)
    }
  }
  return [...dropped].filter((spec) => !kept.has(spec))
}

const NO_ENV_PURITY: ReadonlyArray<never> = []

/** The recognizer's chain factories a module imports, by local name and binding (`BuilderPurity.factories`, `namespaces`). */
interface BuilderImports {
  table: RecognizerTable
  factories: Map<string, { binding: number; kind: string }>
  namespaces: Map<
    string,
    { binding: number; factories: Readonly<Record<string, string>> }
  >
}

const ENV_TYPES = ['client', 'server'] as const

/** The purity of one environment type with the recognizer's builder chains the module imports. */
function builderPurityOf(
  purity: PurityContext,
  imports: BuilderImports,
  env: 'client' | 'server',
) {
  const table = imports.table
  return {
    env,
    ctx: {
      ...purity,
      builders: {
        env,
        links: table.builderLinks!,
        envOnly: table.envOnlyKinds,
        factories: imports.factories,
        namespaces: imports.namespaces,
        terminal: table.terminal,
        locals: new Map<string, string>(),
        erased: [],
      },
    } satisfies PurityContext,
    /** Names of the `const` declarations with effects only erased code may read (`erasableNames`). */
    pending: [] as Array<Array<string>>,
  }
}

const factoryTables = new WeakMap<
  RecognizerTable,
  Map<string, Readonly<Record<string, string>>>
>()
/** The recognizer's factories by specifier (a `Map`: looked up for every import of every module read). */
function factoryTable(
  table: RecognizerTable,
): Map<string, Readonly<Record<string, string>>> {
  let map = factoryTables.get(table)
  if (!map) {
    map = new Map(Object.entries(table.factories))
    factoryTables.set(table, map)
  }
  return map
}
