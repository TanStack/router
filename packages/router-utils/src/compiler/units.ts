/**
 * Top-level items, units, regions and statement-level recipes (DESIGN §3.1,
 * R17). A unit is the smallest thing placement reasons about (one import
 * specifier, one declarator, one function/class/enum/namespace, one export
 * specifier, every other statement). A region is a range planned as one
 * thing that owns the references inside it; every unit is a region and
 * planners register sub-regions (option values, Hydrate children, nested
 * chains).
 */
import { BindingFlags, bindingIdentifiers } from 'yuku'
import { extendOverTrailingLine, isLicenseComment } from './header'
import {
  hasNoSideEffectsAnnotation,
  isPrimitiveLiteral,
  isPureClass,
  isPureDeclarator,
  isPureExpression,
  statementHasEffects,
} from './purity'
import type { PurityContext } from './purity'
import type { Header, Range } from './header'
import type { Node, SourceFile } from 'yuku'
import type { SymbolId, SymbolTable } from './symbols'
import type { Frag } from './rewrite'

/** Binding flags of declarations with a runtime value. */
const VALUE_BINDING_FLAGS =
  BindingFlags.FunctionScopedVariable |
  BindingFlags.BlockScopedVariable |
  BindingFlags.Function |
  BindingFlags.Class |
  BindingFlags.RegularEnum |
  BindingFlags.ConstEnum |
  BindingFlags.ValueModule |
  BindingFlags.ValueImport

export type UnitId = number
export type RegionId = number

export type UnitKind =
  | 'import-specifier'
  | 'import-effect'
  | 'declaration'
  | 'type'
  | 'export-specifier'
  | 'reexport'
  | 'export-default'
  | 'effect'

export type ItemShape = 'single' | 'declarators' | 'import' | 'export-list'

export interface TopLevelItem {
  index: number
  /** Owned range: from the previous item's end through this statement's trailing line terminator. */
  range: Range
  /** The statement node's range. */
  nodeRange: Range
  kind: string
  shape: ItemShape
  units: Array<UnitId>
  /** `export ` / `export default ` keyword range of an exported declaration, excluded in derived outputs. */
  exportKeyword: Range | null
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
  /** Export names this unit provides directly (`export const a`, `export { a as b }`, `default`). */
  exported: Array<string>
  effectful: boolean
  /** Effect units that augment/write module bindings (`X.p = …`, `X.push(…)`, `X = …`). */
  augments: Array<SymbolId>
  /** Single unexported unwritten `const` with a primitive initialiser: may be duplicated. */
  copyable: boolean
  /** Import entries (Tier 0 index) for import units. */
  importIndex: number | null
  /** For import specifiers: the imported name ('default', '*' or a name). */
  importedName: string | null
  isStyleImport: boolean
  /** The declaration name node ranges (for renames, R38). */
  declNameRanges: Array<Range>
  /** Ephemeral node (phase B only). */
  node: Node
}

export type RegionKind =
  | 'unit'
  | 'option-value'
  | 'hydrate-children'
  | 'nested-chain'
  | 'custom'

export interface Region {
  id: RegionId
  range: Range
  kind: RegionKind
  unit: UnitId | null
  parent: RegionId | null
  children: Array<RegionId>
}

export class RegionTable {
  readonly regions: Array<Region> = []
  /** Unit regions sorted by start (disjoint). */
  private readonly unitRegions: Array<Region> = []
  /** Sub-regions by `start:end:kind` (one region per range and kind). */
  private readonly subRegionByKey = new Map<string, RegionId>()

  /** Registers a unit region; units are added in source order. */
  addUnitRegion(unit: UnitId, range: Range): RegionId {
    const id = this.regions.length
    const r: Region = {
      id,
      range,
      kind: 'unit',
      unit,
      parent: null,
      children: [],
    }
    this.regions.push(r)
    this.unitRegions.push(r)
    return id
  }

