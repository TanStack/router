/**
 * `ModuleAnalysis` — tiered, read-only: modules that only need their edges
 * never pay for the rest.
 *
 * Tier 0 (always): import/export tables, evaluation edges, header, markers.
 * Tier 1 (items, units, regions, symbols, classified references, JSX info,
 * name universe) on demand. Both are views over one Yuku parse that lives
 * for the compile attempt only (nothing cached may reach a Yuku object).
 */
import { BindingFlags, walk } from 'yuku'
import { analyzeHeader } from './header'
import { declaredNames, isExpressionWrapper, unwrapExpression } from './source'
import { SymbolTable, hasRuntimeValue, valueBinding } from './symbols'
import { buildItems, buildUnits } from './units'
import { isTypeOnlyExport } from './declarations'
import { MutationModel } from './mutation'
import { ownEntry } from './strings'
import type { Header, Range } from './header'
import type { SymbolId } from './symbols'
import type { TopLevelItem, Unit, UnitId } from './units'
import type { Binding, Node, Scope, SourceFile } from 'yuku'
import type { SourceText } from './output-builder'

export type { Range } from './header'

interface ImportSpecifierEntry {
  local: SymbolId
  /** 'default', '*' (a namespace import) or the imported name, which may be `'*'` too. */
  imported: string
  /** `import * as ns`: the module's namespace object (a named import may be spelled `'*'`). */
  namespace: boolean
  typeOnly: boolean
  localName: string
}

export interface ImportEntry {
  index: number
  specifier: string
  /** The specifier literal (quotes included). */
  specifierRange: Range
  attributesRange: Range | null
  bare: boolean
  /** `import type …` (the whole declaration). */
  typeOnly: boolean
  specifiers: Array<ImportSpecifierEntry>
}

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
  /**
   * The names a named re-export reads of its target (`a` of `a as b`), as an
   * import's edge names; its type-only specifiers are left out.
   */
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

type RefKind = 'value' | 'write' | 'jsxTag' | 'exportSpecifier'

/** Where a reference stands, as far as rendering a rewritten reference or a planner asks (`plain` otherwise). */
export type RefContext =
  | 'plain'
  | 'callee'
  | 'shorthandProp'
  | 'shorthandPattern'
  | 'exportSpec'
  | 'jsxOpen'
  | 'declName'

export interface ClassifiedRef {
  sym: SymbolId
  range: Range
  kind: RefKind
  ctx: RefContext
  /** `export { a }` (true) vs `export { a as b }` (false); only for exportSpec. */
  exportShorthand?: boolean
  /**
   * A read that may assign the binding: Solid's `ref={x}` on a reassignable
   * binding (Solid lowers it to "call it if it holds a function, else assign
   * it"). `value`: its declaration gives it no callback; `callback`: it does,
   * so the ref assigns only where code that assigns the binding is kept (an
   * output erasing every such write calls the callback). The owners of what
   * writes a binding (`MutationModel`, placement's write table) count it.
   */
  assigns?: 'value' | 'callback'
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

  /** Reads of `sym` outside its own declarations (value, JSX tag). */
  valueRefsOf(sym: SymbolId): Array<ClassifiedRef> {
    const decls = this.declRanges.get(sym)
    return this.refsOf(sym).filter(
      (r) =>
        (r.kind === 'value' || r.kind === 'jsxTag') &&
        !(
          decls &&
          decls.some((d) => r.range.start >= d.start && r.range.end <= d.end)
        ),
    )
  }
}

export interface Tier1 {
  items: ReadonlyArray<TopLevelItem>
  units: ReadonlyArray<Unit>
  symbols: SymbolTable
  refs: RefIndex
  /** References to names without a binding (globals, `arguments`). */
  freeRefs: ReadonlyArray<FreeRef>
  /**
   * Whether a type position names a value of the module (`typeof x`, a class
   * as a type), not an import's: only then can a type the module erases free
   * a value (`removal/closure.ts`, "a type never keeps a value"). False in a
   * module with decorators or a `React` of its own: types keep what they
   * name there, as on main.
   */
  typesNameValues: boolean
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
  parentOf: (node: Node) => Node | null
  nodeAt: (offset: number) => Node | null
  /** The unit whose range holds `range` (a unit is the outermost region of what it holds: `RegionTable`). */
  unitAt: (range: Range) => UnitId | null
  /**
   * The references inside `range` to non-module bindings declared outside it
   * (captures), in source order.
   */
  capturesOf: (range: Range) => Array<ClassifiedRef>
}

