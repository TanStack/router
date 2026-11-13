/**
 * The one model of what writes a module's bindings (README, "Reachability =
 * splitting = dead-code removal"): every assignment of a binding and every
 * write of a member of one, with where and when it happens. Every rule that
 * asks "does something write this?" reads it: the clustering of writers with
 * what they write, the event table's rules, the extraction
 * candidates, the router planner's identifier option values (its split
 * part), the server-fn hoist and the Hydrate setters. A view over the
 * classified references (nothing is built until a binding is asked about,
 * and then once). The model is pristine: erasure is the consumer's
 * business, passed as the `live` filter of the predicates (a write inside
 * erased code imposes nothing), and the region holding a write (planners
 * register sub-regions after the analysis) is read from the regions.
 *
 * It owns "the object a binding names", for reads and writes alike. A
 * name's value is its declaration and the statements writing it when the
 * module loads (`visitValues`), and it may hold other bindings' objects
 * (`const alias = cfg`, `const holder = { c: cfg }`, `holder.c = cfg`). A
 * read through a name (`alias.v`, `{ ...holder.c }`) reads what that value
 * holds; a member write through a name whose declaration does not create
 * its value (`ownsObject`: `alias.v = 1`, `let cur = cfg`) or through a
 * nested member (`holder.c.v = 1`) may write any object it holds
 * (`objectsWrittenBy`), so it is a write of each of those bindings too.
 * A local name (a function's, a block's) holds what its value comes from
 * (`localValue`): its initialiser and assignments, the elements a `for…of`
 * loop runs over, a thrown value for a `catch` parameter, and for a
 * parameter its default and what the calls that may reach its function
 * hand them (`handedTo`). A write through it (`function set(o) { o.v = 1 }`
 * with `set(cfg)`) is a write of what it holds, at the time it runs.
 */
import { walk } from 'yuku'
import { isExpressionWrapper, unwrapExpression } from './source'
import { createsItsValue, ownsItsValue } from './units'
import type { ClassifiedRef, RefIndex, Tier1 } from './analysis'
import type { Range } from './header'
import type { SymbolId } from './symbols'
import type { UnitId } from './units'
import type { Node, SourceFile } from 'yuku'

type WriteKind = 'assign' | 'member'

/**
 * Whether a reference writes: `assign`, the binding itself gets a value
 * (`x = …`, `x++`, a destructuring or for-in/of target, a `var` declared
 * again with a value); `member`, the
 * object it names is mutated (`x.p = …`, `delete x.p`, `x.push(…)`,
 * `Object.assign(x, …)`); null, a read.
 */
export function writeKind(ref: ClassifiedRef): WriteKind | null {
  return ref.kind === 'write'
    ? 'assign'
    : ref.kind === 'value' && ref.memberWrite === true
      ? 'member'
      : null
}

/** What the value walk reads of the module. */
type ModuleShape = Pick<
  Tier1,
  'units' | 'declaringUnits' | 'runsLaterAt' | 'unitAt' | 'symbols' | 'purity'
>

/** What a local name's value may hold (module bindings), and whether every value it gets is one its sources create (`createsItsValue`). */
interface LocalValue {
  held: ReadonlyArray<SymbolId>
  owns: boolean
}

const FUNCTIONS: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

/** Parents a value climbs through to what holds it (`MutationModel.handedTo`): it is their value, or one they hold. */
const HOLDING: ReadonlySet<string> = new Set([
  'ConditionalExpression',
  'LogicalExpression',
  'SequenceExpression',
  'AwaitExpression',
  'ArrayExpression',
  'ObjectExpression',
  'Property',
  'MethodDefinition',
  'PropertyDefinition',
  'ClassBody',
  'ClassExpression',
  'SpreadElement',
])

/** The expressions and statements a write reference writes through (`writeTargets`' constructs). */
const WRITES: ReadonlySet<string> = new Set([
  'AssignmentExpression',
  'UpdateExpression',
  'UnaryExpression',
  'CallExpression',
  'ForInStatement',
  'ForOfStatement',
  'VariableDeclarator',
])

