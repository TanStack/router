/**
 * The one owner of "this expression goes here" (README.md, "Expression
 * boundaries"). An expression boundary is a place where one complete
 * expression renders where a different expression, or none, stood in the
 * source: a factory call replaced by the implementation it keeps
 * (`AnalysisPlan.replaceExpression`), a region rendered whole in a generated
 * position (`RegionFrag.expr`). Planners name what goes where; the renderer
 * (`freeze.ts`) asks the three questions below at each boundary, on what
 * actually rendered there, and writes the parentheses, the `(0, …)` and the
 * spaces. Statement separation stays separate (`freeze.ts`,
 * `Renderer.statementStart`): it decides whether two statements join, after
 * the wrapping.
 *
 * Three inputs, all plain integers (no Yuku node outlives the plan):
 * - the role: what the replaced occurrence was (`ROLE_*`);
 * - the destination (`Dest`): where the expression stands in the output;
 * - the shape (`Shape`): what renders inside the boundary.
 *
 * Three questions, never merged: V, value or reference (`needsValue`: the
 * source produced a value where the output would produce a reference); G,
 * grouping (`needsGroup`: the text would parse differently there); L, tokens
 * (`needsSpace`: the edge characters would merge with their neighbours).
 */
import { isExpressionWrapper, nextToken, unwrapExpression } from './source'
import type { Node } from 'yuku'

type File = { parentOf: (node: Node) => Node | null }

// ---- roles ---------------------------------------------------------------

/** A call that returned a value, replaced by what it kept (or a generated stub): it never was a reference. */
export const ROLE_VALUE = 0
/** A reference to a binding, rendered as another reference (a captured `cb` as `props.cb`). */
export const ROLE_REFERENCE = 1
/** An expression rendered whole in a generated position: still the expression it was. */
export const ROLE_MOVED = 2
export type Role = typeof ROLE_VALUE | typeof ROLE_REFERENCE | typeof ROLE_MOVED

// ---- destinations ----------------------------------------------------------

/**
 * Where a complete expression stands, packed: the precedence `level` the
 * position takes without parentheses, how the value is used (read through
 * groups and TypeScript wrappers), and the flags of the rules below.
 */
export type Dest = number

/** A statement, inside a group, a template substitution, a computed key: anything, a sequence included. */
const LEVEL_ANY = 0
/** An argument, element, initialiser, property value, default, assignment's right, arrow body, spread, branch. */
const LEVEL_NO_COMMA = 1
/** An operand, a callee, a member object, a tag, a heritage: only what never needs parentheses. */
const LEVEL_OPERAND = 2
const LEVEL_MASK = 3

const USE_SHIFT = 2
const USE_MASK = 7 << USE_SHIFT
const USE_CALL = 1 << USE_SHIFT
const USE_TAG = 2 << USE_SHIFT
const USE_DECORATOR = 3 << USE_SHIFT
const USE_DELETE = 4 << USE_SHIFT
const USE_TYPEOF = 5 << USE_SHIFT

/** A non-optional member access, call or tagged template follows, with no group between (or only `!`). */
const D_CONTINUES = 1 << 5
/** The follower is `.name` (a number's `.` would be its decimal point). */
const D_DOT = 1 << 6
/**
 * Callee, tag, member object, heritage or decorator, directly; or the
 * operand of `!`, the left of `<`: where JSX cannot stand (TypeScript and Oxc
 * read what follows its closing `>` as more of it).
 */
const D_LHS = 1 << 7
/** The expression's first token is the first token of a statement, an `export default` or an arrow's body. */
const D_EDGE = 1 << 8
/**
 * All of a statement through the groups and TypeScript wrappers around it
 * (`x`, `(x)`, `x as T`, `<T>x`, `x!`), in a list with a directive prologue (a module, a
 * function body): what precedes it may render as nothing (a removed import,
 * a declaration only erased code read, a type the lowering erases), and a
 * string statement first in the list is a directive. A group does not
 * protect it: TypeScript's transpiler drops the parentheses around a
 * wrapper it erases, and esbuild reads `('s');` as a directive. It renders
 * as `(void x)`, which no lowering or minifier makes a string alone
 * (`statementPrefix`).
 */
