/**
 * `ModuleAnalysis` — tiered, read-only (DESIGN §2.2, R23).
 *
 * Tier 0 (always): import/export tables, evaluation edges, header, markers,
 * own effects. Tier 1 (on demand): items, units, regions, symbols, classified
 * references, JSX info, name universe. Both are views over one Yuku parse
 * that lives for the compile attempt only (R19).
 */
import { walk } from 'yuku'
import { analyzeHeader } from './header'
import { SymbolTable } from './symbols'
import { buildItems, buildUnits } from './units'
import { statementHasEffects } from './purity'
import type { PurityContext } from './purity'
import type { Header, Range } from './header'
import type { SymbolId } from './symbols'
import type { RegionId, RegionTable, TopLevelItem, Unit, UnitId } from './units'
import type { Node, Reference, SourceFile } from 'yuku'
import type { SourceText } from './output-builder'

export type { Range } from './header'

export interface ImportSpecifierEntry {
  range: Range
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
  phase: 'source' | 'defer' | null
  specifiers: Array<ImportSpecifierEntry>
}

export type ExportEntry =
  | {
      kind: 'local'
      name: string
      local: SymbolId | null
      typeOnly: boolean
      range: Range
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

export interface ReexportEntry {
  specifier: string
  specifierRange: Range
  statementRange: Range
  kind: 'star' | 'named' | 'namespace'
  names: Array<string>
  typeOnly: boolean
}

export interface DynamicEdge {
  specifier: string
  specifierRange: Range
  callRange: Range
  form: 'dynamic' | 'require'
}

export type Marker = 'server-only' | 'client-only' | 'conflict' | null

export type RefKind =
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
}

export interface FreeRef {
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

  isSelfRef(r: ClassifiedRef): boolean {
    const decls = this.declRanges.get(r.sym)
    return (
      decls !== undefined &&
      decls.some((d) => r.range.start >= d.start && r.range.end <= d.end)
    )
  }

  writesOf(sym: SymbolId): Array<ClassifiedRef> {
    return this.refsOf(sym).filter((r) => r.kind === 'write')
  }
}

export interface JsxInfo {
  runtime: 'automatic' | 'classic' | 'unknown'
  factory: SymbolId | null
  fragment: SymbolId | null
  hasJsx: () => boolean
}

export interface Tier1 {
  items: ReadonlyArray<TopLevelItem>
  /** The range after the last item (trailing comments), kept in the env output only. */
  tail: Range
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
  /** Whether `offset` sits inside a function (lazy evaluation). */
  isLazyAt: (offset: number) => boolean
  functionOwning: (offset: number) => Node | null
  parentOf: (node: Node) => Node | null
  nodeAt: (offset: number) => Node | null
  /** The innermost region owning a reference. */
  ownerOf: (ref: ClassifiedRef) => RegionId
  /** Symbols whose scope is a function containing `range` and all of whose value refs lie inside `range`. */
  orphanedLocals: (range: Range) => Array<SymbolId>
  /** Non-module symbols read inside `range` whose declaring scope lies outside it (captures). */
  capturesOf: (range: Range) => Array<SymbolId>
}

export interface ModuleAnalysisOptions {
  path: string
  /** Bare import specifiers that mark a module (default: 'server-only' / 'client-only'). */
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
}