/** The range of the expression or statement write reference `node` writes through (`x.p = v`, `x.push(v)`, `x = v`). */
export function writeConstruct(file: SourceFile, node: Node): Range {
  let n: Node | null = node
  while (n !== null && !WRITES.has(n.type)) {
    n = file.parentOf(n)
  }
  return n === null
    ? { start: node.start, end: node.end }
    : { start: n.start, end: n.end }
}

const NO_UNITS: ReadonlyArray<UnitId> = []
const NO_SYMS: ReadonlyArray<SymbolId> = []
const NO_REFS: ReadonlyArray<ClassifiedRef> = []

export class MutationModel {
  private sites: Map<SymbolId, ReadonlyArray<ClassifiedRef>> | null = null
  private owns: Map<SymbolId, boolean> | null = null
  /** Per binding, what its value may hold (`heldBy`). */
  private held: Map<SymbolId, ReadonlyArray<SymbolId>> | null = null
  /** Per local name, its value (`localValue`). */
  private locals: Map<SymbolId, LocalValue> | null = null
  /** The values the module throws (what a `catch` parameter may hold). */
  private thrown: Array<Node> | null = null
  /** Per member write through another name, the other bindings whose objects it may write; per binding, those writes (built at the first ask, once). */
  private through: {
    objects: Map<ClassifiedRef, ReadonlyArray<SymbolId>>
    writes: Map<SymbolId, Array<ClassifiedRef>>
  } | null = null

  constructor(
    private readonly refs: RefIndex,
    /** Each write reference's expression or statement (`writeConstruct`). */
    private readonly constructs: ReadonlyMap<ClassifiedRef, Range>,
    /** The module (the tier the model belongs to, complete when first asked). */
    private readonly module: () => ModuleShape,
  ) {}

  /** The write references of `sym` (`writeKind` of each), in source order. */
  sitesOf(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    this.sites ??= new Map()
    let hit = this.sites.get(sym)
    if (hit === undefined) {
      hit = this.refs.refsOf(sym).filter((r) => writeKind(r) !== null)
      this.sites.set(sym, hit)
    }
    return hit
  }

  /**
   * The binding is assigned somewhere (`live`: in code an output keeps):
   * its value is not the one its declaration gave it.
   */
  isReassigned(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    return this.sitesOf(sym).some(
      (r) => r.kind === 'write' && (live === undefined || live(r)),
    )
  }

  /**
   * The binding is assigned, or a member of what it names written through
   * this name, somewhere (`live`: in code an output keeps): a read of it
   * depends on when it runs. Writes through another name holding its object
   * (`writesThrough`, an over-approximation) are placement's: its write
   * table orders and pins readers by them, where a false answer costs a
   * pin; a planner refusing on this answer would refuse correct code.
   */
  isMutated(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    const sites = this.sitesOf(sym)
    return live === undefined ? sites.length > 0 : sites.some(live)
  }

  /**
   * Whether the object `sym` names is its own: its declarations create its
   * value (`ownsItsValue`: a function, class, enum or namespace, a literal,
   * a call's result) and nothing reassigns it. A write of one of its members writes that
   * object only (R139).
   */
  ownsObject(sym: SymbolId): boolean {
    this.owns ??= new Map()
    let hit = this.owns.get(sym)
    if (hit === undefined) {
      const { units, declaringUnits } = this.module()
      hit =
        !this.isReassigned(sym) &&
        (declaringUnits.get(sym) ?? NO_UNITS).every((d) =>
          ownsItsValue(units[d]!),
        )
      this.owns.set(sym, hit)
    }
    return hit
  }

  /**
   * Whether `sym` names an object of its own (`ownsObject`), one a
   * declaration of it creates although it is reassigned (`let o = { v: 1 }`:
   * that object, and what is assigned to it, which the walk follows), or
   * one no declaration here gives it (an import, a parameter-like binding):
   * not only another binding's alias.
   */
  private namesObject(sym: SymbolId): boolean {
    const { units, declaringUnits } = this.module()
    const declaring = declaringUnits.get(sym)
    return (
      declaring !== undefined &&
      (this.ownsObject(sym) ||
        declaring.some((u) => ownsItsValue(units[u]!)) ||
        !declaring.some((u) => units[u]!.kind === 'declaration'))
    )
  }

