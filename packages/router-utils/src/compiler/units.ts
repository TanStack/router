/**
 * Top-level items, units, regions and statement-level recipes. A unit is the
 * smallest thing placement reasons about (one import specifier, one declarator,
 * one function/class/enum/namespace, one export specifier, every other
 * statement). A region is a range planned as one thing that owns the references
 * inside it; every unit is a region and planners register sub-regions (option
 * values, Hydrate children, nested chains). The regions of a plan are its own
 * (`RegionTable`, rewrite.ts).
 */
import { BindingFlags, walk } from 'yuku'
import { hasRuntimeValue } from './symbols'
import { extendOverTrailingLine, isLicenseComment } from './header'
import {
  bindingNameRange,
  isExpressionWrapper,
  namespaceName,
  patternIdentifiers,
  unwrapExpression,
} from './source'
import {
  isIdentityFreeValue,
  isPrimitiveLiteral,
  isPureClass,
  isPureDeclarator,
  isPureExpression,
  noteBuilderConsts,
  statementHasEffects,
} from './purity'
import type { PurityContext } from './purity'
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

type ItemShape = 'single' | 'declarators' | 'import' | 'export-list'

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
  /** An augmentation that does more than write what it augments (`Page.x = track()`): observable without it. */
  augmentEffects: boolean
  /** Single unexported unwritten `const` with a primitive initialiser: may be duplicated. */
  copyable: boolean
  /**
   * A declaration whose value is a function or a primitive (`isIdentityFreeValue`;
   * a function declaration, a declarator of one identifier with such an
   * initialiser): a copy of it is indistinguishable from the original
   * unless something writes it. A class, an enum, a namespace, a
   * destructuring and every other unit kind: false.
   */
  identityFree: boolean
  /** Import entries (Tier 0 index) for import units. */
  importIndex: number | null
  /** The ranges of the names as written, without an annotation (what a rename replaces). */
  declNameRanges: Array<Range>
  /** Ephemeral node (phase B only). */
  node: Node
}

/** Method names that mutate their receiver (arrays, maps, sets). */
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

/** `Object.assign`, `Object.defineProperty`, … (they mutate their first argument). */
function isObjectMutator(callee: Node): boolean {
  const c = unwrapExpression(callee)
  if (c.type !== 'MemberExpression' || c.computed) {
    return false
  }
  const obj = unwrapExpression(c.object)
  return (
    obj.type === 'Identifier' &&
    obj.name === 'Object' &&
    c.property.type === 'Identifier' &&
    /^(assign|defineProperty|defineProperties|freeze|seal|setPrototypeOf)$/.test(
      c.property.name,
    )
  )
}

/**
 * The operands `node` writes, as the source wrote them: an assignment,
 * update or `delete` operand, a for-in/of target, the elements of a
 * destructuring pattern, the receiver of a mutating method (`push`, `set`,
 * …) or the first argument of `Object.assign`-style calls. The one table
 * behind the member-write classification of references (a `const` whose
 * members nothing writes may be read by code that moves) and the top-level
 * augmentation units (`X.p = …` clusters with `X`).
 */
function writeTargets(node: Node): ReadonlyArray<Node> {
  switch (node.type) {
    case 'AssignmentExpression':
    case 'AssignmentPattern':
    case 'ForInStatement':
    case 'ForOfStatement':
      return [node.left]
    case 'UpdateExpression':
      return [node.argument]
    case 'RestElement':
      return [node.argument]
    case 'UnaryExpression':
      return node.operator === 'delete' ? [node.argument] : NO_TARGETS
    case 'ArrayPattern':
      return node.elements.filter((e) => e !== null)
    case 'ObjectPattern':
      return node.properties.map((p) => (p.type === 'Property' ? p.value : p))
    case 'CallExpression': {
      const callee = unwrapExpression(node.callee)
      if (isObjectMutator(callee)) {
        return node.arguments.length > 0 ? [node.arguments[0]!] : NO_TARGETS
      }
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        MUTATORS.has(callee.property.name)
      ) {
        // the receiver, as the callee names it (`x.push`: the root is `x`)
        return [node.callee]
      }
      return NO_TARGETS
    }
    default:
      return NO_TARGETS
  }
}

