/**
 * Code moved across a function boundary: what moved code takes from the code
 * around it without a name (`this`, `super`, `new.target`, `arguments`,
 * `await`, `yield`, a private name), and when its parts run. One walk on the
 * language's table of who provides what; what a planner does about a use,
 * and what it must prove about timing, stays the planner's.
 *
 * | Construct                                     | `this` `super` `new.target` `arguments` | `await` `yield` | private names |
 * | --------------------------------------------- | --------------------------------------- | --------------- | ------------- |
 * | `function` (every method, accessor, constructor) | yes                                   | yes             |               |
 * | arrow function                                |                                         | yes             |               |
 * | static block                                  | yes                                     | yes             |               |
 * | a field's or accessor's initialiser           | yes                                     | yes             |               |
 * | class body, for the names its members declare |                                         |                 | yes           |
 *
 * A class's `extends`, a member's computed key and decorators, and a
 * parameter's decorators (TypeScript's `experimentalDecorators`, which run
 * when the class is defined) have the code around the class; the key and the
 * decorators see the class body's private names. Types are not walked: a
 * `TS*` node is skipped unless it holds code that runs.
 */
import { CHILD_KEYS } from 'yuku'
import { unwrapExpression } from './source'
import type { Node } from 'yuku'
import type { Range } from './header'
import type { Tier1 } from './analysis'

export type ContextKind =
  | 'this'
  | 'super'
  | 'new.target'
  | 'arguments'
  | 'await'
  | 'yield'
  | 'private-name'

/** A use of a context no construct of the moved code provides, at the node that holds it (a private name: its `PrivateIdentifier`). */
export interface ContextUse {
  kind: ContextKind
  node: Node
}

/**
 * When a node of the moved code is evaluated, relative to the moved code:
 * - `now`: with it (outside every callable; or in a non-generator function
 *   that is the callee of the call or `new` holding it: an async one runs
 *   with it up to its first `await`; or in the parameters of a generator
 *   called so, whose body waits for `.next()`);
 * - `maybe`: in an instance field's initialiser, when the class is
 *   constructed, which may be while it is defined;
 * - `later`: in any other function, when it is called.
 */
export type Runs = 'now' | 'maybe' | 'later'

export interface MovedWalk {
  /** Every use, in the walk's order. */
  uses: Array<ContextUse>
  /**
   * The outermost functions and instance-field initialisers of the moved
   * code, by text (a function called in place included): code inside one
   * may run at another time than the code around it.
   */
  callables: Array<Range>
}

export interface MovedWalkOptions {
  /** Regions another owner validates: not walked. */
  skip?: ReadonlyArray<Range>
  /** Each use, as met. */
  onUse?: (use: ContextUse) => void
  /** Each node walked, before its children. */
  onNode?: (node: Node, runs: Runs) => void
}

const FN = 1 // this, super, new.target, arguments
const ASYNC = 2 // await, yield

/** What a construct carries with it when it moves: its inside keeps its meaning. */
function carries(node: Node): number {
  switch (node.type) {
    case 'FunctionExpression':
    case 'FunctionDeclaration':
    case 'StaticBlock':
      return FN | ASYNC
    case 'ArrowFunctionExpression':
      return ASYNC
    default:
      return 0
  }
}

/** Whether `child` is the initialiser of the field `parent`: it runs as a method of its own, which stays behind in a move. */
function isFieldValue(parent: Node, child: Node): boolean {
  return (
    (parent.type === 'PropertyDefinition' ||
      parent.type === 'AccessorProperty') &&
    parent.value === child
  )
}

/** TypeScript nodes holding code that runs; every other `TS*` node is a type. */
const TS_RUNTIME = new Set<string>([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSEnumDeclaration',
  'TSEnumBody',
  'TSEnumMember',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSParameterProperty',
])

function privateNamesOf(
  body: Extract<Node, { type: 'ClassBody' }>,
): Set<string> {
  const names = new Set<string>()
  for (const m of body.body) {
    if ('key' in m && m.key.type === 'PrivateIdentifier') {
      names.add(m.key.name)
    }
  }
  return names
}

interface State {
  /** What the constructs around the node provide (`FN`, `ASYNC`). */
  have: number
  /** The private names the class bodies around the node declare. */
  privates: ReadonlySet<string> | null
  runs: Runs
  inCallable: boolean
}

const START: State = { have: 0, privates: null, runs: 'now', inCallable: false }