  /** The other bindings whose objects member write `ref` may write: what its name's value holds (none when it writes the object its name owns). */
  objectsWrittenBy(ref: ClassifiedRef): ReadonlyArray<SymbolId> {
    return this.throughWrites().objects.get(ref) ?? NO_SYMS
  }

  /** The member writes through another name that may write the object `sym` names (`objectsWrittenBy`). */
  writesThrough(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    return this.throughWrites().writes.get(sym) ?? NO_REFS
  }

  /**
   * The other bindings whose objects the value `ref`'s name holds may hold: the
   * bindings naming an object of their own (or another module's) that its
   * declarations and its writes at load name, through the names they name
   * (`visitValues`); a call's result is not its callee (`const [a, b] =
   * make()`). Per name, once: a name already walked is not followed again
   * (a chain of aliases walks each link once).
   */
  heldBy(ref: ClassifiedRef): ReadonlyArray<SymbolId> {
    const sym = ref.sym
    const { symbols } = this.module()
    if (!symbols.isModuleLevel(sym)) {
      return this.localValue(sym).held
    }
    this.held ??= new Map()
    let held = this.held.get(sym)
    if (held !== undefined) {
      return held
    }
    const { units } = this.module()
    const set = new Set<SymbolId>()
    const heldMap = this.held
    this.visitValues(
      [ref],
      true,
      (u) => this.refs.refsIn(units[u]!.range),
      (r) => {
        if (
          r.sym === sym ||
          r.kind !== 'value' ||
          r.ctx === 'callee' ||
          r.ctx === 'newCallee'
        ) {
          return false
        }
        if (!symbols.isModuleLevel(r.sym)) {
          for (const t of this.localValue(r.sym).held) {
            set.add(t)
          }
          return false
        }
        if (this.namesObject(r.sym)) {
          set.add(r.sym)
        }
        for (const t of heldMap.get(r.sym) ?? NO_SYMS) {
          set.add(t)
        }
        return false
      },
      (r) => heldMap.has(r.sym),
    )
    set.delete(sym)
    held = set.size === 0 ? NO_SYMS : [...set]
    heldMap.set(sym, held)
    return held
  }

  private throughWrites(): NonNullable<MutationModel['through']> {
    if (this.through !== null) {
      return this.through
    }
    const objects = new Map<ClassifiedRef, ReadonlyArray<SymbolId>>()
    const writes = new Map<SymbolId, Array<ClassifiedRef>>()
    this.through = { objects, writes }
    const { declaringUnits, symbols } = this.module()
    for (const ref of this.refs.all) {
      if (writeKind(ref) !== 'member') {
        continue
      }
      // (a local name: what its value comes from, `localValue`)
      if (
        symbols.isModuleLevel(ref.sym)
          ? !declaringUnits.has(ref.sym) ||
            (!ref.readsThrough && this.ownsObject(ref.sym))
          : !ref.readsThrough && this.localValue(ref.sym).owns
      ) {
        continue
      }
      const held = this.heldBy(ref)
      if (held.length === 0) {
        continue
      }
      objects.set(ref, held)
      for (const s of held) {
        let list = writes.get(s)
        if (!list) {
          list = []
          writes.set(s, list)
        }
        list.push(ref)
      }
    }
    return this.through
  }

  /**
   * The value of a local name: the module bindings the expressions it gets
   * its values from name, where they evaluate (not in a function they
   * hold), and through the names they name (`heldBy`); a call's result is
   * not its callee. Once per name (a cycle of local names holds what its
   * first name's other sources give).
   */
  private localValue(sym: SymbolId): LocalValue {
    this.locals ??= new Map()
    let value = this.locals.get(sym)
    if (value !== undefined) {
      return value
    }
    value = { held: NO_SYMS, owns: true }
    this.locals.set(sym, value)
    const { symbols, purity } = this.module()
    const file = purity.file
    const b = symbols.binding(sym)
    const sources: Array<Node> = []
    let owns = b !== null
    for (const id of b?.declarations ?? []) {
      owns = this.sourcesOf(file, id, sources) && owns
    }
    for (const site of this.sitesOf(sym)) {
      if (site.kind === 'write') {
        owns = false
        const assigned = assignedBy(file, site)
        if (assigned !== null) {
          sources.push(assigned)
        }
      }
    }
    const held = new Set<SymbolId>()
    for (const source of sources) {
      for (const r of this.refs.refsIn(source)) {
        if (r.range.end > source.end) {
          break
        }
        if (
          r.sym === sym ||
          r.kind !== 'value' ||
          !flowsInto(file, r, source)
        ) {
          continue
        }
        for (const t of this.heldBy(r)) {
          held.add(t)
        }
        if (symbols.isModuleLevel(r.sym) && this.namesObject(r.sym)) {
          held.add(r.sym)
        }
      }
    }
    held.delete(sym)
    value.held = held.size === 0 ? NO_SYMS : [...held]
    value.owns = owns
    return value
  }