const D_PROLOGUE = 1 << 9
/** In a classic `for` initialiser, outside any block: an `in` would start a `for…in`. */
const D_NO_IN = 1 << 10
/** A decorator, directly: its grammar is a name, a call of one or a group. */
const D_DECORATOR = 1 << 11
/** A recipe's position, delimited by the recipe's own text (`= `, `(`, a line end): no token rule. */
const D_DELIMITED = 1 << 12

/** A generated unit's initialiser (`const X = <here>`). */
export const DEST_INITIALIZER: Dest = LEVEL_NO_COMMA | D_DELIMITED
/** A reference called or tagged (`ROLE_REFERENCE`). */
export const DEST_CALLEE: Dest = LEVEL_OPERAND | USE_CALL | D_LHS

// ---- shapes ----------------------------------------------------------------

/** What renders inside a boundary, packed: its own precedence level and what the rules read of it. */
export type Shape = number

const SHAPE_SEQUENCE = 0
/** Anything else: an operator, an arrow, a function, a class, `new` with arguments, `x as T`. */
const SHAPE_OPEN = 1
/**
 * Never needs parentheses as an operand: an identifier, a literal, a call, a
 * member, an array, a template, a group, `this`, JSX, a tagged template, an
 * optional chain.
 */
const SHAPE_TIGHT = 2

const REF_SHIFT = 2
const REF_MASK = 7 << REF_SHIFT
const REF_NONE = 0
/** An identifier bound in the module. */
export const REF_BINDING = 1 << REF_SHIFT
/** An identifier with no binding in the module: reading it may throw. */
const REF_FREE = 2 << REF_SHIFT
/** `eval`: called as itself, it evaluates in place. */
const REF_EVAL = 3 << REF_SHIFT
/** A member (computed, private and optional ones too): called as itself, it gets a receiver. */
export const REF_MEMBER = 4 << REF_SHIFT
/** Not known (a nested call's implementation, a planner's text): any of the above, valued in every use. */
const REF_UNKNOWN = 5 << REF_SHIFT

/** The outer node is an optional chain (through `!`): something following would extend it. */
const S_CHAIN = 1 << 5
/** `new` without an argument list. */
const S_NEW_BARE = 1 << 6
/** A number literal written with digits only: a `.` after it is its decimal point. */
const S_DIGITS = 1 << 7
const S_JSX = 1 << 8
/** Valid as a decorator as it is: a name, a dotted name, a call of one, a group. */
const S_DECORATOR = 1 << 10
/** Generated text that holds no `in` (a stub). */
const S_NO_IN = 1 << 11

/**
 * What nothing else is known of: one complete expression, no bare sequence,
 * of any reference (a planner's edit that declares no shape, a nested
 * boundary): parentheses in operand positions, `(0, …)` where called,
 * deleted, decorated or under `typeof`.
 */
export const SHAPE_UNKNOWN: Shape = SHAPE_OPEN | REF_UNKNOWN
/** A planner's call (a server fn's stub, an RPC): grouped like one, no reference. */
export const SHAPE_CALL: Shape = SHAPE_TIGHT
/** A generated arrow without `in` (`() => {}`, a throwing stub). */
export const SHAPE_ARROW: Shape = SHAPE_OPEN | S_NO_IN
/** A method's function completed by its keyword (`function` + the region from its parameters on). */
export const SHAPE_FUNCTION: Shape = SHAPE_OPEN

// ---- plan time: where and what ------------------------------------------

/**
 * The destination of the expression `node` replaces, read from the source
 * around it. `shape` is what goes there (the `for` initialiser is looked
 * for only when it may hold an `in`); `forInit` memoises that climb for one
 * plan, null when the module writes no `for`.
 */