/** One walk of the moved code `roots`, in source order (pre-order). */
export function walkMoved(
  t1: Tier1,
  roots: ReadonlyArray<Node>,
  opts: MovedWalkOptions = {},
): MovedWalk {
  const { skip = [], onUse, onNode } = opts
  const uses: Array<ContextUse> = []
  const callables: Array<Range> = []
  const use = (kind: ContextKind, node: Node) => {
    const u = { kind, node }
    uses.push(u)
    onUse?.(u)
  }
  let freeArguments: Set<number> | null = null
  /** Whether an `arguments` identifier is a reference without a binding (never a property name or a key). */
  const isFreeArguments = (node: Node) => {
    freeArguments ??= new Set(
      t1.freeRefs
        .filter((f) => f.name === 'arguments')
        .map((f) => f.range.start),
    )
    return freeArguments.has(node.start)
  }
  /**
   * Functions called or constructed where they are written: what runs at
   * the call (`all`; a generator's `params` only).
   */
  const inPlace = new Map<Node, 'all' | 'params'>()

  /**
   * `outer`: the state around the function whose parameter `node` is (its
   * decorators run when the class is defined, in the code around it).
   */
  const visit = (
    node: Node,
    parent: Node | null,
    key: string | null,
    st: State,
    outer: State | null,
  ): void => {
    if (skip.some((r) => node.start >= r.start && node.end <= r.end)) {
      return
    }
    if (node.type.startsWith('TS') && !TS_RUNTIME.has(node.type)) {
      return
    }
    if (key === 'decorators' && outer !== null) {
      st = { ...outer, privates: st.privates }
    }
    let next = st
    const provided = carries(node)
    if (provided & ~st.have) {
      next = { ...next, have: st.have | provided }
    }
    switch (node.type) {
      case 'CallExpression':
      case 'NewExpression': {
        const callee = unwrapExpression(node.callee)
        if (
          callee.type === 'FunctionExpression' ||
          callee.type === 'ArrowFunctionExpression'
        ) {
          inPlace.set(callee, callee.generator ? 'params' : 'all')
        }
        break
      }
      case 'FunctionExpression':
      case 'FunctionDeclaration':
      case 'ArrowFunctionExpression':
        if (!st.inCallable) {
          callables.push({ start: node.start, end: node.end })
        }
        next = {
          ...next,
          inCallable: true,
          runs: inPlace.get(node) === 'all' ? st.runs : 'later',
        }
        break
      case 'ClassBody': {
        const own = privateNamesOf(node)
        if (own.size > 0) {
          next = {
            ...next,
            privates: st.privates ? new Set([...st.privates, ...own]) : own,
          }
        }
        break
      }
      case 'ThisExpression':
        if (!(st.have & FN)) {
          use('this', node)
        }
        break
      case 'JSXIdentifier':
        // `<this.Foo />`, `<arguments.Foo />`: a JSX member expression's object
        if (
          key === 'object' &&
          parent?.type === 'JSXMemberExpression' &&
          !(st.have & FN)
        ) {
          if (node.name === 'this') {
            use('this', node)
          } else if (node.name === 'arguments' && isFreeArguments(node)) {
            use('arguments', node)
          }
        }
        break
      case 'Super':
        if (!(st.have & FN)) {
          use('super', node)
        }
        break
      case 'MetaProperty':
        if (node.meta.name === 'new' && !(st.have & FN)) {
          use('new.target', node)
        }
        break
      case 'Identifier':
        if (
          node.name === 'arguments' &&
          !(st.have & FN) &&
          isFreeArguments(node)
        ) {
          use('arguments', node)
        }
        break
      case 'AwaitExpression':
        if (!(st.have & ASYNC)) {
          use('await', node)
        }
        break
      case 'YieldExpression':
        if (!(st.have & ASYNC)) {
          use('yield', node)
        }
        break
      // a private name: at the member or `in` expression, before its operands
      case 'MemberExpression':
        if (
          node.property.type === 'PrivateIdentifier' &&
          !st.privates?.has(node.property.name)
        ) {
          use('private-name', node.property)
        }
        break
      case 'BinaryExpression':
        if (
          node.left.type === 'PrivateIdentifier' &&
          !st.privates?.has(node.left.name)
        ) {
          use('private-name', node.left)
        }
        break
      default:
        break
    }
    onNode?.(node, st.runs)
    const fields = node as unknown as Record<string, unknown>
    for (const k of CHILD_KEYS[node.type] ?? []) {
      const value = fields[k] as Node | ReadonlyArray<Node | null> | null
      const list = Array.isArray(value) ? value : value != null ? [value] : []
      for (const c of list as ReadonlyArray<Node | null>) {
        if (c === null) {
          continue
        }
        let childSt = next
        if (k === 'params' && inPlace.get(node) === 'params') {
          childSt = { ...next, runs: st.runs }
        } else if (k === 'value' && isFieldValue(node, c)) {
          childSt = { ...next, have: next.have | FN | ASYNC }
          // an instance field's initialiser runs when the class is constructed
          if (!(node as { static: boolean }).static) {
            if (!next.inCallable) {
              callables.push({ start: c.start, end: c.end })
            }
            childSt.inCallable = true
            if (next.runs === 'now') {
              childSt.runs = 'maybe'
            }
          }
        }
        visit(
          c,
          node,
          k,
          childSt,
          k === 'params' && provided ? st : key === 'params' ? outer : null,
        )
      }
    }
  }
  for (const r of roots) {
    visit(r, null, null, START, null)
  }
  return { uses, callables }
}

/**
 * The construct around `of` that provides `use`'s kind to it, or null for
 * the module: one climb, on `walkMoved`'s table.
 */
export function contextOwner(
  t1: Tier1,
  of: Node,
  use: ContextUse,
): Node | null {
  const need = use.kind === 'await' || use.kind === 'yield' ? ASYNC : FN
  const name =
    use.kind === 'private-name' ? (use.node as { name: string }).name : null
  let child = of
  for (let p = t1.parentOf(child); p !== null; p = t1.parentOf(child)) {
    if (name !== null) {
      if (p.type === 'ClassBody' && privateNamesOf(p).has(name)) {
        return p
      }
    } else if (child.type === 'Decorator' && isParameter(t1, p)) {
      // a parameter's decorator has the code around the class: past the
      // parameter and its function
      child = t1.parentOf(p)!
      continue
    } else if ((carries(p) & need) !== 0 || isFieldValue(p, child)) {
      return p
    }
    child = p
  }
  return null
}

function isParameter(t1: Tier1, node: Node): boolean {
  const fn = t1.parentOf(node)
  return (
    fn !== null &&
    carries(fn) !== 0 &&
    'params' in fn &&
    (fn.params as ReadonlyArray<Node>).includes(node)
  )
}
