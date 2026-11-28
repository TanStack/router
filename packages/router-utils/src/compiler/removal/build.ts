/**
 * Build: the definitions below the units, each in its grammar slot.
 *
 * A definition is syntax whose only purpose is to give bindings a value: a
 * declarator, an element of a destructuring pattern, a function, class,
 * `enum`, `namespace` or `import =` declaration. Placement's units are the
 * definitions of the top level; the ones here sit below them (a function's
 * locals, a namespace's members, the leaves of a top-level pattern, a `var`
 * hoisted out of a top-level statement).
 *
 * The slot is decided here, when the definition is built, and nowhere else:
 * what the table does not know is not built, so its binding is never a
 * candidate and what it reads stays.
 */
import { BindingFlags } from 'yuku'
import { namespaceName, patternIdentifiers, unwrapExpression } from '../source'
import { VALUE, classify, isDefinition } from '../declarations'
import type { Node, SourceFile } from 'yuku'
import type { ClusterGraph, ClusterId } from '../clusters'
import type { PlacementInput } from '../placement'
import type { SymbolId } from '../symbols'

export type DefKind =
  | 'statement'
  | 'declarator'
  | 'parameter'
  | 'property'
  | 'key'
  | 'element'
  | 'rest'

/**
 * How a definition's text leaves while what holds it stays:
 * - `list`: a statement of a statement list, with its line;
 * - `init`: a `for` initialiser (`for (; c; )`);
 * - `body`: a statement another statement requires: `;` stays;
 * - `item`: an item of a comma list (a declarator among several, an object
 *   pattern's property or rest element), with one separator;
 * - `hole`: an array pattern's element: the iterator is stepped as before;
 * - `tied`: not by itself (the only declarator: with its statement; an array
 *   pattern's rest element, which exhausts the iterator; a computed key);
 * - `fixed`: never (a parameter, a `catch` binding, a `for…in/of` head).
 * What cannot leave is contracted in place (`render.ts`).
 */
export type Slot = 'list' | 'init' | 'body' | 'item' | 'hole' | 'tied' | 'fixed'

export interface Def {
  id: number
  kind: DefKind
  slot: Slot
  node: Node
  /** The text it owns the references of (what leaves with it). */
  start: number
  end: number
  parent: Def | null
  children: Array<Def>
  /** The definition of another binding whose text holds its tree (`index`). */
  outer: Def | null
  /** The binding it gives a value (a leaf). */
  sym: SymbolId | null
  /** What stands at its binding position: a name or a pattern, with its default (`AssignmentPattern`). */
  target: Node | null
  /** The pattern it destructures its value into. */
  pattern: Node | null
  /** The default of its target (`a = d`, `{ x } = d`). */
  dflt: Node | null
  /** The bindings under it. */
  names: number
  /** The candidate bindings under it (`count`). */
  cand: number
  /** Not a plain name: it holds code of its own (a default, a computed key, a pattern, a declarator). */
  code: boolean
  /** A top-level declarator placement removes with its cluster, or its statement: it stays where its cluster does. */
  unit: boolean
}

const isFunction = (n: Node | null): boolean =>
  n !== null &&
  (n.type === 'FunctionDeclaration' ||
    n.type === 'FunctionExpression' ||
    n.type === 'ArrowFunctionExpression' ||
    n.type === 'TSDeclareFunction' ||
    n.type === 'TSEmptyBodyFunctionExpression')

/** Whether a binding is defined below the units (the definitions above are placement's). */
export function definedBelow(
  input: PlacementInput,
  graph: ClusterGraph,
  /** Whether placement removes a cluster nothing reads (else its declarators are definitions below). */
  removable: (c: ClusterId) => boolean,
  sym: SymbolId,
): boolean {
  const { symbols, units, declaringUnits } = input.t1
  if (symbols.kind(sym) !== 'source') {
    return false
  }
  // (an import specifier is a unit; an `import x = a.b` of a namespace
  // body is a definition like any other)
  if (!symbols.isModuleLevel(sym)) {
    return true
  }
  const us = declaringUnits.get(sym)
  if (us === undefined) {
    return false
  }
  // a `var` hoisted out of a statement; a leaf of a top-level pattern; a
  // declarator of a cluster placement never removes; a `var` a nested
  // statement declares again (that declaration is a definition here)
  return us.every((u) => {
    const unit = units[u]!
    if (unit.exported.length > 0) {
      return false
    }
    if (unit.kind === 'effect') {
      return true
    }
    if (
      unit.kind !== 'declaration' ||
      unit.node.type !== 'VariableDeclarator'
    ) {
      return false
    }
    if (
      unit.node.id.type !== 'Identifier' ||
      !removable(graph.clusterOfRegion.get(unit.region)!)
    ) {
      return true
    }
    const b = symbols.binding(sym)
    return (
      b !== null &&
      b.has(BindingFlags.FunctionScopedVariable) &&
      b.declarations.length > 1
    )
  })
}