interface ModuleAnalysisOptions {
  path: string
  /** Bare import specifiers that mark a module (default: 'server-only' / 'client-only'). */
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
  /**
  /** The JSX dialect the module's framework compiles (`refAssigns`), one per session; default React's. */
  jsx?: JsxDialect
}

/** The framework whose JSX transform compiles a module's JSX. */
export type JsxDialect = 'react' | 'solid' | 'vue'

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
  private readonly jsx: JsxDialect
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
    this.jsx = opts.jsx ?? 'react'
    const markers = opts.markerSpecifiers ?? DEFAULT_MARKERS
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
    for (const record of file.imports) {
      const local = record.local
      if (local) {
        importLocals.set(record.node.start, local.id as SymbolId)
      }
    }
    const exportLocals = new Map<number, SymbolId>()
    for (const record of file.exports) {
      const local = record.local
      if (local) {
        exportLocals.set(record.node.start, local.id as SymbolId)
      }
    }
    // (what an export is, a type or a value, is the table's: it reads the
    // binding an export names)
    const bindingAt = (at: number) => {
      const local = exportLocals.get(at)
      return local === undefined ? null : file.bindings[local]!
    }
    const body = file.program.body
    for (let i = this.header.directiveCount; i < body.length; i++) {
      const stmt = body[i]!
      switch (stmt.type) {
        case 'ImportDeclaration': {
          const entry: ImportEntry = {
            index: imports.length,
            specifier: stmt.source.value,
            specifierRange: { start: stmt.source.start, end: stmt.source.end },
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
                namespace: spec.type === 'ImportNamespaceSpecifier',
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
          const typeOnly = isTypeOnlyExport(file, stmt)
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
          if (stmt.source !== null) {
            const typeOnly = isTypeOnlyExport(file, stmt)
            if (!typeOnly) {
              noteMarker(stmt.source.value)
            }
            const names: Array<string> = []
            for (const spec of stmt.specifiers) {
              const exported = moduleExportNameOf(spec.exported)
              const local = moduleExportNameOf(spec.local)
              const typeSpecifier = typeOnly || isTypeOnlyExport(file, spec)
              if (!typeSpecifier) {
                names.push(local)
              }
              exportEntries.push({
                kind: 'reExport',
                name: exported,
                specifier: stmt.source.value,
                fromName: local,
                typeOnly: typeSpecifier,
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
                typeOnly: isTypeOnlyExport(file, stmt, bindingAt(id.start)),
                range: { start: id.start, end: id.end },
              })
            }
          } else {
            const typeOnly = isTypeOnlyExport(file, stmt)
            for (const spec of stmt.specifiers) {
              const exported = moduleExportNameOf(spec.exported)
              exportEntries.push({
                kind: 'local',
                name: exported,
                local: exportLocals.get(spec.start) ?? null,
                typeOnly:
                  typeOnly ||
                  isTypeOnlyExport(file, spec, bindingAt(spec.start)),
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
              d.type === 'TSDeclareFunction' ||
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
          } else if (isTypeOnlyExport(file, stmt, bindingAt(stmt.start))) {
            // `export default interface X {}`, `export default X` of a type
            exportEntries.push({
              kind: 'local',
              name: 'default',
              local: exportLocals.get(stmt.start) ?? null,
              typeOnly: true,
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
      if (ref.inTypePosition) {
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
      if (!spec.namespace) {
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

  t1(): Tier1 {
    if (this.tier1) {
      return this.tier1
    }
    const file = this.file
    const symbols = new SymbolTable(file)
    const items = buildItems(file, this.header)
    const { units, declaringUnits } = buildUnits(file, items, symbols, (s) =>
      this.importIndexOfStatement(s),
    )

    // the type names decorator metadata reads, by offset (see
    // `metadataNames`), and whether the module has decorators
    const metadataReads = new Map<number, Scope>()
    let decorated = false
    for (const scope of file.scopes) {
      if (scope.kind === 'class' && scope.parent !== null) {
        decorated =
          metadataNames(scope.node, scope.parent, metadataReads) || decorated
      }
    }

    const refs: Array<ClassifiedRef> = []
    const freeRefs: Array<FreeRef> = []
    /** Solid `ref={x}` reads of reassignable bindings (`refAssigns`). */
    const refTargets: Array<{ ref: ClassifiedRef; binding: Binding }> = []
    const names = new Set<string>(symbols.names())
    // a type keeps what it names, as on main, in a module with decorators
    // (what their metadata reads is the emitter's) or a `React` of its own
    // (a classic JSX runtime the bundler may be set to calls it): the rule's
    // gate stays closed there
    const typesKeep =
      decorated ||
      (names.has('React') &&
        file.bindings.some(
          (b) => b.name === 'React' && !b.has(BindingFlags.Import),
        ))
    let typesNameValues = false
    for (const ref of file.references) {
      let b: Binding | null
      if (ref.inTypePosition) {
        if (!typesNameValues && !typesKeep) {
          const named = ref.binding
          typesNameValues =
            named !== null &&
            !named.has(BindingFlags.Import | BindingFlags.TypeParameter) &&
            hasRuntimeValue(named)
        }
        // (a file without decorators never reads `ref.node` of a type)
        const outer =
          metadataReads.size === 0
            ? undefined
            : metadataReads.get(ref.node.start)
        if (outer === undefined) {
          continue
        }
        // the metadata reads the name where the class is defined, by value
        b = valueBinding(outer, ref.name)
        if (b === null) {
          names.add(ref.name)
          continue
        }
      } else {
        b = ref.binding
      }
      const node = ref.node
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
      const r: ClassifiedRef = {
        sym: symbols.ofBinding(b),
        range: { start: node.start, end: node.end },
        kind: c.kind,
        ctx: c.ctx,
        exportShorthand: c.exportShorthand,
      }
      refs.push(r)
      if (
        this.jsx === 'solid' &&
        r.kind === 'value' &&
        symbols.isReassignable(r.sym) &&
        isRefAttributeValue(file, node)
      ) {
        refTargets.push({ ref: r, binding: b })
      }
    }
    refAssigns(file, refTargets)

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
          const r: ClassifiedRef = {
            sym,
            range: { start: id.start, end: id.end },
            ...classify(file, { node: id, isWrite: true }),
          }
          refs.push(r)
        }
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
          if (!b || symbols.kind(symbols.ofBinding(b)) === 'ambient') {
            return
          }
          refs.push({
            sym: symbols.ofBinding(b),
            range: { start: name.name.start, end: name.name.end },
            kind: 'value',
            ctx: 'plain',
          })
        },
      })
    }
    // a classic JSX transform calls the factories its pragmas name (`@jsx
    // h`, `@jsxFrag Fragment`, React's by default) where JSX is: a read of
    // each by value there
    const factories = jsxFactories(this.header, this.source.code)
    if (factories !== null) {
      const factory = (name: string, at: Node) => {
        const b = valueBinding(file.scopeOf(at), name)
        if (b !== null && symbols.kind(symbols.ofBinding(b)) !== 'ambient') {
          refs.push({
            sym: symbols.ofBinding(b),
            range: { start: at.start, end: at.end },
            kind: 'value',
            ctx: 'plain',
          })
        }
      }
      walk(file.program, {
        JSXOpeningElement: (n) => factory(factories.element, n.name),
        JSXOpeningFragment: (n) => {
          factory(factories.element, n)
          factory(factories.fragment, n)
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
      symbols,
      refs: refIndex,
      freeRefs,
      typesNameValues,
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
      parentOf: (node) => file.parentOf(node),
      nodeAt: (offset) => file.nodeAt(offset),
      unitAt: ({ start, end }) => {
        // the units are disjoint, in source order
        let lo = 0
        let hi = units.length - 1
        let found: Unit | null = null
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          const u = units[mid]!
          if (u.range.start <= start) {
            found = u
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        return found !== null && Math.max(end, start + 1) <= found.range.end
          ? found.id
          : null
      },
      capturesOf: (range) =>
        refIndex.refsIn(range).filter((r) => {
          if (symbols.isModuleLevel(r.sym)) {
            return false
          }
          const scope = symbols.scopeRange(r.sym)
          return !(
            scope &&
            scope.start >= range.start &&
            scope.end <= range.end
          )
        }),
    }
    this.tier1 = tier1
    return tier1
  }
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
 * Whether the value a reference reads is called by its parent (a call, a
 * tagged template), looking through the wrappers a value passes unchanged
 * (`isExpressionWrapper`): `callee`, else null.
 */
function valueUse(
  file: SourceFile,
  node: Node,
  parent: Node,
): RefContext | null {
  let child = node
  let p: Node | null = parent
  while (p !== null && isExpressionWrapper(p)) {
    child = p
    p = file.parentOf(p)
  }
  if (p === null) {
    return null
  }
  switch (p.type) {
    case 'CallExpression':
      return p.callee === child ? 'callee' : null
    case 'TaggedTemplateExpression':
      return p.tag === child ? 'callee' : null
    case 'Decorator':
      return 'callee'
    default:
      return null
  }
}

/** What metadata reads of a parameter: its decorators and type annotation. */
interface MetadataParam {
  decorators?: Array<unknown>
  typeAnnotation?: unknown
  /** `TSParameterProperty` */
  parameter?: MetadataParam
  /** `AssignmentPattern` */
  left?: MetadataParam
}

/**
 * The type names TypeScript's decorator metadata (`emitDecoratorMetadata`)
 * turns into runtime reads where the class is defined
 * (`__metadata("design:type", Model)`), by offset of the name, with the scope
 * the read resolves in: the type of a decorated property or accessor, the
 * parameter and return types of a method with a decorator on it or on a
 * parameter, the constructor's parameter types of a class with a decorator
 * on it or on a constructor parameter (an abstract member's too: SWC emits
 * it). A type reference standing alone reads its name (`Model`, `(Model)`,
 * `ns.Model` reads `ns`; `Array<Model>` reads `Array`); what else a type
 * serializes to is the emitter's (a union of a class and `never` reads the
 * class on SWC, a union of strings the `String` in scope): the module's
 * gate stays closed instead (`typesNameValues`). True: the class has a
 * decorator (on it, a member or a parameter). Whether the
 * project emits metadata is not asked: where it does not, the downstream
 * TypeScript transform erases what the name kept.
 */
function metadataNames(
  node: Node,
  outer: Scope,
  out: Map<number, Scope>,
): boolean {
  if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') {
    return false
  }
  const params = (m: { value: { params: unknown } }) =>
    m.value.params as ReadonlyArray<MetadataParam>
  const decorated = (p: MetadataParam) => (p.decorators?.length ?? 0) > 0
  const addType = (annotation: unknown) => {
    let type = (annotation as { typeAnnotation?: Node } | null)?.typeAnnotation
    while (type?.type === 'TSParenthesizedType') {
      type = type.typeAnnotation
    }
    if (type?.type !== 'TSTypeReference') {
      return
    }
    let name: Node = type.typeName
    while (name.type === 'TSQualifiedName') {
      name = name.left
    }
    if (name.type === 'Identifier') {
      out.set(name.start, outer)
    }
  }
  const addParams = (list: ReadonlyArray<MetadataParam>) => {
    for (const p of list) {
      const param = p.parameter ?? p
      addType((param.left ?? param).typeAnnotation)
    }
  }
  let emits = node.decorators.length > 0
  for (const el of node.body.body) {
    switch (el.type) {
      case 'PropertyDefinition':
      case 'AccessorProperty':
      case 'TSAbstractPropertyDefinition':
      case 'TSAbstractAccessorProperty':
        if (el.decorators.length > 0) {
          emits = true
          addType(el.typeAnnotation)
        }
        break
      case 'MethodDefinition':
      case 'TSAbstractMethodDefinition':
        if (el.kind === 'constructor') {
          if (node.decorators.length > 0 || params(el).some(decorated)) {
            emits = true
            addParams(params(el))
          }
        } else if (el.decorators.length > 0 || params(el).some(decorated)) {
          emits = true
          addParams(params(el))
          addType(el.value.returnType)
        }
        break
      default:
        break
    }
  }
  return emits
}

/**
 * A pragma's name and what it says: an identifier as JavaScript defines one
 * (Unicode included), dotted (`Preact.h`).
 */
const PRAGMA_NAMES =
  /@(jsxFrag|jsxRuntime|jsx)\s+([$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)*)/gu

/**
 * The names a classic JSX transform's calls start with (`h` of `@jsx h`,
 * `Preact` of `@jsx Preact.h`), where a JSX pragma of the header asks for
 * one; null: none does.
 */
function jsxFactories(
  header: Header,
  code: string,
): { element: string; fragment: string } | null {
  let element: string | null = null
  let fragment: string | null = null
  let classic = false
  for (const { range } of header.pragmas) {
    // (the names the comment gives, read loosely: a read of a name the
    // host's transform ignores keeps a binding, it never drops one)
    for (const m of code.slice(range.start, range.end).matchAll(PRAGMA_NAMES)) {
      if (m[1] === 'jsx') {
        element = m[2]!
      } else if (m[1] === 'jsxFrag') {
        fragment = m[2]!
      } else {
        classic ||= m[2] === 'classic'
      }
    }
  }
  if (element === null && fragment === null && !classic) {
    return null
  }
  const root = (name: string) => name.split('.')[0]!
  return {
    element: root(element ?? 'React'),
    fragment: root(fragment ?? 'React'),
  }
}

/** Whether `node` is the value of a JSX `ref` attribute (`ref={x}`, through parentheses and casts). */
function isRefAttributeValue(file: SourceFile, node: Node): boolean {
  let p = file.parentOf(node)
  while (p !== null && isExpressionWrapper(p)) {
    p = file.parentOf(p)
  }
  if (p?.type !== 'JSXExpressionContainer') {
    return false
  }
  const attr = file.parentOf(p)
  return (
    attr?.type === 'JSXAttribute' &&
    attr.name.type === 'JSXIdentifier' &&
    attr.name.name === 'ref'
  )
}

/**
 * Marks the Solid `ref={x}` reads that may assign `x` (`ClassifiedRef.assigns`):
 * `callback` when the binding's one declaration initialises it with a
 * function (Solid calls it, unless other code assigned it), else `value`.
 */
function refAssigns(
  file: SourceFile,
  targets: ReadonlyArray<{ ref: ClassifiedRef; binding: Binding }>,
): void {
  for (const { ref, binding } of targets) {
    const decl = binding.declarations[0]
    const declarator = decl ? file.parentOf(decl) : null
    const init =
      binding.declarations.length === 1 &&
      declarator?.type === 'VariableDeclarator' &&
      declarator.id === decl &&
      declarator.init !== null
        ? unwrapExpression(declarator.init).type
        : null
    ref.assigns =
      init === 'ArrowFunctionExpression' || init === 'FunctionExpression'
        ? 'callback'
        : 'value'
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
    return {
      kind: 'jsxTag',
      ctx: parent?.type === 'JSXOpeningElement' ? 'jsxOpen' : 'plain',
    }
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
      return { kind: ref.isWrite ? 'write' : 'value', ctx: 'plain' }
    }
    case 'CallExpression':
      return { kind: 'value', ctx: parent.callee === node ? 'callee' : 'plain' }
    case 'TaggedTemplateExpression':
      return { kind: 'value', ctx: parent.tag === node ? 'callee' : 'plain' }
    case 'Decorator':
      // (a decorator is called: as a member it would get a receiver)
      return { kind: 'value', ctx: 'callee' }
    case 'AssignmentExpression':
      // `n += 1`, `n ||= x` read `n` too, as `n++` does
      return { kind: parent.left === node ? 'write' : 'value', ctx: 'plain' }
    case 'UpdateExpression':
      return { kind: 'write', ctx: 'plain' }
    default:
      // (through the wrappers a value passes unchanged: `(f)()`, `f!()`, `f<T>()`)
      if (!ref.isWrite && isExpressionWrapper(parent)) {
        return { kind: 'value', ctx: valueUse(file, node, parent) ?? 'plain' }
      }
      return { kind: ref.isWrite ? 'write' : 'value', ctx: 'plain' }
  }
}
