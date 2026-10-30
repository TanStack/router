/**
 * `ModuleAnalysis` — tiered, read-only: modules that only need their edges
 * never pay for the rest.
 *
 * Tier 0 (always): import/export tables, evaluation edges, header, markers,
 * own effects. Tier 1 (on demand): items, units, regions, symbols, classified
 * references, JSX info, name universe. Both are views over one Yuku parse
 * that lives for the compile attempt only (nothing cached may reach a Yuku
 * object).
 */
import { BindingFlags, walk } from 'yuku'
import { analyzeHeader } from './header'
import { patternIdentifiers } from './source'
import { SymbolTable, valueBinding } from './symbols'
import { buildItems, buildUnits, writesMember } from './units'
import { MutationModel } from './mutation'
import { seedNoSideEffectDeclarations, statementHasEffects } from './purity'
import type { PurityContext } from './purity'
import type { Header, Range } from './header'
import type { SymbolId } from './symbols'
import type { RegionId, RegionTable, TopLevelItem, Unit, UnitId } from './units'
import type { Node, Reference, SourceFile } from 'yuku'
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
  | 'importLocal'
  | 'jsxOpen'
  | 'jsxClose'
  | 'jsxTag'
  | 'assignTarget'
  | 'updateTarget'
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
  /** The pure exports of known packages (`RecognizerTable.pureCalls`): their imports are pure callees. */
  pureCalls?: RecognizerTable['pureCalls']
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
  readonly ownEffects: boolean
  /** Whether the module's own statements have effects, module loading aside (bare imports and re-exports are followed by consumers). */
  readonly codeEffects: boolean
  readonly sourceType: 'module' | 'script' | 'commonjs'
  readonly hasImportOrExport: boolean
  readonly purity: PurityContext
  private tier1: Tier1 | null = null
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
    const pureCalls = opts.pureCalls
    const markers = opts.markerSpecifiers ?? DEFAULT_MARKERS
    const imports: Array<ImportEntry> = []
    const exportEntries: Array<ExportEntry> = []
    const reexports: Array<ReexportEntry> = []
    let marker: Marker = null
    let ownEffects = false
    let codeEffects = false
    // the bindings import specifiers declare and exports name, from Yuku's
    // module records by node position: a node lookup (`bindingOf`) would
    // build the file's node index, which a Tier-0-only module never needs
    const declarations = new Map<number, Node>()
    this.declarations = declarations
    const importLocals = new Map<number, SymbolId>()
    for (const record of file.imports) {
      const local = record.local
      if (local) {
        importLocals.set(record.node.start, local.id as SymbolId)
        if (record.kind === 'namespace' && !record.typeOnly) {
          ;(namespaceImports ??= new Set()).add(local.id)
        }
        // an import of a known package's pure export: before any
        // statement is classified (a call may precede its hoisted import)
        const pure = pureCalls?.[record.specifier]
        if (pure && !record.typeOnly) {
          if (record.kind === 'namespace') {
            pureNamespaces.set(local.id, pure)
          } else if (
            record.kind === 'named' &&
            record.name !== null &&
            pure.has(record.name)
          ) {
            noSideEffectCallees.add(local.id)
          }
        }
      }
    }
    this.purity = {
      file,
      comments: file.comments,
      noSideEffectCallees,
      pureNamespaces,
      namespaceImports: namespaceImports ?? NO_NAMESPACES,
    }
    const exportLocals = new Map<number, SymbolId>()
    for (const record of file.exports) {
      const local = record.local
      if (local) {
        exportLocals.set(record.node.start, local.id as SymbolId)
      }
    }
    const body = file.program.body
    seedNoSideEffectDeclarations(this.purity, noSideEffectCallees, body)
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
          if (entry.bare && !entry.typeOnly) {
            const m = markers[entry.specifier]
            if (m) {
              marker = marker === null || marker === m ? m : 'conflict'
            }
          }
          break
        }
        case 'ExportAllDeclaration': {
          const typeOnly = stmt.exportKind === 'type'
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
      // module loading counts as an own effect, not as an effect of its own
      // code; a marker import declares the module's environment and loads
      // nothing
      const loads = loadsModule(stmt)
      const isMarkerImport =
        stmt.type === 'ImportDeclaration' &&
        markers[stmt.source.value] !== undefined
      if (
        !isMarkerImport &&
        (loads ? !ownEffects : !codeEffects) &&
        statementHasEffects(this.purity, stmt)
      ) {
        ownEffects = true
        codeEffects ||= !loads
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
    this.ownEffects = ownEffects
    this.codeEffects = codeEffects
    this.sourceType =
      file.sourceType === 'commonjs' ? 'commonjs' : file.program.sourceType
    this.hasImportOrExport = imports.length > 0 || exportEntries.length > 0
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
   * factory), one walk that stops once it saw both.
   */
  implicitJsxReads(): ReadonlySet<SymbolId> {
    if (this.implicitReads !== null) {
      return this.implicitReads
    }
    const reads = new Set<SymbolId>()
    const { factory, fragment } = this.jsx()
    if (factory !== null) {
      // (the walk's callbacks set them)
      const seen = { element: false, fragment: false }
      walk(this.file.program, {
        JSXElement: (_n, w) => {
          seen.element = true
          if (seen.fragment) {
            w.stop()
          }
        },
        JSXFragment: (_n, w) => {
          seen.fragment = true
          if (seen.element) {
            w.stop()
          }
        },
      })
      if (seen.element) {
        reads.add(factory)
      }
      if (seen.fragment) {
        reads.add(fragment ?? factory)
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
    const code = file.source
    const fnRanges: Array<Range> = []
    const lazyRanges: Array<Range> = []
    for (const scope of file.scopes) {
      if (scope.kind !== 'function') {
        continue
      }
      const n = scope.node
      const r = { start: n.start, end: n.end }
      fnRanges.push(r)
      if (!isImmediatelyInvoked(file, code, n)) {
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
 * Whether a function node is called where it is written: the callee of a
 * call (`(() => …)()`, `(function () { … })()`, `(async () => …)()`), also
 * through `.call`/`.apply`. Its body evaluates with the surrounding code
 * (the part of an async one after its first `await` later, but nothing can
 * be known about that: eager is the safe classification). The text around
 * the function decides without a parent lookup wherever it can: a callee
 * is followed by `(`, or is the whole content of parentheses followed by
 * `(` / `.call(` / `.apply(`, and those parentheses group (they follow a
 * punctuator, an operator or a keyword) rather than pass arguments (they
 * follow a name). Only a comment, or a `)`, `]` or `}` before the opening
 * parenthesis, asks the parents.
 */
function isImmediatelyInvoked(
  file: SourceFile,
  code: string,
  fn: Node,
): boolean {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression'
  ) {
    return false // a declaration or a method is never the callee of a call
  }
  const after = skipSpace(code, fn.end)
  const ch = code.charCodeAt(after)
  if (ch === 40 /* ( */) {
    return true
  }
  if (ch !== 41 /* ) */) {
    return ch === 47 /* a comment */ ? isCalleeByParents(file, fn) : false
  }
  // `( fn )`: the parentheses must hold the function alone and be called
  const open = skipSpaceBack(code, fn.start)
  if (code.charCodeAt(open) !== 40) {
    return false // an argument among others, an operand, …
  }
  const call = skipSpace(code, after + 1)
  const cc = code.charCodeAt(call)
  const called =
    cc === 40 ||
    (cc === 46 /* . */ &&
      /^\.\s*(?:call|apply)\s*\(/.test(code.slice(call, call + 24)))
  if (!called) {
    return cc === 47 ? isCalleeByParents(file, fn) : false
  }
  // grouping parentheses, or a call's argument list?
  const before = skipSpaceBack(code, open)
  if (before < 0) {
    return true
  }
  const bc = code.charCodeAt(before)
  if (bc === 41 || bc === 93 || bc === 125 || bc === 47) {
    return isCalleeByParents(file, fn) // `)` `]` `}` or a comment: ambiguous
  }
  if (isIdentifierChar(bc)) {
    let w = before
    while (w > 0 && isIdentifierChar(code.charCodeAt(w - 1))) {
      w--
    }
    return GROUPING_KEYWORDS.has(code.slice(w, before + 1))
  }
  return true // an operator or punctuator: the parentheses group
}

/** Keywords after which `(` opens a grouping, not an argument list. */
const GROUPING_KEYWORDS = new Set([
  'return',
  'await',
  'yield',
  'typeof',
  'void',
  'delete',
  'throw',
  'case',
  'in',
  'of',
  'instanceof',
  'else',
  'do',
  'new',
  'default',
  'export',
  'extends',
])

function isIdentifierChar(c: number): boolean {
  return (
    (c >= 97 && c <= 122) ||
    (c >= 65 && c <= 90) ||
    (c >= 48 && c <= 57) ||
    c === 95 ||
    c === 36 ||
    c > 127
  )
}

/** The offset of the first non-whitespace character at or after `i` (`code.length` when none). */
function skipSpace(code: string, i: number): number {
  while (i < code.length) {
    const c = code.charCodeAt(i)
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) {
      break
    }
    i++
  }
  return i
}

/** The offset of the last non-whitespace character before `i` (-1 when none). */
function skipSpaceBack(code: string, i: number): number {
  i--
  while (i >= 0) {
    const c = code.charCodeAt(i)
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) {
      break
    }
    i--
  }
  return i
}

/** The exact answer, from the parents: the function is the callee of a call, through wrappers and `.call`/`.apply`. */
function isCalleeByParents(file: SourceFile, fn: Node): boolean {
  let n: Node = fn
  let parent = file.parentOf(n)
  while (parent !== null && WRAPPER_TYPES.has(parent.type)) {
    n = parent
    parent = file.parentOf(n)
  }
  if (parent === null) {
    return false
  }
  if (
    parent.type === 'MemberExpression' &&
    parent.object === n &&
    !parent.computed &&
    parent.property.type === 'Identifier' &&
    (parent.property.name === 'call' || parent.property.name === 'apply')
  ) {
    n = parent
    parent = file.parentOf(n)
    while (parent !== null && WRAPPER_TYPES.has(parent.type)) {
      n = parent
      parent = file.parentOf(n)
    }
  }
  return (
    parent !== null && parent.type === 'CallExpression' && parent.callee === n
  )
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
    case 'TSModuleDeclaration':
      return decl.id.type === 'Identifier' ? [decl.id] : []
    default:
      return []
  }
}

function isTypeDeclaration(decl: Node): boolean {
  return (
    decl.type === 'TSTypeAliasDeclaration' ||
    decl.type === 'TSInterfaceDeclaration' ||
    (decl.type === 'TSModuleDeclaration' && decl.declare) ||
    ((decl.type === 'VariableDeclaration' ||
      decl.type === 'ClassDeclaration' ||
      decl.type === 'FunctionDeclaration') &&
      decl.declare === true) ||
    decl.type === 'TSDeclareFunction'
  )
}

function classify(
  file: SourceFile,
  ref: Reference,
): { kind: RefKind; ctx: RefContext; exportShorthand?: boolean } {
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
    case 'CallExpression':
      return { kind: 'value', ctx: parent.callee === node ? 'callee' : 'plain' }
    case 'TaggedTemplateExpression':
      return { kind: 'value', ctx: parent.tag === node ? 'callee' : 'plain' }
    case 'AssignmentExpression':
      return parent.left === node
        ? { kind: 'write', ctx: 'assignTarget' }
        : { kind: 'value', ctx: 'plain' }
    case 'UpdateExpression':
      return { kind: 'write', ctx: 'updateTarget' }
    default:
      return {
        kind: ref.isWrite ? 'write' : 'value',
        ctx: ref.isWrite ? 'assignTarget' : 'plain',
      }
  }
}