export class Definitions {
  readonly all: Array<Def> = []
  readonly ofSym = new Map<SymbolId, Array<Def>>()
  /** The unit declarators of each cluster. */
  readonly unitsOf = new Map<ClusterId, Array<Def>>()
  /** The definition of a binding's declaration, by the declared name's offset. */
  private readonly leafAt = new Map<number, Def>()
  private readonly constructs = new Map<number, Def | null>()
  private readonly defined = new Map<SymbolId, boolean>()
  private readonly selfReads = new Map<number, boolean>()
  private readonly file: SourceFile
  private sorted: Array<Def> = []
  /** Per sorted definition: the one around it (-1: none). */
  private around: Array<number> = []

  constructor(
    private readonly input: PlacementInput,
    private readonly graph: ClusterGraph,
    /** Whether placement removes a cluster nothing reads (else its declarators are definitions here). */
    private readonly removable: (c: ClusterId) => boolean,
  ) {
    this.file = input.file
  }

  clusterAt(n: { start: number; end: number }): ClusterId | undefined {
    const r = this.input.rewrites.regions.innermostAt(n.start, n.end)
    return r === null ? undefined : this.graph.clusterOfRegion.get(r)
  }

  private mk(kind: DefKind, node: Node, parent: Def | null, slot: Slot): Def {
    const d: Def = {
      id: this.all.length,
      kind,
      slot,
      node,
      start: node.start,
      end: node.end,
      parent,
      children: [],
      outer: null,
      sym: null,
      target: null,
      pattern: null,
      dflt: null,
      names: 0,
      cand: 0,
      code: kind === 'key' || kind === 'declarator' || kind === 'statement',
      unit: false,
    }
    parent?.children.push(d)
    this.all.push(d)
    return d
  }

  private bind(d: Def, id: Node): void {
    const b = this.file.bindingOf(id)
    d.sym = b ? this.input.t1.symbols.ofBinding(b) : null
    this.leafAt.set(id.start, d)
    if (d.sym !== null) {
      let list = this.ofSym.get(d.sym)
      if (!list) {
        this.ofSym.set(d.sym, (list = []))
      }
      list.push(d)
    }
  }

  /**
   * The slot of a statement, or null where the grammar needs it or something
   * else observes it (`for (var x of …)`, an `export`).
   */
  private statementSlot(statement: Node): 'list' | 'init' | 'body' | null {
    const parent = this.file.parentOf(statement)
    switch (parent?.type) {
      case 'BlockStatement':
      case 'Program':
      case 'SwitchCase':
      case 'StaticBlock':
      case 'TSModuleBlock':
        return 'list'
      case 'ForStatement':
        return parent.init === statement ? 'init' : 'body'
      case 'IfStatement':
      case 'LabeledStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        return 'body'
      case 'ForInStatement':
      case 'ForOfStatement':
        return parent.body === statement ? 'body' : null
      default:
        return null
    }
  }

  private pattern(pat: Node, holder: Def): void {
    holder.pattern = pat
    holder.code = true
    if (pat.type === 'ObjectPattern') {
      for (const prop of pat.properties as ReadonlyArray<Node>) {
        if (prop.type === 'RestElement') {
          // (it copies every other property: an operation of its own)
          const e = this.mk('rest', prop, holder, 'item')
          e.code = true
          this.target(prop.argument, e)
        } else if (prop.type === 'Property') {
          const e = this.mk('property', prop, holder, 'item')
          if (prop.computed) {
            this.mk('key', prop.key, e, 'tied')
            e.code = true
          }
          this.target(prop.value, e)
        }
      }
    } else if (pat.type === 'ArrayPattern') {
      for (const el of pat.elements as ReadonlyArray<Node | null>) {
        if (el === null) {
          continue
        }
        if (el.type === 'RestElement') {
          // (it exhausts the iterator: an operation of its own)
          const e = this.mk('rest', el, holder, 'tied')
          e.code = true
          this.target(el.argument, e)
        } else {
          this.target(el, this.mk('element', el, holder, 'hole'))
        }
      }
    }
  }