const NO_TARGETS: ReadonlyArray<Node> = []

/**
 * Whether a top-level write does nothing but write its targets: a pure
 * value, key or argument, written to a member chain of a binding
 * (`Page.displayName = 'Page'`, `Object.assign(Page, { a: 1 })`).
 */
function writesOnly(purity: PurityContext, expr: Node): boolean {
  // the binding, or a member of what it names (`Page.meta.title = …` writes
  // whatever `Page.meta` holds, which may be another binding's object)
  const pureTarget = (target: Node, depth = 0): boolean => {
    const t = unwrapExpression(target)
    return (
      t.type === 'Identifier' ||
      (depth === 0 &&
        t.type === 'MemberExpression' &&
        (!t.computed || isPureExpression(purity, t.property as Node)) &&
        pureTarget(t.object, 1))
    )
  }
  const e = unwrapExpression(expr)
  switch (e.type) {
    case 'AssignmentExpression':
      return pureTarget(e.left) && isPureExpression(purity, e.right)
    case 'CallExpression': {
      // `Object.assign(X, …)`, a link on a builder, or a mutating method of
      // a collection (`X.push(…)`); a method of that name on another object
      // is its own code: a call (R65), which also writes its receiver
      const callee = unwrapExpression(e.callee)
      const mutator =
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        MUTATORS.has(callee.property.name)
      return (
        (isObjectMutator(callee) ||
          (mutator
            ? builtinCollection(purity.file, callee.object)
            : pureTarget(e.callee))) &&
        e.arguments.every(
          (a) => a.type !== 'SpreadElement' && isPureExpression(purity, a),
        )
      )
    }
    default:
      return false
  }
}

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet'])

/**
 * Whether the methods `MUTATORS` names are the built-in ones on the object
 * `receiver` names: a `const` declared with an array literal or a `new` of
 * the global `Map`, `Set`, `WeakMap` or `WeakSet`, whose methods of those
 * names nothing replaces (`x.push = …`, `x['push'] = …`, `Object.assign(x,
 * …)`). Any other object's `push` or `set` is code of the module's own.
 */
function builtinCollection(file: SourceFile, receiver: Node): boolean {
  const id = unwrapExpression(receiver)
  if (id.type !== 'Identifier') {
    return false
  }
  const b = file.referenceOf(id)?.binding
  if (!b || !b.has(BindingFlags.Const)) {
    return false
  }
  const [name, ...more] = b.declarations
  if (name === undefined || more.length > 0) {
    return false
  }
  const declarator = file.parentOf(name)
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.id.start !== name.start ||
    declarator.init === null
  ) {
    return false
  }
  const init = unwrapExpression(declarator.init)
  if (
    init.type !== 'ArrayExpression' &&
    !(
      init.type === 'NewExpression' &&
      init.callee.type === 'Identifier' &&
      COLLECTIONS.has(init.callee.name) &&
      !file.referenceOf(init.callee)?.binding
    )
  ) {
    return false
  }
  for (const ref of b.references) {
    let n: Node = ref.node
    let parent = file.parentOf(n)
    while (parent !== null && isExpressionWrapper(parent)) {
      n = parent
      parent = file.parentOf(n)
    }
    if (parent?.type === 'CallExpression') {
      if (
        parent.arguments[0] === n &&
        isObjectMutator(unwrapExpression(parent.callee))
      ) {
        return false
      }
      continue
    }
    if (parent?.type !== 'MemberExpression' || parent.object !== n) {
      continue
    }
    const key = parent.computed
      ? parent.property.type === 'Literal'
        ? String(parent.property.value)
        : null
      : parent.property.type === 'Identifier'
        ? parent.property.name
        : null
    if (key !== null && MUTATORS.has(key) && writeTargetOf(file, parent)) {
      return false
    }
  }
  return true
}