  /** Registers a sub-region under the innermost region containing it. */
  register(range: Range, kind: Exclude<RegionKind, 'unit'>): RegionId {
    const key = `${range.start}:${range.end}:${kind}`
    const existing = this.subRegionByKey.get(key)
    if (existing !== undefined) {
      return existing
    }
    const parent = this.innermostAt(range.start, range.end)
    const id = this.regions.length
    const r: Region = { id, range, kind, unit: null, parent, children: [] }
    this.regions.push(r)
    this.subRegionByKey.set(key, id)
    if (parent !== null) {
      const p = this.regions[parent]!
      // existing children inside the new range are re-parented (regions may be registered inner-first)
      const kept: Array<RegionId> = []
      for (const cid of p.children) {
        const c = this.regions[cid]!
        if (c.range.start >= range.start && c.range.end <= range.end) {
          c.parent = id
          r.children.push(cid)
        } else {
          kept.push(cid)
        }
      }
      kept.push(id)
      p.children = kept.sort(
        (a, b) => this.regions[a]!.range.start - this.regions[b]!.range.start,
      )
      r.children.sort(
        (a, b) => this.regions[a]!.range.start - this.regions[b]!.range.start,
      )
    }
    return id
  }

  get(id: RegionId): Region {
    return this.regions[id]!
  }