  /** What a pattern position binds: a name or a pattern, with its default. */
  private target(t: Node, d: Def): void {
    d.target = t
    let inner = t
    if (t.type === 'AssignmentPattern') {
      d.dflt = t.right
      d.code = true
      inner = t.left
    }
    if (inner.type === 'Identifier') {
      this.bind(d, inner)
    } else {
      // (a target the table does not know holds code: it stays as written)
      d.code = true
      this.pattern(inner, d)
    }
  }

  /** The definitions of a variable declaration (null: none, something observes it). */
  private construct(s: Node): Def | null {
    const hit = this.constructs.get(s.start)
    if (hit !== undefined) {
      return hit
    }
    let made: Def | null = null
    const parent = this.file.parentOf(s)
    // (an exported declaration's bindings are read by name from outside: an
    // importer, a namespace's users)
    if (
      s.type === 'VariableDeclaration' &&
      isDefinition(this.file, s) &&
      parent?.type !== 'ExportNamedDeclaration'
    ) {
      const top = parent?.type === 'Program'
      const slot = this.statementSlot(s)
      made = this.mk('statement', s, null, slot ?? 'fixed')
      // a top-level declarator is placement's, unless its cluster is one
      // placement never removes (a `var` a nested statement declares too)
      const placed = (d: Node) => top && this.removable(this.clusterAt(d)!)
      const anyPlaced = s.declarations.some(placed)
      made.unit = anyPlaced
      const multi = s.declarations.length > 1
      for (const d of s.declarations as ReadonlyArray<Node>) {
        if (d.type !== 'VariableDeclarator') {
          continue
        }
        const unit = placed(d)
        const dd = this.mk(
          'declarator',
          d,
          made,
          // (beside a unit, a declarator placement does not remove is
          // rendered as a unit too: it does not leave by an edit)
          anyPlaced && !unit ? 'fixed' : multi ? 'item' : 'tied',
        )
        dd.unit = unit
        if (unit) {
          const c = this.clusterAt(d)!
          let list = this.unitsOf.get(c)
          if (!list) {
            this.unitsOf.set(c, (list = []))
          }
          list.push(dd)
        }
        dd.target = d.id
        if (d.id.type === 'Identifier') {
          this.bind(dd, d.id)
        } else {
          this.pattern(d.id, dd)
        }
      }
    }
    this.constructs.set(s.start, made)
    return made
  }

  /**
   * The definitions of a parameter (a function's, a `catch` clause's): the
   * leaves of its pattern, or the name of one that has a default (the
   * default is what can leave; a name without one defines nothing here).
   */
  private parameter(param: Node): Def | null {
    const hit = this.constructs.get(param.start)
    if (hit !== undefined) {
      return hit
    }
    let made: Def | null = null
    // (a rest parameter's pattern, `...[a = f()]`, is a pattern like any)
    const pat =
      param.type === 'AssignmentPattern'
        ? param.left
        : param.type === 'RestElement'
          ? param.argument
          : param
    if (pat.type === 'ObjectPattern' || pat.type === 'ArrayPattern') {
      made = this.mk('parameter', param, null, 'fixed')
      made.target = param
      if (param.type === 'AssignmentPattern') {
        made.dflt = param.right
      }
      this.pattern(pat, made)
    } else if (
      param.type === 'AssignmentPattern' &&
      pat.type === 'Identifier'
    ) {
      made = this.mk('parameter', param, null, 'fixed')
      made.target = param
      made.dflt = param.right
      made.code = true
      this.bind(made, pat)
    }
    this.constructs.set(param.start, made)
    return made
  }

  /**
   * Whether evaluating a declarator, a parameter or a class declaration
   * reads a binding it declares before that binding has its value (`const x
   * = x`, `const { v = v } = o`, `class X extends X {}`, `class X { [X]() {}
   * }`): the read throws, so the declaration is a statement with an effect,
   * not a definition.
   *
   * A read is before the value when it stands in the initialiser, in the
   * pattern up to the end of the binding's own element, or in the default of
   * a pattern around the binding (`{ a: { x } = x }`); a class declaration
   * reads itself in its heritage, its computed keys and its decorators. Only
   * a direct read counts: one inside a function, a class field's value or a
   * static block is not followed, even where a call, a getter, a tag or the
   * class's evaluation runs it on the spot (a stated limit, KNOWN-BUGS).
   */
  readsItself(node: Node): boolean {
    let hit = this.selfReads.get(node.start)
    if (hit === undefined) {
      hit = this.findSelfRead(node)
      this.selfReads.set(node.start, hit)
    }
    return hit
  }