export function destOf(
  file: File,
  node: Node,
  shape: Shape,
  forInit: Map<Node, boolean> | null,
): Dest {
  const parent = file.parentOf(node)
  if (parent === null) {
    return LEVEL_ANY
  }
  let d = slotOf(parent, node)
  // how the value is used: through groups and TypeScript wrappers
  let n = node
  let p: Node | null = parent
  while (p !== null && isExpressionWrapper(p) && p.expression === n) {
    n = p
    p = file.parentOf(p)
  }
  if (p !== null) {
    d |= useOf(p, n)
    // (all of a statement once the lowering erases the wrappers around it,
    // groups too: `<T>` stands before it, so the edge is no condition)
    if (p.type === 'ExpressionStatement' && inDirectiveList(file, p)) {
      d |= D_PROLOGUE
    }
  }
  // what follows: through `!` only (a group stops a chain)
  n = node
  p = parent
  while (p.type === 'TSNonNullExpression') {
    n = p
    const up = file.parentOf(p)
    if (up === null) {
      break
    }
    p = up
  }
  if (
    (p.type === 'MemberExpression' && p.object === n && !p.optional) ||
    (p.type === 'CallExpression' && p.callee === n && !p.optional) ||
    (p.type === 'TaggedTemplateExpression' && p.tag === n)
  ) {
    d |= D_CONTINUES
  }
  if (atEdge(file, node, parent)) {
    d |= D_EDGE
  }
  // (a kept node may render as something looser than its source, a nested
  // call's implementation: only generated text that holds no `in` is spared)
  if (
    forInit !== null &&
    !(shape & S_NO_IN) &&
    inForInit(file, node, parent, forInit)
  ) {
    d |= D_NO_IN
  }
  return d
}

/** The level of the slot `node` fills in `parent`, and whether it is a left-hand side there. */
function slotOf(parent: Node, node: Node): Dest {
  switch (parent.type) {
    case 'CallExpression':
    case 'NewExpression':
      return parent.callee === node ? LEVEL_OPERAND | D_LHS : LEVEL_NO_COMMA
    case 'MemberExpression':
      if (parent.object !== node) {
        return LEVEL_ANY // a computed key
      }
      return (
        LEVEL_OPERAND | D_LHS | (parent.computed || parent.optional ? 0 : D_DOT)
      )
    case 'TaggedTemplateExpression':
      return parent.tag === node ? LEVEL_OPERAND | D_LHS : LEVEL_NO_COMMA
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.superClass === node ? LEVEL_OPERAND | D_LHS : LEVEL_NO_COMMA
    case 'Decorator':
      return LEVEL_OPERAND | D_LHS | D_DECORATOR
    case 'TSNonNullExpression':
      return LEVEL_OPERAND | D_LHS
    case 'BinaryExpression':
      return parent.operator === '<' && parent.left === node
        ? LEVEL_OPERAND | D_LHS
        : LEVEL_OPERAND
    case 'UnaryExpression':
    case 'LogicalExpression':
    case 'AwaitExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'TSInstantiationExpression':
      return LEVEL_OPERAND
    case 'ConditionalExpression':
      return parent.test === node ? LEVEL_OPERAND : LEVEL_NO_COMMA
    case 'ExpressionStatement':
    case 'ParenthesizedExpression':
    case 'SequenceExpression':
    case 'TemplateLiteral':
      return LEVEL_ANY
    default:
      return LEVEL_NO_COMMA
  }
}

/** How `p` uses its child `n` (the replaced expression, through its wrappers). */
function useOf(p: Node, n: Node): Dest {
  switch (p.type) {
    case 'CallExpression':
      return p.callee === n ? USE_CALL : 0
    case 'TaggedTemplateExpression':
      return p.tag === n ? USE_TAG : 0
    case 'Decorator':
      return USE_DECORATOR
    case 'UnaryExpression':
      return p.operator === 'delete'
        ? USE_DELETE
        : p.operator === 'typeof'
          ? USE_TYPEOF
          : 0
    default:
      return 0
  }
}

/**
 * Whether `node` is the left edge of a statement, of an `export default`
 * expression or of an arrow's expression body: every node between starts
 * where it does (`node.bind(x)()`, `node as T`, `node, b`).
 */
function atEdge(file: File, node: Node, parent: Node): boolean {
  let n = node
  for (let p: Node | null = parent; p; n = p, p = file.parentOf(p)) {
    if (
      p.type === 'ExpressionStatement' ||
      p.type === 'ExportDefaultDeclaration'
    ) {
      return true
    }
    if (p.type === 'ArrowFunctionExpression') {
      return p.body === n
    }
    if (p.start !== n.start) {
      return false
    }
  }
  return false
}

/** Whether `statement` is in a list that starts with a directive prologue: a module or a function body. */
function inDirectiveList(file: File, statement: Node): boolean {
  const list = file.parentOf(statement)
  if (list === null || list.type === 'Program') {
    return list !== null
  }
  if (list.type !== 'BlockStatement') {
    return false
  }
  const fn = file.parentOf(list)
  return (
    fn !== null &&
    (fn.type === 'FunctionDeclaration' ||
      fn.type === 'FunctionExpression' ||
      fn.type === 'ArrowFunctionExpression')
  )
}

