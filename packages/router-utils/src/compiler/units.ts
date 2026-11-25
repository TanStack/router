/**
 * Top-level items, units, regions and statement-level recipes. A unit is the
 * smallest thing placement reasons about (one import specifier, one declarator,
 * one function/class/enum/namespace, one export specifier, every other
 * statement). A region is a range planned as one thing that owns the references
 * inside it; every unit is a region and planners register sub-regions (option
 * values, Hydrate children, nested chains). The regions of a plan are its own
 * (`RegionTable`, rewrite.ts).
 */
import { BindingFlags } from 'yuku'
import { classify, hasRuntimeValue, isTypeOnlyExport } from './declarations'
import { extendOverTrailingLine, isLicenseComment } from './header'
import {
  bindingNameRange,
  namespaceName,
  nextToken,
  patternIdentifiers,
} from './source'
import type { Header, Range } from './header'
import type { Node, SourceFile } from 'yuku'
import type { SymbolId, SymbolTable } from './symbols'
import type { Frag } from './rewrite'

export type UnitId = number
export type RegionId = number

type UnitKind =
  | 'import-specifier'
  | 'import-effect'
  | 'declaration'
  | 'type'
  | 'export-specifier'
  | 'reexport'
  | 'export-default'
  | 'effect'

/**
 * How a statement whose units are not all kept renders (`statementRecipe`);
 * `reexport-list`: an `export { … } from` with type-only specifiers next to
 * value ones, rendered without them.
 */
type ItemShape =
  | 'single'
  | 'declarators'
  | 'import'
  | 'export-list'
  | 'reexport-list'

export interface TopLevelItem {
  index: number
  /** Owned range: from the previous item's end through this statement's trailing line terminator. */
  range: Range
  /** The statement node's range. */
  nodeRange: Range
  kind: string
  shape: ItemShape
  units: Array<UnitId>
  /**
   * The `export` (`export default`) keywords of an exported declaration or
   * of `export default <expression>`, from the first through the spaces
   * after the last: the only text a derived output drops from such a
   * statement (its comments stay, an annotation before or after `export`
   * included).
   */
  exportKeyword: Range | null
  /**
   * The license comments between the declarators of a list (G12): the
   * declarators recipe keeps them when it joins the kept declarators anew
   * (a derived output copying some declarators gets them too), and the env
   * module keeps them when it keeps none.
   */
  licenses: Array<Range> | null
  /** Ephemeral: the statement node (phase B only). */
  node: Node
}

export interface Unit {
  id: UnitId
  kind: UnitKind
  item: number
  /** Own node range (declarator, specifier) or the item range for statement-wide units. */
  range: Range
  region: RegionId
  declares: Array<SymbolId>
  /** For a declaration: the spaces it declares its name in (`declarations.ts`; 0: an import, or no declaration). */
  spaces: number
  /** For a declaration: it runs only to give its names a value (the removal rule applies to it). */
  definition: boolean
  /**
   * For a type unit: TypeScript-only syntax no output renders: type-only
   * export syntax (`isTypeOnlyExport`: its binding may be an inline type
   * import specifier that left with its statement's values, and a Babel
   * plugin after the compiler rejects an export of a name nothing declares),
   * and an inline `type` import specifier, which leaves with its statement's
   * value specifiers.
   */
  stripped: boolean
  /** Export names this unit provides directly (`export const a`, `export { a as b }`, `default`). */
  exported: Array<string>
  /** Import entries (Tier 0 index) for import units. */
  importIndex: number | null
  /** The ranges of the names as written, without an annotation (what a rename replaces). */
  declNameRanges: Array<Range>
  /** Ephemeral node (phase B only). */
  node: Node
}

/** `pos` past the whitespace there (not past a comment). */
function pastSpaces(code: string, pos: number): number {
  let i = pos
  while (i < code.length && /\s/.test(code[i]!)) {
    i++
  }
  return i
}