  /** The innermost region containing `[start, end)` (end defaults to start + 1 semantics). */
  innermostAt(start: number, end: number = start): RegionId | null {
    const units = this.unitRegions
    let lo = 0
    let hi = units.length - 1
    let found: Region | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = units[mid]!
      if (r.range.start <= start) {
        found = r
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (found === null || Math.max(end, start + 1) > found.range.end) {
      return null
    }
    let cur = found
    for (;;) {
      let next: Region | null = null
      for (const cid of cur.children) {
        const c = this.regions[cid]!
        if (
          c.range.start <= start &&
          Math.max(end, start) <= c.range.end &&
          (end > start ? end <= c.range.end : start < c.range.end)
        ) {
          next = c
          break
        }
      }
      if (next === null) {
        return cur.id
      }
      cur = next
    }
  }

  /** Whether `inner` is `outer` or nested below it. */
  isWithin(inner: RegionId, outer: RegionId): boolean {
    let cur: RegionId | null = inner
    while (cur !== null) {
      if (cur === outer) {
        return true
      }
      const r: Region = this.regions[cur]!
      cur = r.parent
    }
    return false
  }

  /** The unit region at the root of a region's chain. */
  unitOf(id: RegionId): UnitId | null {
    let cur: RegionId | null = id
    while (cur !== null) {
      const r: Region = this.regions[cur]!
      if (r.unit !== null) {
        return r.unit
      }
      cur = r.parent
    }
    return null
  }
}

const STYLE_RE = /\.(css|scss|sass|less|styl|pcss)(\?|$)/
const MUTATORS = new Set([
  'push',
  'unshift',
  'splice',
  'set',
  'add',
  'delete',
  'clear',
  'pop',
  'shift',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

function unwrapTs(node: Node): Node {
  let n = node
  for (;;) {
    switch (n.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        n = n.expression
        continue
      case 'ChainExpression':
        n = n.expression
        continue
      default:
        return n
    }
  }
}

/** The root identifier of `a.b.c` / `a?.b[c]`, or the identifier itself. */
export function rootIdentifier(node: Node): Node | null {
  let n = unwrapTs(node)
  for (;;) {
    if (n.type === 'MemberExpression') {
      n = unwrapTs(n.object)
      continue
    }
    return n.type === 'Identifier' ? n : null
  }
}

export function buildItems(
  file: SourceFile,
  header: Header,
): {
  items: Array<TopLevelItem>
  tail: Range
} {
  const code = file.source
  const body = file.program.body
  const items: Array<TopLevelItem> = []
  let prevEnd = header.end
  for (let i = header.directiveCount; i < body.length; i++) {
    const node = body[i]!
    let start = Math.min(prevEnd, node.start)
    // license comments belong to no item: they stay in the env module and
    // never travel into a derived output (G12)
    for (const c of file.comments) {
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
        exportKeyword = { start: node.start, end: node.declaration.start }
      } else if (node.source === null) {
        shape = 'export-list'
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      if (
        (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') &&
        d.id !== null
      ) {
        exportKeyword = { start: node.start, end: d.start }
        decl = d
      }
    }
    if (decl.type === 'VariableDeclaration' && !decl.declare) {
      shape = 'declarators'
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
      node,
    })
    prevEnd = end
  }
  return { items, tail: { start: prevEnd, end: code.length } }
}

export interface UnitBuildResult {
  units: Array<Unit>
  regions: RegionTable
  /** Symbol → units declaring it. */
  declaringUnits: Map<SymbolId, Array<UnitId>>
}

export function buildUnits(
  file: SourceFile,
  items: Array<TopLevelItem>,
  symbols: SymbolTable,
  purity: PurityContext,
  importIndexOfStatement: (stmtStart: number) => number | null,
): UnitBuildResult {
  const units: Array<Unit> = []
  const regions = new RegionTable()
  const declaringUnits = new Map<SymbolId, Array<UnitId>>()

  const symOf = (nameNode: Node): SymbolId | null => {
    const b = file.bindingOf(nameNode)
    return b ? symbols.ofBinding(b) : null
  }
  /** Whether a local name resolves to a binding without a runtime value. */
  const isTypeOnlyBinding = (local: Node): boolean => {
    if (local.type !== 'Identifier') {
      return false
    }
    const b = file.referenceOf(local)?.binding ?? null
    return b !== null && !b.has(VALUE_BINDING_FLAGS)
  }
  const add = (
    item: TopLevelItem,
    u: Omit<Unit, 'id' | 'item' | 'region'>,
  ): Unit => {
    const id = units.length
    const region = regions.addUnitRegion(id, u.range)
    const unit: Unit = { ...u, id, item: item.index, region }
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
    exported: [],
    effectful: false,
    augments: [],
    copyable: false,
    importIndex: null,
    importedName: null,
    isStyleImport: false,
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
          u.effectful = node.importKind !== 'type'
          u.importIndex = importIndex
          u.isStyleImport = STYLE_RE.test(node.source.value)
          add(item, u)
          break
        }
        for (const spec of node.specifiers) {
          const typeOnly =
            node.importKind === 'type' ||
            (spec.type === 'ImportSpecifier' && spec.importKind === 'type')
          const u = base(spec, typeOnly ? 'type' : 'import-specifier', {
            start: spec.start,
            end: spec.end,
          })
          const s = symOf(spec.local)
          if (s !== null) {
            u.declares.push(s)
          }
          u.importIndex = importIndex
          u.importedName =
            spec.type === 'ImportDefaultSpecifier'
              ? 'default'
              : spec.type === 'ImportNamespaceSpecifier'
                ? '*'
                : spec.imported.type === 'Identifier'
                  ? spec.imported.name
                  : spec.imported.value
          u.declNameRanges.push({
            start: spec.local.start,
            end: spec.local.end,
          })
          add(item, u)
        }
        break
      }
      case 'TSImportEqualsDeclaration': {
        const u = base(
          node,
          node.importKind === 'type' ? 'type' : 'declaration',
          itemRange,
        )
        const s = symOf(node.id)
        if (s !== null) {
          u.declares.push(s)
        }
        u.effectful = node.moduleReference.type === 'TSExternalModuleReference'
        u.declNameRanges.push({ start: node.id.start, end: node.id.end })
        add(item, u)
        break
      }
      case 'ExportAllDeclaration': {
        const u = base(
          node,
          node.exportKind === 'type' ? 'type' : 'reexport',
          itemRange,
        )
        u.effectful = node.exportKind !== 'type'
        if (node.exported) {
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
        if (node.exportKind === 'type') {
          add(item, base(node, 'type', itemRange))
          break
        }
        if (node.source !== null) {
          const u = base(node, 'reexport', itemRange)
          u.effectful = true
          for (const spec of node.specifiers) {
            u.exported.push(moduleExportName(spec.exported))
          }
          add(item, u)
          break
        }
        if (node.declaration !== null) {
          declarationUnits(item, node.declaration, true)
          break
        }
        for (const spec of node.specifiers) {
          // `export { type X }`, or `export { X }` of a binding with no value
          // (a type-only import, an interface, a type alias): erased by TS
          if (spec.exportKind === 'type' || isTypeOnlyBinding(spec.local)) {
            add(item, base(spec, 'type', { start: spec.start, end: spec.end }))
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
          (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') &&
          d.id !== null
        ) {
          const units0 = declarationUnits(item, d, false)
          for (const u of units0) {
            u.exported.push('default')
          }
          break
        }
        const u = base(node, 'export-default', itemRange)
        u.declares.push(symbols.declare('default', 'synthetic'))
        u.exported.push('default')
        u.effectful =
          d.type === 'FunctionDeclaration' ||
          d.type === 'ClassDeclaration' ||
          d.type === 'TSInterfaceDeclaration'
            ? d.type === 'ClassDeclaration' && !isPureClass(purity, d)
            : !isPureExpression(purity, d)
        add(item, u)
        break
      }
      case 'TSExportAssignment': {
        const u = base(node, 'effect', itemRange)
        u.effectful = true
        add(item, u)
        break
      }
      case 'TSNamespaceExportDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        add(item, base(node, 'type', itemRange))
        break
      case 'VariableDeclaration':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'ClassDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
        declarationUnits(item, node, false)
        break
      case 'ExpressionStatement': {
        const u = base(node, 'effect', itemRange)
        u.effectful = !isPureExpression(purity, node.expression)
        u.augments = augmentationsOf(node.expression)
        add(item, u)
        break
      }
      case 'EmptyStatement': {
        add(item, base(node, 'effect', itemRange))
        break
      }
      default: {
        const u = base(node, 'effect', itemRange)
        u.effectful = true
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
    switch (decl.type) {
      case 'VariableDeclaration': {
        if (decl.declare) {
          out.push(add(item, base(decl, 'type', itemRange)))
          break
        }
        const single = decl.declarations.length === 1
        for (const d of decl.declarations) {
          const u = base(d, 'declaration', { start: d.start, end: d.end })
          const ids = bindingIdentifiers(d.id)
          for (const id of ids) {
            const s = symOf(id)
            if (s !== null) {
              u.declares.push(s)
              if (exported) {
                u.exported.push(id.name)
              }
            }
            u.declNameRanges.push({ start: id.start, end: id.end })
          }
          u.effectful =
            decl.kind === 'using' || decl.kind === 'await using'
              ? true
              : !isPureDeclarator(purity, d)
          if (
            single &&
            !exported &&
            decl.kind === 'const' &&
            d.id.type === 'Identifier' &&
            d.init !== null &&
            isPrimitiveLiteral(d.init)
          ) {
            const b = file.bindingOf(d.id)
            u.copyable = b !== null && !b.references.some((r) => r.isWrite)
          }
          if (
            d.init &&
            (d.init.type === 'ArrowFunctionExpression' ||
              d.init.type === 'FunctionExpression') &&
            hasNoSideEffectsAnnotation(purity, d.init)
          ) {
            markNoSideEffects(d.id)
          }
          out.push(add(item, u))
        }
        break
      }
      case 'FunctionDeclaration':
      case 'TSDeclareFunction': {
        const u = base(decl, decl.declare ? 'type' : 'declaration', itemRange)
        if (decl.id) {
          const s = symOf(decl.id)
          if (s !== null) {
            u.declares.push(s)
            if (exported) {
              u.exported.push(decl.id.name)
            }
          }
          u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
          if (
            hasNoSideEffectsAnnotation(purity, decl) ||
            hasNoSideEffectsAnnotation(purity, item.node)
          ) {
            markNoSideEffects(decl.id)
          }
        }
        out.push(add(item, u))
        break
      }
      case 'ClassDeclaration': {
        const u = base(decl, decl.declare ? 'type' : 'declaration', itemRange)
        if (decl.id) {
          const s = symOf(decl.id)
          if (s !== null) {
            u.declares.push(s)
            if (exported) {
              u.exported.push(decl.id.name)
            }
          }
          u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        }
        u.effectful = !decl.declare && !isPureClass(purity, decl)
        out.push(add(item, u))
        break
      }
      case 'TSEnumDeclaration': {
        const u = base(decl, decl.declare ? 'type' : 'declaration', itemRange)
        const s = symOf(decl.id)
        if (s !== null) {
          u.declares.push(s)
          if (exported) {
            u.exported.push(decl.id.name)
          }
        }
        u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        out.push(add(item, u))
        break
      }
      case 'TSModuleDeclaration': {
        const b = decl.id.type === 'Identifier' ? file.bindingOf(decl.id) : null
        const runtime =
          b !== null && b.has(BindingFlags.ValueModule) && !decl.declare
        const u = base(decl, runtime ? 'declaration' : 'type', itemRange)
        if (b) {
          u.declares.push(symbols.ofBinding(b))
          if (exported && runtime) {
            u.exported.push(b.name)
          }
          u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
        }
        u.effectful = runtime && statementHasEffects(purity, decl)
        out.push(add(item, u))
        break
      }
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        out.push(add(item, base(decl, 'type', itemRange)))
        break
      default: {
        const u = base(decl, 'effect', itemRange)
        u.effectful = true
        out.push(add(item, u))
      }
    }
    return out
  }

  function markNoSideEffects(id: Node): void {
    const b = file.bindingOf(id)
    if (b) {
      ;(purity.noSideEffectCallees as Set<number>).add(b.id)
    }
  }

  function moduleSymOf(node: Node | null): SymbolId | null {
    if (!node) {
      return null
    }
    const root = rootIdentifier(node)
    if (!root) {
      return null
    }
    const b = file.referenceOf(root)?.binding ?? null
    if (!b || b.scope !== file.rootScope) {
      return null
    }
    return symbols.ofBinding(b)
  }

  function augmentationsOf(expr: Node): Array<SymbolId> {
    const e = unwrapTs(expr)
    const out: Array<SymbolId> = []
    const push = (s: SymbolId | null) => {
      if (s !== null && !out.includes(s)) {
        out.push(s)
      }
    }
    switch (e.type) {
      case 'AssignmentExpression': {
        const left = unwrapTs(e.left)
        if (left.type === 'ArrayPattern' || left.type === 'ObjectPattern') {
          for (const id of bindingIdentifiers(left as never)) {
            push(moduleSymOf(id))
          }
        } else {
          push(moduleSymOf(left))
        }
        break
      }
      case 'UpdateExpression':
        push(moduleSymOf(e.argument))
        break
      case 'CallExpression': {
        const callee = unwrapTs(e.callee)
        if (callee.type === 'MemberExpression' && !callee.computed) {
          const prop = callee.property
          const obj = unwrapTs(callee.object)
          const propName = prop.type === 'Identifier' ? prop.name : null
          if (
            obj.type === 'Identifier' &&
            obj.name === 'Object' &&
            propName !== null &&
            /^(assign|defineProperty|defineProperties|freeze|seal|setPrototypeOf)$/.test(
              propName,
            ) &&
            e.arguments.length > 0
          ) {
            push(moduleSymOf(e.arguments[0]!))
          } else if (propName !== null && MUTATORS.has(propName)) {
            push(moduleSymOf(callee.object))
          }
        }
        break
      }
      default:
        break
    }
    return out
  }

  // `var`s hoisted out of nested blocks (`for (var x …)`, `if (…) { var y }`)
  // are module bindings declared by the statement that holds them
  for (const b of file.rootScope.bindings) {
    if (b.has(BindingFlags.Import) || b.has(BindingFlags.Ambient)) {
      continue
    }
    const sym = symbols.ofBinding(b)
    if (declaringUnits.has(sym) || !b.has(BindingFlags.ValueSpace)) {
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
      unit.declNameRanges.push({ start: d.start, end: d.end })
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

  return { units, regions, declaringUnits }
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

export type StatementRecipe = 'keep' | 'drop' | Array<Frag>

/**
 * One edit per statement from the final retained set (R17). `keepExport`
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
    return 'drop'
  }
  const all = kept.length === item.units.length
  const dropExport = !keepExport && item.exportKeyword !== null
  if (all && !dropExport) {
    return 'keep'
  }
  const slice = (start: number, end: number): Frag => ({
    k: 'slice',
    range: { start, end },
  })
  const text = (t: string): Frag => ({ k: 'text', parts: [t] })
  if (all) {
    // export keyword excluded only
    return [slice(item.exportKeyword!.end, item.range.end)]
  }
  switch (item.shape) {
    case 'declarators': {
      const first = units[kept[0]!]!
      const lastOfAll = units[item.units[item.units.length - 1]!]!
      const prefixStart = dropExport
        ? item.exportKeyword!.end
        : item.range.start
      const out: Array<Frag> = [
        slice(prefixStart, units[item.units[0]!]!.range.start),
      ]
      kept.forEach((u, i) => {
        if (i > 0) {
          out.push(text(', '))
        }
        out.push(slice(units[u]!.range.start, units[u]!.range.end))
      })
      void first
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
      const close = code.lastIndexOf('}', item.nodeRange.end)
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
    default:
      return 'keep'
  }
}