/** Whether `node` is in the initialiser of a classic `for`, outside any block. */
function inForInit(
  file: File,
  node: Node,
  parent: Node,
  memo: Map<Node, boolean>,
): boolean {
  if (parent.type === 'ForStatement') {
    return parent.init === node
  }
  if (parent.type === 'BlockStatement') {
    return false
  }
  // (memoised on the ancestors climbed: nested and sibling kept nodes share
  // them, and each level is a parent query)
  const path: Array<Node> = []
  let result = false
  for (let n = parent; ; ) {
    const known = memo.get(n)
    if (known !== undefined) {
      result = known
      break
    }
    path.push(n)
    const p = file.parentOf(n)
    if (p === null || p.type === 'BlockStatement') {
      break
    }
    if (p.type === 'ForStatement') {
      result = p.init === n
      break
    }
    n = p
  }
  for (const n of path) {
    memo.set(n, result)
  }
  return result
}

const TIGHT = new Set([
  'Identifier',
  'Literal',
  'CallExpression',
  'MemberExpression',
  'ArrayExpression',
  'TemplateLiteral',
  'ParenthesizedExpression',
  'ThisExpression',
  'JSXElement',
  'JSXFragment',
  'TaggedTemplateExpression',
  'ChainExpression',
])

/**
 * The shape of the source expression `node` (`code`: the module's text).
 * `bound` says whether an identifier has a binding in the module.
 */
export function shapeOf(
  node: Node,
  code: string,
  bound: (id: Node) => boolean,
): Shape {
  let s =
    node.type === 'SequenceExpression'
      ? SHAPE_SEQUENCE
      : TIGHT.has(node.type)
        ? SHAPE_TIGHT
        : SHAPE_OPEN
  const value = unwrapExpression(node)
  if (value.type === 'MemberExpression') {
    s |= REF_MEMBER
  } else if (value.type === 'Identifier') {
    s |=
      value.name === 'eval' ? REF_EVAL : bound(value) ? REF_BINDING : REF_FREE
  }
  let outer = node
  while (outer.type === 'TSNonNullExpression') {
    outer = outer.expression
  }
  if (outer.type === 'ChainExpression') {
    s |= S_CHAIN
  }
  switch (node.type) {
    case 'NewExpression':
      // (no argument list: the node ends at its callee or its type arguments)
      if ((node.typeArguments ?? node.callee).end === node.end) {
        s |= S_NEW_BARE
      }
      break
    case 'Literal':
      if (/^\d[\d_]*$/.test(code.slice(node.start, node.end))) {
        s |= S_DIGITS
      }
      break
    case 'JSXElement':
    case 'JSXFragment':
      s |= S_JSX
      break
    case 'ParenthesizedExpression':
      s |= S_DECORATOR
      break
    default:
      if (decoratorName(node.type === 'CallExpression' ? node.callee : node)) {
        s |= S_DECORATOR
      }
  }
  return s
}

/** An identifier or a dotted name of identifiers (private names too), which a decorator takes as it is. */
function decoratorName(node: Node): boolean {
  let n = node
  while (n.type === 'MemberExpression' && !n.computed && !n.optional) {
    n = n.object
  }
  return n.type === 'Identifier'
}

// ---- the three questions --------------------------------------------------

/**
 * What a statement's whole expression is written behind: all of a
 * statement a directive prologue may hold (`D_PROLOGUE`) renders as `(void
 * x)`, so it is no directive whatever renders; nothing reads its value.
 * Not `(0, x)`: Rspack 2.3's SWC minifier reduces `0, 's';` to `'s';`, a
 * directive. An operand below `void`'s precedence is grouped (`void () =>
 * {}` does not parse, `void a ? b : c` runs `c`). Null: not such a statement.
 */
export function statementPrefix(dest: Dest, shape: Shape): string | null {
  if (!(dest & D_PROLOGUE)) {
    return null
  }
  return (shape & LEVEL_MASK) === SHAPE_TIGHT ? '(void ' : '(void ('
}

/**
 * V: whether the expression renders as `(0, x)`, which yields a value: no
 * receiver, an indirect `eval`, a read that throws for an unresolvable name,
 * nothing to delete. A moved expression is the occurrence it was.
 */