/** Whether member expression `m` is what an assignment, update, `delete`, for-in/of or destructuring writes. */
function writeTargetOf(file: SourceFile, m: Node): boolean {
  let n = m
  let parent = file.parentOf(n)
  while (parent !== null && isExpressionWrapper(parent)) {
    n = parent
    parent = file.parentOf(n)
  }
  if (parent === null) {
    return false
  }
  const construct =
    parent.type === 'Property' && parent.value === n
      ? file.parentOf(parent)
      : parent
  // (a call of the method is no write of it)
  return (
    construct !== null &&
    construct.type !== 'CallExpression' &&
    writeTargets(construct).includes(n)
  )
}

/**
 * Whether a declaration gives its binding a value of its own: a function or
 * class, a literal, a function or class expression, a call's result. Not
 * another binding's (`const alias = E`, `import F = E`), whose members a
 * write of it would write too. A write of a member of such a binding writes
 * only what it names (R139), while nothing reassigns it
 * (`MutationModel.ownsObject`); a write through another one may write
 * whatever its value holds (`objectsWrittenBy`), as a read through a
 * binding reads it (`const holder = { cfg }` owns its object and holds
 * `cfg`'s).
 */
export function ownsItsValue(u: Unit): boolean {
  const n = u.node
  switch (n.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return true
    case 'VariableDeclarator': {
      if (n.id.type !== 'Identifier' || n.init === null) {
        return false
      }
      switch (unwrapExpression(n.init).type) {
        case 'ObjectExpression':
        case 'ArrayExpression':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
        case 'ClassExpression':
        case 'Literal':
        case 'TemplateLiteral':
        case 'CallExpression':
        case 'NewExpression':
          return true
        default:
          return false
      }
    }
    default:
      return false
  }
}

/**
 * How a reference (an identifier) uses the object it names, in one climb
 * of its parents: `'write'` when it is the root object of a member
 * expression some code writes (`writeTargets`: `x.p = …`, `x.push(…)`), or
 * the first argument of an `Object.assign`-style call (the object it names
 * is mutated); `'write-through'` when what is written is an object the
 * one it names holds (`x.c.p = …`, `x.c.push(…)`, `Object.assign(x.c, …)`:
 * it reads `x.c` first); `'through'` when it reads that object's contents
 * where it evaluates (the object of a member read `alias.v`, `all[0]`, a
 * spread's argument `{ ...alias }`, the source of a destructuring or a
 * for-in/of loop): what it reads is what that object holds, which may be
 * another binding's object (`const alias = cfg`, `const holder = { cfg }`),
 * and the mutation model follows its value (`MutationModel.visitValues`);
 * else null.
 */
export function memberUse(
  file: SourceFile,
  node: Node,
): 'write' | 'write-through' | 'through' | null {
  // climb the member chain (and wrappers) grown on `node`
  let member = false
  /** The member expressions of the chain. */
  let depth = 0
  let n = node
  let parent = file.parentOf(n)
  /** The first parent that is no wrapper, and its child. */
  let first: Node | null = null
  let firstChild = node
  for (; parent !== null; n = parent, parent = file.parentOf(n)) {
    const wrapper = isExpressionWrapper(parent)
    if (first === null && !wrapper) {
      first = parent
      firstChild = n
    }
    if (parent.type === 'MemberExpression' && parent.object === n) {
      member = true
      depth++
    } else if (!wrapper) {
      break
    }
  }
  if (parent !== null && writesAt(file, parent, n, member)) {
    // the written object: the chain's own value for an `Object.assign`-style
    // argument, else the object of its last member (`x.p = …`, `x.push`)
    const own = parent.type === 'CallExpression' && parent.callee !== n ? 0 : 1
    return depth > own ? 'write-through' : 'write'
  }
  if (first === null) {
    return null
  }
  switch (first.type) {
    case 'MemberExpression':
      return first.object === firstChild ? 'through' : null
    case 'SpreadElement':
      return 'through'
    case 'VariableDeclarator':
      return first.init === firstChild && first.id.type !== 'Identifier'
        ? 'through'
        : null
    case 'AssignmentExpression':
      return first.right === firstChild &&
        first.left.type !== 'Identifier' &&
        first.left.type !== 'MemberExpression'
        ? 'through'
        : null
    case 'ForOfStatement':
    case 'ForInStatement':
      return first.right === firstChild ? 'through' : null
    default:
      return null
  }
}