  /**
   * Pushes the expressions declaration `id` of a local name gives it its
   * value from (its initialiser, its pattern's defaults, the elements a
   * `for…of` loop runs over, a thrown value for a `catch` parameter, a
   * parameter's arguments: `handedTo`); true when each creates the value
   * it gives (`createsItsValue`: a write of a member of it writes that
   * object only).
   */
  private sourcesOf(file: SourceFile, id: Node, out: Array<Node>): boolean {
    let creates = true
    let destructured = false
    let n = id
    let parent = file.parentOf(n)
    while (parent !== null) {
      if (parent.type === 'AssignmentPattern' && parent.left === n) {
        out.push(parent.right)
        creates &&= createsItsValue(parent.right)
      } else if (
        parent.type === 'ObjectPattern' ||
        parent.type === 'ArrayPattern' ||
        parent.type === 'RestElement' ||
        (parent.type === 'Property' && parent.value === n)
      ) {
        destructured = true
      } else {
        break
      }
      n = parent
      parent = file.parentOf(n)
    }
    if (parent === null) {
      return false
    }
    if (parent.type === 'VariableDeclarator' && parent.id === n) {
      const loop = file.parentOf(file.parentOf(parent) ?? parent)
      if (
        loop?.type === 'ForOfStatement' &&
        loop.left === file.parentOf(parent)
      ) {
        out.push(loop.right) // (an element of it)
        return false
      }
      if (
        loop?.type === 'ForInStatement' &&
        loop.left === file.parentOf(parent)
      ) {
        return creates // (a key)
      }
      if (parent.init !== null) {
        out.push(parent.init)
        return creates && !destructured && createsItsValue(parent.init)
      }
      return creates
    }
    if (
      (parent.type === 'FunctionDeclaration' ||
        parent.type === 'FunctionExpression' ||
        parent.type === 'ArrowFunctionExpression') &&
      (parent.params as ReadonlyArray<Node>).includes(n)
    ) {
      return this.handedTo(file, parent, out) && creates && !destructured
    }
    if (parent.type === 'TSParameterProperty' && parent.parameter === n) {
      const fn = file.parentOf(parent)
      return (
        fn !== null &&
        FUNCTIONS.has(fn.type) &&
        this.handedTo(file, fn, out) &&
        creates
      )
    }
    if (parent.type === 'CatchClause' && parent.param === n) {
      if (this.thrown === null) {
        const thrown: Array<Node> = []
        walk(file.program, {
          ThrowStatement: (t) => {
            thrown.push(t.argument)
          },
        })
        this.thrown = thrown
      }
      out.push(...this.thrown)
      return false
    }
    // (a function, a class: its own value)
    return creates
  }