export function needsValue(dest: Dest, role: Role, shape: Shape): boolean {
  const ref = shape & REF_MASK
  if (ref === REF_NONE || role === ROLE_MOVED) {
    return false
  }
  switch (dest & USE_MASK) {
    case USE_CALL:
    case USE_TAG:
      return (
        ref === REF_MEMBER ||
        ref === REF_UNKNOWN ||
        (role === ROLE_VALUE && ref === REF_EVAL)
      )
    case USE_DECORATOR:
      return ref === REF_MEMBER || ref === REF_UNKNOWN
    case USE_DELETE:
      return role === ROLE_VALUE
    case USE_TYPEOF:
      return role === ROLE_VALUE && (ref === REF_FREE || ref === REF_UNKNOWN)
    default:
      return false
  }
}

/** What a boundary writes around its expression (`needsGroup`). */
export const GROUP_NONE = 0
/** `(…)` */
export const GROUP_PARENS = 1
/** `()` appended to a `new` without arguments, which groups it the same way (rule W). */
export const GROUP_ARGUMENTS = 2

/**
 * G: whether the text would parse differently where it stands. Three levels
 * of precedence, no operator table (an `OPEN` expression is grouped in every
 * operand position), then the cases precedence does not describe.
 * `opensAtEdge`: what rendered at a statement's, an `export default`'s or
 * an arrow body's first token would be read otherwise there (`edgeOpens`).
 */
export function needsGroup(
  dest: Dest,
  shape: Shape,
  opensAtEdge: boolean,
): number {
  const level = shape & LEVEL_MASK
  if (
    level < (dest & LEVEL_MASK) ||
    (dest & D_NO_IN && level < SHAPE_TIGHT && !(shape & S_NO_IN))
  ) {
    // (SWC 1.15.33 prints `(new Factory)()` as `new Factory()`, dropping the
    // call: https://github.com/swc-project/swc/issues/12810; `new Factory()`
    // is the same value, but no decorator)
    return shape & S_NEW_BARE && !(dest & D_DECORATOR)
      ? GROUP_ARGUMENTS
      : GROUP_PARENS
  }
  return (dest & D_CONTINUES && shape & S_CHAIN) ||
    (dest & D_LHS && dest & D_DOT && shape & S_DIGITS) ||
    (dest & D_LHS && shape & S_JSX) ||
    (dest & D_DECORATOR && !(shape & S_DECORATOR)) ||
    opensAtEdge
    ? GROUP_PARENS
    : GROUP_NONE
}

/** Whether G's edge rule is asked (`edgeOpens`): the destination is a statement's, an `export default`'s or an arrow body's first token. */
export function atStatementEdge(dest: Dest): boolean {
  return (dest & D_EDGE) !== 0
}

/** Whether L is asked at the boundary's edges (a recipe's position is delimited by the recipe). */
export function tokensMeet(dest: Dest): boolean {
  return (dest & D_DELIMITED) === 0
}

/** The shape after V or G wrapped it: a group, whatever was inside. */
export const SHAPE_GROUPED: Shape = SHAPE_TIGHT | S_DECORATOR

/** `shape` with the reference a render reported for its kept node (a substituted capture, a renamed binding). */
export function withRef(shape: Shape, ref: Shape): Shape {
  return (shape & ~REF_MASK) | (ref & REF_MASK)
}

/**
 * G's edge rule on `text`, what a boundary rendered at a statement's edge:
 * written as a statement it would open a block or a declaration (G7).
 */
export function edgeOpens(text: string): boolean {
  return opensNonExpressionStatement(text, nextToken(text, 0))
}

/**
 * Whether code whose first token is at `start` would, written as a
 * statement, start a block, a declaration or a `let` declaration instead of
 * an expression (`{ a: f() };`, `function () {}();`, a decorated class
 * `@dec class {}.f();`): an expression put there needs parentheses.
 * Whitespace and comments may separate `async` from `function` and `let`
 * from `[`.
 */
function opensNonExpressionStatement(code: string, start: number): boolean {
  const first = /[{@]|function\b|class\b|async\b|let\b/y
  first.lastIndex = start
  const token = first.exec(code)?.[0]
  if (token === 'async') {
    const second = /function\b/y
    second.lastIndex = nextToken(code, first.lastIndex)
    return second.test(code)
  }
  if (token === 'let') {
    return code[nextToken(code, first.lastIndex)] === '['
  }
  return token !== undefined
}