/** Whether `parent`, around the member chain `n` grown on a reference (`member`: it is one), writes that chain's object. */
function writesAt(
  file: SourceFile,
  parent: Node,
  n: Node,
  member: boolean,
): boolean {
  if (parent.type === 'CallExpression') {
    // the receiver of a mutating method, or the first argument of an
    // `Object.assign`-style call (the common argument position is neither)
    if (parent.callee !== n && parent.arguments[0] !== n) {
      return false
    }
  } else if (!member) {
    return false // a plain write of the binding, not of a member
  }
  // a destructuring property's target is written by the pattern around it
  const construct =
    parent.type === 'Property' && parent.value === n
      ? file.parentOf(parent)
      : parent
  return construct !== null && writeTargets(construct).includes(n)
}

/** The node types `unwrapExpression` looks through. */
/** The root identifier of `a.b.c` / `a?.b[c]`, or the identifier itself. */
function rootIdentifier(node: Node): Node | null {
  let n = unwrapExpression(node)
  for (;;) {
    if (n.type === 'MemberExpression') {
      n = unwrapExpression(n.object)
      continue
    }
    return n.type === 'Identifier' ? n : null
  }
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
    // license comments belong to no item: they stay in the env module and
    // never travel into a derived output (G12)
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
  return items
}