  private findSelfRead(node: Node): boolean {
    const { t1 } = this.input
    const file = this.file
    /** Per binding: the offset its own element ends at, and the defaults of the patterns around it (evaluated before it has a value). */
    const bindings: Array<[SymbolId, number, Array<Node> | null]> = []
    let init: Node | null = null
    if (node.type === 'ClassDeclaration') {
      const b = node.id === null ? null : file.bindingOf(node.id)
      if (b === null) {
        return false
      }
      bindings.push([t1.symbols.ofBinding(b), node.end, null])
    } else {
      let pattern: Node
      if (node.type === 'VariableDeclarator') {
        const statement = file.parentOf(node)
        // (a `var` read before its declarator runs is `undefined`)
        if (
          statement?.type !== 'VariableDeclaration' ||
          statement.kind === 'var'
        ) {
          return false
        }
        pattern = node.id
        init = node.init
        // (a function is not run by declaring it)
        if (
          pattern.type === 'Identifier' &&
          (init === null || isFunction(unwrapExpression(init)))
        ) {
          return false
        }
      } else if (node.type === 'AssignmentPattern') {
        pattern = node.left
        init = node.right
      } else {
        pattern = node
      }
      for (const id of patternIdentifiers(pattern)) {
        const b = file.bindingOf(id)
        if (b === null) {
          continue
        }
        // its element: the name with its default, key and rest marker
        let element: Node = id
        for (
          let q = file.parentOf(element);
          q !== null &&
          q !== pattern &&
          q !== node &&
          (q.type === 'AssignmentPattern' ||
            q.type === 'Property' ||
            q.type === 'RestElement');
          q = file.parentOf(element)
        ) {
          element = q
        }
        let around: Array<Node> | null = null
        let inner: Node = element
        for (
          let q: Node | null = file.parentOf(inner);
          q !== null && q !== node && inner !== pattern;
          q = file.parentOf(q)
        ) {
          if (q.type === 'AssignmentPattern' && q.left === inner) {
            ;(around ??= []).push(q.right)
          }
          inner = q
        }
        bindings.push([
          t1.symbols.ofBinding(b),
          pattern.type === 'Identifier' ? node.end : element.end,
          around,
        ])
      }
    }
    for (const [sym, valued, around] of bindings) {
      for (const ref of t1.refs.refsOf(sym)) {
        const at = ref.range.start
        if (at < node.start || at >= node.end) {
          continue
        }
        const early =
          at < valued ||
          (init !== null && at >= init.start && at < init.end) ||
          (around !== null && around.some((d) => at >= d.start && at < d.end))
        if (early && this.direct(at, node)) {
          return true
        }
      }
    }
    return false
  }

  /** Whether no function, class field value or static block of `root` stands around `at`. */
  private direct(at: number, root: Node): boolean {
    const file = this.file
    let from: Node | null = null
    for (let n = file.nodeAt(at); n !== null; from = n, n = file.parentOf(n)) {
      if (n === root) {
        return true
      }
      if (
        isFunction(n) ||
        n.type === 'StaticBlock' ||
        ((n.type === 'PropertyDefinition' || n.type === 'AccessorProperty') &&
          n.value === from)
      ) {
        return false
      }
    }
    return false
  }

  /** Builds a binding's definitions. False: some declaration of it is no definition (it is never a candidate). */
  define(sym: SymbolId): boolean {
    let ok = this.defined.get(sym)
    if (ok === undefined) {
      ok = this.build(sym)
      this.defined.set(sym, ok)
    }
    return ok
  }