export function buildItems(
  file: SourceFile,
  header: Header,
): Array<TopLevelItem> {
  const code = file.source
  const body = file.program.body
  const items: Array<TopLevelItem> = []
  const comments = file.comments
  // items start in order: the comments before one are no item's after it
  let firstComment = 0
  let prevEnd = header.end
  for (let i = header.directiveCount; i < body.length; i++) {
    const node = body[i]!
    let start = Math.min(prevEnd, node.start)
    while (
      firstComment < comments.length &&
      comments[firstComment]!.start < start
    ) {
      firstComment++
    }
    // license comments before a statement belong to no item: they stay in
    // the env module (G12), a header one holding a JSX pragma copied into
    // derived outputs as a pragma (`freeze.ts`); those between the
    // declarators of a list are the item's (`licenses`)
    for (let j = firstComment; j < comments.length; j++) {
      const c = comments[j]!
      if (c.start < start) {
        continue
      }
      if (c.end > node.start) {
        break
      }
      if (isLicenseComment(c)) {
        start = Math.min(node.start, extendOverTrailingLine(code, c.end))
      }
    }
    const end = extendOverTrailingLine(code, node.end)
    const nodeRange = { start: node.start, end: node.end }
    let shape: ItemShape = 'single'
    let exportKeyword: Range | null = null
    let decl: Node = node
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration !== null) {
        decl = node.declaration
        exportKeyword = {
          start: node.start,
          end: pastSpaces(code, node.start + 'export'.length),
        }
      } else if (node.source === null) {
        shape = 'export-list'
      } else if (
        !isTypeOnlyExport(file, node) &&
        node.specifiers.some((spec) => isTypeOnlyExport(file, spec))
      ) {
        shape = 'reexport-list'
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      exportKeyword = {
        start: node.start,
        end: pastSpaces(
          code,
          nextToken(code, node.start + 'export'.length) + 'default'.length,
        ),
      }
      if (
        (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') &&
        d.id !== null
      ) {
        decl = d
      }
    }
    let licenses: Array<Range> | null = null
    if (
      decl.type === 'VariableDeclaration' &&
      classify(file, decl)!.kind !== 'erased'
    ) {
      shape = 'declarators'
      const list = decl.declarations
      for (
        let j = firstComment;
        j < comments.length &&
        comments[j]!.start < list[list.length - 1]!.start;
        j++
      ) {
        const c = comments[j]!
        if (c.start >= list[0]!.end && isLicenseComment(c)) {
          ;(licenses ??= []).push({ start: c.start, end: c.end })
        }
      }
    } else if (
      node.type === 'ImportDeclaration' &&
      node.specifiers.length > 0
    ) {
      shape = 'import'
    }
    items.push({
      index: items.length,
      range: { start, end },
      nodeRange,
      kind: node.type,
      shape,
      units: [],
      exportKeyword,
      licenses,
      node,
    })
    prevEnd = end
  }
  return items
}

interface UnitBuildResult {
  units: Array<Unit>
  /** Symbol → units declaring it. */
  declaringUnits: Map<SymbolId, Array<UnitId>>
}