const DEFAULT_MARKERS: Record<string, 'server-only' | 'client-only'> = {
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
  readonly sourceType: 'module' | 'script' | 'commonjs'
  readonly hasImportOrExport: boolean
  readonly purity: PurityContext
  private tier1: Tier1 | null = null
  private readonly importByStatement = new Map<number, number>()

  constructor(
    file: SourceFile,
    source: SourceText,
    opts: ModuleAnalysisOptions,
  ) {
    this.file = file
    this.source = source
    this.path = opts.path
    this.header = analyzeHeader(file)
    this.purity = {
      file,
      comments: file.comments,
      noSideEffectCallees: new Set<number>(),
    }
    const markers = opts.markerSpecifiers ?? DEFAULT_MARKERS
    const imports: Array<ImportEntry> = []
    const exportEntries: Array<ExportEntry> = []
    const reexports: Array<ReexportEntry> = []
    let marker: Marker = null
    let ownEffects = false
    const body = file.program.body
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
            phase: stmt.phase,
            specifiers: stmt.specifiers.map((spec) => {
              const b = file.bindingOf(spec.local)
              return {
                range: { start: spec.start, end: spec.end },
                local: (b ? b.id : -1) as SymbolId,
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
              const b = file.bindingOf(id)
              exportEntries.push({
                kind: 'local',
                name: id.name,
                local: b ? (b.id as SymbolId) : null,
                typeOnly: typeOnly || isTypeDeclaration(stmt.declaration),
                range: { start: id.start, end: id.end },
              })
            }
          } else {
            for (const spec of stmt.specifiers) {
              const exported = moduleExportNameOf(spec.exported)
              const b =
                spec.local.type === 'Identifier'
                  ? (file.referenceOf(spec.local)?.binding ?? null)
                  : null
              exportEntries.push({
                kind: 'local',
                name: exported,
                local: b ? (b.id as SymbolId) : null,
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
            const b = file.bindingOf(d.id)
            exportEntries.push({
              kind: 'local',
              name: 'default',
              local: b ? (b.id as SymbolId) : null,
              typeOnly: false,
              range: { start: stmt.start, end: stmt.end },
            })
          } else if (d.type === 'Identifier') {
            const b = file.referenceOf(d)?.binding ?? null
            exportEntries.push({
              kind: 'local',
              name: 'default',
              local: b ? (b.id as SymbolId) : null,
              typeOnly: false,
              range: { start: stmt.start, end: stmt.end },
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
      if (!ownEffects && statementHasEffects(this.purity, stmt)) {
        ownEffects = true
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
        callRange: { start: node.start, end: node.end },
        form: imp.kind === 'dynamic' ? 'dynamic' : 'require',
      })
    }
    this.imports = imports
    this.exports = exportEntries
    this.reexports = reexports
    this.dynamicEdges = dynamicEdges
    this.markers = marker
    this.ownEffects = ownEffects
    this.sourceType =
      file.sourceType === 'commonjs' ? 'commonjs' : file.program.sourceType
    this.hasImportOrExport = imports.length > 0 || exportEntries.length > 0
  }

  importIndexOfStatement(stmtStart: number): number | null {
    return this.importByStatement.get(stmtStart) ?? null
  }

  get hasTier1(): boolean {
    return this.tier1 !== null
  }

  t1(): Tier1 {
    if (this.tier1) {
      return this.tier1
    }
    const file = this.file
    const symbols = new SymbolTable(file)
    const { items, tail } = buildItems(file, this.header)
    const { units, regions, declaringUnits } = buildUnits(
      file,
      items,
      symbols,
      this.purity,
      (s) => this.importIndexOfStatement(s),
    )

    // Outermost function ranges (lazy evaluation), from the scope table.
    const fnRanges: Array<Range> = []
    for (const scope of file.scopes) {
      if (scope.kind === 'function') {
        const n = scope.node
        fnRanges.push({ start: n.start, end: n.end })
      }
    }
    fnRanges.sort((a, b) => a.start - b.start || b.end - a.end)
    const outer: Array<Range> = []
    for (const r of fnRanges) {
      const last = outer[outer.length - 1]
      if (last && r.start >= last.start && r.end <= last.end) {
        continue
      }
      outer.push(r)
    }
    const isLazyAt = (offset: number): boolean => {
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
      })
    }

    // JSX runtime from leading pragmas; classic → implicit factory reads per element.
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
    const rootSym = (name: string | null): SymbolId | null => {
      if (!name) {
        return null
      }
      const root = name.split('.')[0]!
      const b = file.rootScope.find(root)
      return b ? symbols.ofBinding(b) : null
    }
    const factory =
      runtime === 'classic' ? rootSym(factoryName ?? 'React') : null
    const fragment =
      runtime === 'classic'
        ? rootSym(fragmentName ?? factoryName ?? 'React')
        : null
    let jsxSeen: boolean | null = null
    const hasJsx = (): boolean => {
      if (jsxSeen === null) {
        jsxSeen = false
        walk(file.program, {
          JSXElement: (_n, ctx) => {
            jsxSeen = true
            ctx.stop()
          },
          JSXFragment: (_n, ctx) => {
            jsxSeen = true
            ctx.stop()
          },
        })
      }
      return jsxSeen
    }
    if (runtime === 'classic' && factory !== null) {
      walk(file.program, {
        JSXElement: (n) => {
          refs.push({
            sym: factory,
            range: { start: n.start, end: n.start },
            kind: 'implicitJsxFactory',
            ctx: 'plain',
            eager: !isLazyAt(n.start),
          })
        },
        JSXFragment: (n) => {
          refs.push({
            sym: fragment ?? factory,
            range: { start: n.start, end: n.start },
            kind: 'implicitJsxFactory',
            ctx: 'plain',
            eager: !isLazyAt(n.start),
          })
        },
      })
    }
    refs.sort(
      (a, b) => a.range.start - b.range.start || a.range.end - b.range.end,
    )
    const refIndex = new RefIndex(refs, units)

    const exportNames = new Set<string>()
    for (const e of this.exports) {
      if (e.kind !== 'star') {
        exportNames.add(e.name)
      }
    }

    const tier1: Tier1 = {
      items,
      tail,
      units,
      regions,
      symbols,
      refs: refIndex,
      freeRefs,
      jsx: { runtime, factory, fragment, hasJsx },
      names,
      exportNames,
      declaringUnits,
      isLazyAt,
      functionOwning: (offset) => {
        const n = file.nodeAt(offset)
        if (!n) {
          return null
        }
        for (const a of file.ancestors(n)) {
          if (
            a.type === 'FunctionDeclaration' ||
            a.type === 'FunctionExpression' ||
            a.type === 'ArrowFunctionExpression'
          ) {
            return a
          }
        }
        return null
      },
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
      orphanedLocals: (range) => {
        const out: Array<SymbolId> = []
        const seen = new Set<SymbolId>()
        for (const r of refIndex.refsIn(range)) {
          if (seen.has(r.sym) || symbols.isModuleLevel(r.sym)) {
            continue
          }
          seen.add(r.sym)
          const scope = symbols.scopeRange(r.sym)
          if (!scope || scope.start >= range.start) {
            continue
          }
          const all = refIndex.refsOf(r.sym)
          if (
            all.every(
              (x) => x.range.start >= range.start && x.range.end <= range.end,
            )
          ) {
            out.push(r.sym)
          }
        }
        return out
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

function patternIdentifiers(
  p: Node,
): Array<Extract<Node, { type: 'Identifier' }>> {
  switch (p.type) {
    case 'Identifier':
      return [p]
    case 'ArrayPattern':
      return p.elements.flatMap((e) => (e ? patternIdentifiers(e) : []))
    case 'ObjectPattern':
      return p.properties.flatMap((prop) =>
        prop.type === 'RestElement'
          ? patternIdentifiers(prop.argument)
          : patternIdentifiers(prop.value),
      )
    case 'AssignmentPattern':
      return patternIdentifiers(p.left)
    case 'RestElement':
      return patternIdentifiers(p.argument)
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