  private build(sym: SymbolId): boolean {
    const file = this.file
    const b = this.input.t1.symbols.binding(sym)
    if (
      b === null ||
      b.has(BindingFlags.EnumMember | BindingFlags.TypeParameter)
    ) {
      return false
    }
    let ok = true
    for (const id of b.declarations) {
      const p = file.parentOf(id)
      if (p === null) {
        ok = false
        continue
      }
      // (a type alias, an interface or a namespace of types that shares the
      // name: TypeScript's)
      const row = classify(file, p, b)
      if (row !== null && row.spaces !== 0 && (row.spaces & VALUE) === 0) {
        continue
      }
      if (
        ((p.type === 'FunctionDeclaration' ||
          p.type === 'TSDeclareFunction' ||
          p.type === 'ClassDeclaration' ||
          p.type === 'TSEnumDeclaration' ||
          p.type === 'TSImportEqualsDeclaration') &&
          p.id === id) ||
        (p.type === 'TSModuleDeclaration' && namespaceName(p) === id)
      ) {
        if (this.leafAt.has(id.start)) {
          continue
        }
        const slot = this.statementSlot(p)
        if (
          row!.kind !== 'definition' ||
          slot === null ||
          // (a unit: placement's)
          file.parentOf(p)?.type === 'Program' ||
          (p.type === 'ClassDeclaration' && this.readsItself(p))
        ) {
          ok = false
          continue
        }
        this.bind(this.mk('statement', p, null, slot), id)
        continue
      }
      // a name of a pattern: up to what holds the pattern
      let n: Node = id
      let q: Node | null = p
      while (
        q !== null &&
        ((q.type === 'AssignmentPattern' && q.left === n) ||
          (q.type === 'Property' && q.value === n) ||
          (q.type === 'RestElement' && q.argument === n) ||
          q.type === 'ArrayPattern' ||
          q.type === 'ObjectPattern')
      ) {
        n = q
        q = file.parentOf(q)
      }
      if (q?.type === 'VariableDeclarator' && q.id === n) {
        const s = file.parentOf(q)
        if (s === null || this.construct(s) === null) {
          ok = false
          continue
        }
        if (this.readsItself(q)) {
          ok = false
        }
      } else if ((isFunction(q) || q?.type === 'CatchClause') && n !== id) {
        // (a parameter property, `constructor(private db = f())`, is not a
        // function's own parameter node: the class reads it, it stays)
        if (this.parameter(n) === null) {
          ok = false
          continue
        }
        // a name the body declares again (`var x`, `function x() {}`): where
        // a parameter has a default the body's is a binding of its own,
        // which starts with the parameter's value. No reference says so:
        // the parameter is read
        const body =
          q !== null &&
          (q.type === 'FunctionDeclaration' ||
            q.type === 'FunctionExpression' ||
            q.type === 'ArrowFunctionExpression')
            ? q.body
            : null
        if (
          body !== null &&
          body.type === 'BlockStatement' &&
          file.scopeOf(body).lookup(b.name, 'value') !== b
        ) {
          ok = false
        }
        if (this.readsItself(n)) {
          ok = false
        }
      } else {
        ok = false
        continue
      }
      if (!this.leafAt.has(id.start)) {
        ok = false
      }
    }
    return ok && (this.ofSym.get(sym)?.length ?? 0) > 0
  }

  /** The node of a definition's tree that leaves when every binding of the tree does: its declarator, statement or parameter. */
  rootOf(d: Def): Def {
    let x = d
    while (x.parent !== null && x.kind !== 'declarator') {
      x = x.parent
    }
    return x
  }

  /**
   * Once every definition is built: the candidate bindings under each, and
   * the innermost definition holding a position (`ownerAt`).
   */
  index(candidates: (sym: SymbolId) => boolean): void {
    const count = (d: Def): void => {
      d.names = d.sym !== null ? 1 : 0
      d.cand = d.sym !== null && candidates(d.sym) ? 1 : 0
      for (const c of d.children) {
        count(c)
        d.names += c.names
        d.cand += c.cand
        d.code ||= c.code
      }
    }
    for (const d of this.all) {
      if (d.parent === null) {
        count(d)
      }
    }
    const sorted = [...this.all].sort(
      (x, y) => x.start - y.start || y.end - x.end || x.id - y.id,
    )
    const around: Array<number> = []
    const stack: Array<number> = []
    sorted.forEach((d, i) => {
      while (
        stack.length > 0 &&
        sorted[stack[stack.length - 1]!]!.end <= d.start
      ) {
        stack.pop()
      }
      // (a declarator on exactly its statement's range nests in it: the
      // statement was made first)
      around.push(stack.length > 0 ? stack[stack.length - 1]! : -1)
      stack.push(i)
    })
    this.sorted = sorted
    this.around = around
    sorted.forEach((d, i) => {
      if (d.parent !== null) {
        return
      }
      // (the definition around a tree's top is of another tree)
      const a = around[i]!
      d.outer = a === -1 ? null : sorted[a]!
    })
  }

  /** The innermost definition whose text holds `at`. */
  ownerAt(at: number): Def | null {
    const sorted = this.sorted
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]!.start <= at) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo - 1; i !== -1; i = this.around[i]!) {
      if (sorted[i]!.end > at) {
        return sorted[i]!
      }
    }
    return null
  }
}