/** The unit model. */
export function buildUnits(
  file: SourceFile,
  items: Array<TopLevelItem>,
  symbols: SymbolTable,
  importIndexOfStatement: (stmtStart: number) => number | null,
): UnitBuildResult {
  const units: Array<Unit> = []
  const declaringUnits = new Map<SymbolId, Array<UnitId>>()

  const symOf = (nameNode: Node): SymbolId | null => {
    const b = file.bindingOf(nameNode)
    return b ? symbols.ofBinding(b) : null
  }
  const add = (
    item: TopLevelItem,
    u: Omit<Unit, 'id' | 'item' | 'region'>,
  ): Unit => {
    const id = units.length
    const unit: Unit = {
      ...u,
      id,
      item: item.index,
      // (each unit is the region of its id: `RegionTable`)
      region: id,
    }
    units.push(unit)
    item.units.push(id)
    for (const s of unit.declares) {
      let list = declaringUnits.get(s)
      if (!list) {
        list = []
        declaringUnits.set(s, list)
      }
      list.push(id)
    }
    return unit
  }
  const base = (
    node: Node,
    kind: UnitKind,
    range: Range,
  ): Omit<Unit, 'id' | 'item' | 'region'> => ({
    kind,
    range,
    declares: [],
    spaces: 0,
    definition: false,
    stripped: false,
    exported: [],
    importIndex: null,
    declNameRanges: [],
    node,
  })

  for (const item of items) {
    const node = item.node
    const itemRange = item.range
    switch (node.type) {
      case 'ImportDeclaration': {
        const importIndex = importIndexOfStatement(node.start)
        if (node.specifiers.length === 0) {
          const u = base(
            node,
            node.importKind === 'type' ? 'type' : 'import-effect',
            itemRange,
          )
          u.importIndex = importIndex
          add(item, u)
          break
        }
        for (const spec of node.specifiers) {
          // (a type-only import is TypeScript's: the table says which)
          const erased =
            classify(file, spec, undefined, node)!.kind === 'erased'
          const u = base(spec, erased ? 'type' : 'import-specifier', {
            start: spec.start,
            end: spec.end,
          })
          u.stripped = erased && node.importKind !== 'type'
          const s = symOf(spec.local)
          if (s !== null) {
            u.declares.push(s)
          }
          u.importIndex = importIndex
          u.declNameRanges.push({
            start: spec.local.start,
            end: spec.local.end,
          })
          add(item, u)
        }
        break
      }
      case 'ExportAllDeclaration': {
        const u = base(
          node,
          isTypeOnlyExport(file, node) ? 'type' : 'reexport',
          itemRange,
        )
        u.stripped = u.kind === 'type'
        // (`export type * as Ns from` exports nothing at runtime)
        if (u.kind !== 'type' && node.exported) {
          u.exported.push(
            node.exported.type === 'Identifier'
              ? node.exported.name
              : node.exported.value,
          )
        }
        add(item, u)
        break
      }
      case 'ExportNamedDeclaration': {
        if (node.declaration !== null) {
          // (what it declares, a type or a value, is the table's)
          declarationUnits(item, node.declaration, true)
          break
        }
        if (isTypeOnlyExport(file, node)) {
          // `export type { X }`; `export { type X } from '…'`, as
          // `export type { X } from '…'`: export syntax no output renders
          const u = add(item, base(node, 'type', itemRange))
          u.stripped = true
          break
        }
        if (node.source !== null) {
          const u = base(node, 'reexport', itemRange)
          for (const spec of node.specifiers) {
            // (an inline `type` specifier exports nothing at runtime)
            if (!isTypeOnlyExport(file, spec)) {
              u.exported.push(moduleExportName(spec.exported))
            }
          }
          add(item, u)
          break
        }
        for (const spec of node.specifiers) {
          // `export { type X }`, or `export { X }` of a binding with no value
          // (a type-only import, an interface, a type alias): erased by TS
          const local =
            spec.local.type === 'Identifier'
              ? (file.referenceOf(spec.local)?.binding ?? null)
              : null
          if (isTypeOnlyExport(file, spec, local)) {
            const u = add(
              item,
              base(spec, 'type', { start: spec.start, end: spec.end }),
            )
            u.stripped = true
            continue
          }
          const u = base(spec, 'export-specifier', {
            start: spec.start,
            end: spec.end,
          })
          u.exported.push(moduleExportName(spec.exported))
          add(item, u)
        }
        break
      }
      case 'ExportDefaultDeclaration': {
        const d = node.declaration
        if (
          classify(file, d) !== null &&
          (d.type === 'TSDeclareFunction' || ('id' in d && d.id != null))
        ) {
          // a named declaration (a function, its overload, a class, an
          // interface) or an overload signature: what it is, a type or a
          // value, is the table's (an anonymous signature exports nothing:
          // its function's declaration does)
          for (const u of declarationUnits(item, d, false)) {
            if (u.kind === 'declaration' && u.declares.length > 0) {
              u.exported.push('default')
            }
          }
          break
        }
        if (
          isTypeOnlyExport(
            file,
            node,
            d.type === 'Identifier'
              ? (file.referenceOf(d)?.binding ?? null)
              : null,
          )
        ) {
          // `export default X` of a name with no value: as `export { X as
          // default }` of it
          const u = add(item, base(node, 'type', itemRange))
          u.stripped = true
          break
        }
        const u = base(node, 'export-default', itemRange)
        u.declares.push(symbols.declare('default', 'synthetic'))
        u.exported.push('default')
        add(item, u)
        break
      }
      case 'TSExportAssignment': {
        const u = base(node, 'effect', itemRange)
        add(item, u)
        break
      }
      case 'TSNamespaceExportDeclaration':
        add(item, base(node, 'type', itemRange))
        break
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
      case 'VariableDeclaration':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'ClassDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
      case 'TSImportEqualsDeclaration':
        declarationUnits(item, node, false)
        break
      case 'ExpressionStatement': {
        add(item, base(node, 'effect', itemRange))
        break
      }
      case 'EmptyStatement': {
        add(item, base(node, 'effect', itemRange))
        break
      }
      default: {
        const u = base(node, 'effect', itemRange)
        add(item, u)
      }
    }
  }

  function moduleExportName(n: Node): string {
    return n.type === 'Identifier'
      ? n.name
      : n.type === 'Literal'
        ? String(n.value)
        : ''
  }

  function declarationUnits(
    item: TopLevelItem,
    decl: Node,
    exported: boolean,
  ): Array<Unit> {
    const out: Array<Unit> = []
    const itemRange = item.range
    // what the declaration is, from the one table: what TypeScript erases is
    // a type unit, the rest a declaration
    const row = classify(file, decl)
    const declared = (node: Node, range: Range) => {
      const u = base(
        node,
        row!.kind === 'erased' ? 'type' : 'declaration',
        range,
      )
      u.spaces = row!.spaces
      u.definition = row!.kind === 'definition'
      return u
    }
    switch (decl.type) {
      case 'VariableDeclaration': {
        // a `declare` is one text, the values' (`declare const a, b`): one
        // unit
        const whole = row!.kind === 'erased' ? declared(decl, itemRange) : null
        for (const d of decl.declarations) {
          const u = whole ?? declared(d, { start: d.start, end: d.end })
          for (const id of patternIdentifiers(d.id)) {
            const s = symOf(id)
            if (s !== null) {
              u.declares.push(s)
              if (exported && u.kind === 'declaration') {
                u.exported.push(id.name)
              }
            }
            u.declNameRanges.push(bindingNameRange(file.source, id))
          }
          if (whole === null) {
            out.push(add(item, u))
          }
        }
        if (whole !== null) {
          out.push(add(item, whole))
        }
        break
      }
      case 'FunctionDeclaration':
      case 'TSDeclareFunction': {
        const u = declared(decl, itemRange)
        if (decl.id) {
          const s = symOf(decl.id)
          if (s !== null) {
            u.declares.push(s)
            if (exported && u.kind === 'declaration') {
              u.exported.push(decl.id.name)
            }
          }
          u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        }
        out.push(add(item, u))
        break
      }
      case 'ClassDeclaration': {
        const u = declared(decl, itemRange)
        if (decl.id) {
          const s = symOf(decl.id)
          if (s !== null) {
            u.declares.push(s)
            if (exported && u.kind === 'declaration') {
              u.exported.push(decl.id.name)
            }
          }
          u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        }
        out.push(add(item, u))
        break
      }
      case 'TSEnumDeclaration': {
        const u = declared(decl, itemRange)
        const s = symOf(decl.id)
        if (s !== null) {
          u.declares.push(s)
          if (exported && u.kind === 'declaration') {
            u.exported.push(decl.id.name)
          }
        }
        u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        out.push(add(item, u))
        break
      }
      case 'TSModuleDeclaration': {
        const id = namespaceName(decl)
        const b = id === null ? null : file.bindingOf(id)
        const u = declared(decl, itemRange)
        if (b) {
          u.declares.push(symbols.ofBinding(b))
          if (exported && u.kind === 'declaration') {
            u.exported.push(b.name)
          }
          u.declNameRanges.push({ start: id!.start, end: id!.end })
        }
        out.push(add(item, u))
        break
      }
      case 'TSImportEqualsDeclaration': {
        const u = declared(decl, itemRange)
        const s = symOf(decl.id)
        if (s !== null) {
          u.declares.push(s)
          if (exported && u.kind === 'declaration') {
            u.exported.push(decl.id.name)
          }
        }
        u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        out.push(add(item, u))
        break
      }
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        out.push(add(item, declared(decl, itemRange)))
        break
      default: {
        const u = base(decl, 'effect', itemRange)
        out.push(add(item, u))
      }
    }
    return out
  }

  // `var`s hoisted out of nested blocks (`for (var x …)`, `if (…) { var y }`)
  // are module bindings declared by the statement that holds them
  for (const b of file.rootScope.bindings) {
    const sym = symbols.ofBinding(b)
    if (
      b.has(BindingFlags.Import) ||
      symbols.kind(sym) === 'ambient' ||
      declaringUnits.has(sym) ||
      !hasRuntimeValue(b)
    ) {
      continue
    }
    for (const d of b.declarations) {
      const item = itemAt(items, d.start)
      if (!item) {
        continue
      }
      const unit =
        item.units
          .map((u) => units[u]!)
          .find((u) => u.range.start <= d.start && d.start < u.range.end) ??
        (item.units.length === 1 ? units[item.units[0]!] : undefined)
      if (!unit || unit.kind !== 'effect') {
        continue
      }
      unit.declares.push(sym)
      unit.declNameRanges.push(
        d.type === 'Identifier'
          ? bindingNameRange(file.source, d)
          : { start: d.start, end: d.end },
      )
      let list = declaringUnits.get(sym)
      if (!list) {
        list = []
        declaringUnits.set(sym, list)
      }
      if (!list.includes(unit.id)) {
        list.push(unit.id)
      }
    }
  }

  return { units, declaringUnits }
}