  /**
   * Pushes what function `fn`'s parameters may be handed: the arguments of
   * every call that may reach it, a call whose callee names a value holding
   * it (`set(cfg)`, `api.set(cfg)`, `set.call(null, cfg)`, `new Store().apply(cfg)`,
   * the call of a function returning it), and, for a call it is handed to
   * (`[cfg].forEach(fn)`, `register(fn, cfg)`), what else that call is
   * handed: its other arguments and its receiver. A value holding it is
   * one it climbs to (`HOLDING`: a literal, a class, a member read of it,
   * a call's result), or a name an initialiser or assignment of it gives.
   * True when each argument it is handed creates its value
   * (`createsItsValue`); a call it is handed to may hand it anything.
   */
  private handedTo(file: SourceFile, fn: Node, out: Array<Node>): boolean {
    let creates = true
    const seen = new Set<Node>()
    const work: Array<Node> = [fn]
    /** The references of the name declared by identifier `id`. */
    const followName = (id: Node) => {
      if (id.type !== 'Identifier') {
        return
      }
      for (const r of file.bindingOf(id)?.references ?? []) {
        work.push(r.node)
      }
    }
    while (work.length > 0) {
      let p = work.pop()!
      if (seen.has(p)) {
        continue
      }
      seen.add(p)
      if (p.type === 'FunctionDeclaration' || p.type === 'ClassDeclaration') {
        if (p.id !== null) {
          followName(p.id)
        }
      }
      for (
        let parent = file.parentOf(p);
        parent !== null;
        p = parent, parent = file.parentOf(p)
      ) {
        if (
          isExpressionWrapper(parent) ||
          HOLDING.has(parent.type) ||
          (parent.type === 'MemberExpression' && parent.object === p)
        ) {
          continue
        }
        if (parent.type === 'ClassDeclaration') {
          work.push(parent)
        } else if (
          parent.type === 'CallExpression' ||
          parent.type === 'NewExpression'
        ) {
          if (parent.callee === p) {
            for (const a of parent.arguments) {
              out.push(a)
              creates &&= a.type !== 'SpreadElement' && createsItsValue(a)
            }
          } else {
            creates = false
            for (const a of parent.arguments) {
              if (a !== p) {
                out.push(a)
              }
            }
            const callee = unwrapExpression(parent.callee)
            if (callee.type === 'MemberExpression') {
              out.push(callee.object)
            }
          }
          // (its result may hold it: `set.bind(null, cfg)`, `new Store()`)
          continue
        } else if (parent.type === 'VariableDeclarator' && parent.init === p) {
          followName(parent.id)
        } else if (
          parent.type === 'AssignmentExpression' &&
          parent.right === p
        ) {
          let target: Node = parent.left
          while (target.type === 'MemberExpression') {
            target = target.object
          }
          followName(target)
        } else if (
          parent.type === 'ReturnStatement' ||
          (parent.type === 'ArrowFunctionExpression' && parent.body === p)
        ) {
          // (what a call of the function returning it gives)
          let g: Node | null = parent
          while (g !== null && !FUNCTIONS.has(g.type)) {
            g = file.parentOf(g)
          }
          if (g !== null) {
            work.push(g)
          }
        } else if (parent.type === 'JSXExpressionContainer') {
          creates = false
          const opening = file.parentOf(file.parentOf(parent) ?? parent)
          if (opening?.type === 'JSXOpeningElement') {
            for (const a of opening.attributes) {
              if (
                a.type === 'JSXAttribute' &&
                a.value?.type === 'JSXExpressionContainer' &&
                a.value !== parent
              ) {
                out.push(a.value)
              } else if (a.type === 'JSXSpreadAttribute') {
                out.push(a.argument)
              }
            }
          }
        }
        break
      }
    }
    return creates
  }