interface UnitBuildResult {
  units: Array<Unit>
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
    return b !== null && !hasRuntimeValue(b)
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
    exported: [],
    effectful: false,
    augments: [],
    augmentEffects: false,
    copyable: false,
    identityFree: false,
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
          u.effectful = node.importKind !== 'type'
          u.importIndex = importIndex
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
      case 'TSImportEqualsDeclaration':
        declarationUnits(item, node, false)
        break
      case 'ExpressionStatement': {
        const u = base(node, 'effect', itemRange)
        const linked = purity.builders?.linked.length ?? 0
        u.effectful = !isPureExpression(purity, node.expression)
        u.augments = augmentationsOf(node.expression)
        // a link on a `const` holding a builder writes it (R139)
        for (const n of purity.builders?.linked.slice(linked) ?? []) {
          const s = moduleSymOf(n)
          if (s !== null && !u.augments.includes(s)) {
            u.augments.push(s)
          }
        }
        u.augmentEffects =
          u.augments.length > 0 && !writesOnly(purity, node.expression)
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
          const ids = patternIdentifiers(d.id)
          for (const id of ids) {
            const s = symOf(id)
            if (s !== null) {
              u.declares.push(s)
              if (exported) {
                u.exported.push(id.name)
              }
            }
            u.declNameRanges.push(bindingNameRange(file.source, id))
          }
          u.effectful =
            decl.kind === 'using' || decl.kind === 'await using'
              ? true
              : !isPureDeclarator(purity, d)
          u.identityFree =
            d.id.type === 'Identifier' &&
            decl.kind !== 'using' &&
            decl.kind !== 'await using' &&
            isIdentityFreeValue(d.init)
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
          out.push(add(item, u))
        }
        if (purity.builders !== undefined) {
          noteBuilderConsts(purity, purity.builders, decl)
        }
        break
      }
      case 'FunctionDeclaration':
      case 'TSDeclareFunction': {
        const u = base(decl, decl.declare ? 'type' : 'declaration', itemRange)
        u.identityFree = u.kind === 'declaration'
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
        u.effectful = statementHasEffects(purity, decl)
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
        const id = namespaceName(decl)
        const b = id === null ? null : file.bindingOf(id)
        const runtime =
          b !== null && b.has(BindingFlags.ValueModule) && !decl.declare
        const u = base(decl, runtime ? 'declaration' : 'type', itemRange)
        if (b) {
          u.declares.push(symbols.ofBinding(b))
          if (exported && runtime) {
            u.exported.push(b.name)
          }
          u.declNameRanges.push({ start: id!.start, end: id!.end })
        }
        u.effectful = runtime && statementHasEffects(purity, decl)
        out.push(add(item, u))
        break
      }
      case 'TSImportEqualsDeclaration': {
        const u = base(
          decl,
          decl.importKind === 'type' ? 'type' : 'declaration',
          itemRange,
        )
        const s = symOf(decl.id)
        if (s !== null) {
          u.declares.push(s)
          if (exported && u.kind === 'declaration') {
            u.exported.push(decl.id.name)
          }
        }
        u.effectful =
          u.kind === 'declaration' &&
          decl.moduleReference.type === 'TSExternalModuleReference'
        u.declNameRanges.push({ start: decl.id.start, end: decl.id.end })
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

  /** The module bindings a top-level expression statement writes (`writeTargets`), through destructuring patterns. */
  function augmentationsOf(expr: Node): Array<SymbolId> {
    const out: Array<SymbolId> = []
    const visit = (target: Node) => {
      const t = unwrapExpression(target)
      switch (t.type) {
        case 'ArrayPattern':
        case 'ObjectPattern':
        case 'RestElement':
        case 'AssignmentPattern':
          for (const inner of writeTargets(t)) {
            visit(inner)
          }
          return
        default: {
          const s = moduleSymOf(t)
          if (s !== null && !out.includes(s)) {
            out.push(s)
          }
        }
      }
    }
    for (const target of writeTargets(unwrapExpression(expr))) {
      visit(target)
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
    case 'single':
      // one unit (`buildUnits`): kept at all, it is kept whole (above)
      return 'keep'
  }
}

/** Where what a unit evaluates calls something, and the functions those calls receive (`callsWhenEvaluated`). */
export interface EvaluatedCalls {
  /** The calls, `new`s and tagged templates, in source order. */
  calls: Array<Range>
  /** The functions passed to them directly, as an argument or as the callee, in source order, with the call passing each. */
  callbacks: Array<Range & { call: Range }>
}

/**
 * What evaluating `node` calls (a call, a `new`, a tagged template), and
 * the functions those calls receive directly as arguments or as callee
 * (they may run then too, with what they call in turn). Other function
 * bodies run only when called: a function declaration evaluates nothing.
 * A walk of the unit's node (phase B), asked for the evaluations placement
 * asks what they run (`ReadIndex.runs`).
 */
export function callsWhenEvaluated(node: Node): EvaluatedCalls {
  const calls: Array<Range> = []
  const callbacks: EvaluatedCalls['callbacks'] = []
  const runs = new Set<Node>()
  const passed = (n: Node, call: Range) => {
    const f = unwrapExpression(n)
    if (
      f.type === 'FunctionExpression' ||
      f.type === 'ArrowFunctionExpression'
    ) {
      runs.add(f)
      callbacks.push({ start: f.start, end: f.end, call })
    }
  }
  walk(node, {
    enter: (n, wctx) => {
      switch (n.type) {
        case 'CallExpression':
        case 'NewExpression': {
          const call = { start: n.start, end: n.end }
          calls.push(call)
          passed(n.callee, call)
          for (const a of n.arguments) {
            passed(a.type === 'SpreadElement' ? a.argument : a, call)
          }
          return
        }
        case 'TaggedTemplateExpression':
          calls.push({ start: n.start, end: n.end })
          return
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
          if (!runs.has(n)) {
            wctx.skip()
          }
      }
    },
  })
  return { calls, callbacks }
}