/** The top-level item whose range holds `offset` (items are in source order, disjoint). */
function itemAt(
  items: ReadonlyArray<TopLevelItem>,
  offset: number,
): TopLevelItem | null {
  let lo = 0
  let hi = items.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const it = items[mid]!
    if (it.range.end <= offset) {
      lo = mid + 1
    } else if (it.range.start > offset) {
      hi = mid - 1
    } else {
      return it
    }
  }
  return null
}

type StatementRecipe = 'keep' | 'drop' | Array<Frag>

/**
 * One edit per statement from the final retained set (not per-unit comma
 * ranges, which overlap). `keepExport`
 * is false in derived outputs (the `export` keyword of included exported
 * declarations is excluded).
 */
export function statementRecipe(
  item: TopLevelItem,
  units: ReadonlyArray<Unit>,
  retained: ReadonlySet<UnitId>,
  keepExport: boolean,
  code: string,
): StatementRecipe {
  const kept = item.units.filter((u) => retained.has(u))
  if (kept.length === 0) {
    // (only the env module renders a statement it keeps nothing of: the
    // license comments between its declarators stay there, G12)
    return item.licenses === null
      ? 'drop'
      : item.licenses.flatMap((l) => [
          { k: 'slice', range: { start: l.start, end: l.end } },
          { k: 'text', parts: ['\n'] },
        ])
  }
  const all = kept.length === item.units.length
  const dropExport = !keepExport && item.exportKeyword !== null
  if (all && !dropExport && item.shape !== 'reexport-list') {
    return 'keep'
  }
  const slice = (start: number, end: number): Frag => ({
    k: 'slice',
    range: { start, end },
  })
  const text = (t: string): Frag => ({ k: 'text', parts: [t] })
  if (item.shape === 'reexport-list') {
    // its one unit, kept: without its type-only specifiers (`isTypeOnlyExport`
    // says which; a re-exported specifier is type-only by its syntax alone,
    // read here as the table reads it)
    const node = item.node as Extract<Node, { type: 'ExportNamedDeclaration' }>
    const out: Array<Frag> = [
      slice(item.range.start, item.nodeRange.start),
      text('export { '),
    ]
    node.specifiers
      .filter((spec) => spec.exportKind !== 'type')
      .forEach((spec, i) => {
        if (i > 0) {
          out.push(text(', '))
        }
        out.push(slice(spec.start, spec.end))
      })
    out.push(text(' } from '))
    out.push(slice(node.source!.start, item.range.end))
    return out
  }
  /** The statement's text up to `end`, without its `export` keywords when it drops them. */
  const prefix = (end: number): Array<Frag> =>
    dropExport
      ? [
          slice(item.range.start, item.exportKeyword!.start),
          slice(item.exportKeyword!.end, end),
        ]
      : [slice(item.range.start, end)]
  if (all) {
    const unit = units[item.units[0]!]!
    if (unit.kind === 'export-default') {
      // `export default <expression>` evaluates its expression: a
      // derived output (no module's default export) runs it as a statement;
      // an anonymous class stays named `default` while it evaluates (its
      // static initialisers may read the name), as a property's value
      const value = (
        item.node as Extract<Node, { type: 'ExportDefaultDeclaration' }>
      ).declaration
      let inner: Node = value
      while (inner.type === 'ParenthesizedExpression') {
        inner = inner.expression
      }
      const named =
        (inner.type === 'ClassDeclaration' ||
          inner.type === 'ClassExpression') &&
        inner.id === null
      return [
        slice(item.range.start, item.exportKeyword!.start),
        text(named ? 'void { default: ' : 'void ('),
        slice(item.exportKeyword!.end, value.end),
        text(named ? ' }' : ')'),
        slice(value.end, item.range.end),
      ]
    }
    // export keywords excluded only
    return prefix(item.range.end)
  }
  switch (item.shape) {
    case 'declarators': {
      const lastOfAll = units[item.units[item.units.length - 1]!]!
      const out: Array<Frag> = prefix(units[item.units[0]!]!.range.start)
      kept.forEach((u, i) => {
        if (i > 0) {
          out.push(text(', '))
        }
        out.push(slice(units[u]!.range.start, units[u]!.range.end))
      })
      // (the license comments between the declarators, which the new
      // joins leave out: after the list, a line comment on its own line)
      for (const l of item.licenses ?? []) {
        if (
          !kept.some(
            (u) =>
              units[u]!.range.start <= l.start && l.end <= units[u]!.range.end,
          )
        ) {
          out.push(text(' '), slice(l.start, l.end))
          if (code.startsWith('//', l.start)) {
            out.push(text('\n'))
          }
        }
      }
      out.push(slice(lastOfAll.range.end, item.range.end))
      return out
    }
    case 'import': {
      const node = item.node as Extract<Node, { type: 'ImportDeclaration' }>
      const out: Array<Frag> = [
        slice(item.range.start, item.nodeRange.start),
        text('import '),
      ]
      let def: Unit | null = null
      let ns: Unit | null = null
      const named: Array<Unit> = []
      for (const u of kept) {
        const unit = units[u]!
        if (unit.node.type === 'ImportDefaultSpecifier') {
          def = unit
        } else if (unit.node.type === 'ImportNamespaceSpecifier') {
          ns = unit
        } else {
          named.push(unit)
        }
      }
      if (def) {
        out.push(slice(def.range.start, def.range.end))
        if (ns || named.length > 0) {
          out.push(text(', '))
        }
      }
      if (ns) {
        out.push(slice(ns.range.start, ns.range.end))
      }
      if (named.length > 0) {
        out.push(text('{ '))
        named.forEach((u, i) => {
          if (i > 0) {
            out.push(text(', '))
          }
          out.push(slice(u.range.start, u.range.end))
        })
        out.push(text(' }'))
      }
      out.push(text(' from '))
      out.push(slice(node.source.start, item.range.end))
      return out
    }
    case 'export-list': {
      // the list's own `}`: past the last specifier, a trailing comma and
      // the comments (one may hold a `}`)
      const specifiers = (
        item.node as Extract<Node, { type: 'ExportNamedDeclaration' }>
      ).specifiers
      let close = nextToken(code, specifiers[specifiers.length - 1]!.end)
      if (code[close] === ',') {
        close = nextToken(code, close + 1)
      }
      const out: Array<Frag> = [
        slice(item.range.start, item.nodeRange.start),
        text('export { '),
      ]
      kept.forEach((u, i) => {
        if (i > 0) {
          out.push(text(', '))
        }
        out.push(slice(units[u]!.range.start, units[u]!.range.end))
      })
      out.push(text(' }'))
      out.push(slice(close + 1, item.range.end))
      return out
    }
    case 'single':
      // one unit (`buildUnits`): kept at all, it is kept whole (above)
      return 'keep'
  }
}