  /**
   * Walks the values the names of `roots` hold: for each, the text of its
   * declarations and of the writes of it when the module loads (`textOf`
   * of the unit holding each, within the write's expression: `holder.c =
   * cfg`), and, transitively, of the names those name (a member write's
   * root names what it writes, not a value). `eagerOnly`: only the
   * references that evaluate when the module loads (the value a name
   * holds; without it, the bodies a call reaching the name may run). Each
   * text is visited once, at the position of the first root (in source
   * order) reaching it; true from `visit` ends the walk (the result).
   */
  visitValues(
    roots: ReadonlyArray<ClassifiedRef>,
    eagerOnly: boolean,
    textOf: (u: UnitId) => ReadonlyArray<ClassifiedRef>,
    visit: (ref: ClassifiedRef, at: number) => boolean,
    /** A name the caller knows the value of: seen, not followed. */
    known?: ((ref: ClassifiedRef) => boolean) | null,
    /** Sees each text the walk enters, before its references, with where it runs (what else that text reads: `ReadIndex.runs`); true ends the walk. */
    entered?: (u: UnitId, at: number, within: Range | undefined) => boolean,
  ): boolean {
    const { units, declaringUnits, runsLaterAt, unitAt } = this.module()
    const ordered =
      roots.length < 2
        ? roots
        : [...roots].sort((a, b) => a.range.start - b.range.start)
    const seen = new Set<UnitId>()
    /** The names whose declarations and writes were entered (once per walk). */
    const followed = new Set<SymbolId>()
    const work: Array<ClassifiedRef> = []
    /** Visits the text of unit `u` at `at`, within `within` (a write's expression) or whole (once per walk); true ends the walk. */
    const enter = (u: UnitId, at: number, within?: Range): boolean => {
      if (seen.has(u)) {
        return false
      }
      if (within === undefined) {
        seen.add(u)
      }
      if (entered?.(u, at, within) === true) {
        return true
      }
      for (const inner of textOf(u)) {
        if (
          within !== undefined &&
          (inner.range.start < within.start || inner.range.end > within.end)
        ) {
          continue
        }
        if (eagerOnly && (!inner.eager || runsLaterAt(inner.range.start))) {
          continue
        }
        if (visit(inner, at)) {
          return true
        }
        if (!inner.memberWrite && known?.(inner) !== true) {
          work.push(inner)
        }
      }
      return false
    }
    for (const root of ordered) {
      const at = root.range.start
      work.push(root)
      while (work.length > 0) {
        const r = work.pop()!
        if (followed.has(r.sym)) {
          continue
        }
        followed.add(r.sym)
        for (const u of declaringUnits.get(r.sym) ?? NO_UNITS) {
          if (units[u]!.kind === 'declaration' && enter(u, at)) {
            return true
          }
        }
        for (const site of this.sitesOf(r.sym)) {
          if (!site.eager || runsLaterAt(site.range.start)) {
            continue
          }
          const u = unitAt(site.range)
          if (
            u !== null &&
            enter(u, at, this.constructs.get(site) ?? site.range)
          ) {
            return true
          }
        }
      }
    }
    return false
  }
}

/** The expression write reference `site` gives its local name (`x = v`, `for (x of v)`: an element of `v`), if any. */
function assignedBy(file: SourceFile, site: ClassifiedRef): Node | null {
  let n = file.nodeAt(site.range.start)
  while (n !== null && !WRITES.has(n.type)) {
    n = file.parentOf(n)
  }
  switch (n?.type) {
    case 'AssignmentExpression':
    case 'ForOfStatement':
      return n.right
    case 'VariableDeclarator':
      return n.init
    default:
      return null
  }
}

/**
 * Whether the value of reference `r` is part of what expression `source`
 * evaluates to: it climbs to `source` only through expressions handing a
 * value on (a wrapper, a conditional's branch, `??`/`||`/`&&`, a
 * sequence's last expression, `await`, an assignment's value) or holding it
 * (an array or object literal, a spread, a member read of it: what it
 * holds). Not through a call (its result is not what it is handed, R149
 * answer F), a function (it runs later) or any other operator.
 */
function flowsInto(file: SourceFile, r: ClassifiedRef, source: Node): boolean {
  let n = file.nodeAt(r.range.start)
  while (n !== null && n !== source) {
    const parent = file.parentOf(n)
    if (parent === null) {
      return false
    }
    switch (parent.type) {
      case 'ConditionalExpression':
        if (parent.test === n) {
          return false
        }
        break
      case 'SequenceExpression':
        if (parent.expressions.at(-1) !== n) {
          return false
        }
        break
      case 'MemberExpression':
        if (parent.object !== n) {
          return false
        }
        break
      case 'AssignmentExpression':
        if (parent.right !== n) {
          return false
        }
        break
      case 'Property':
        if (parent.value !== n) {
          return false
        }
        break
      case 'LogicalExpression':
      case 'AwaitExpression':
      case 'ArrayExpression':
      case 'ObjectExpression':
      case 'SpreadElement':
      case 'JSXExpressionContainer':
        break
      default:
        if (!isExpressionWrapper(parent)) {
          return false
        }
    }
    n = parent
  }
  return n !== null
}
