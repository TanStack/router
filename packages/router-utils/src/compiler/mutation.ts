/**
 * What assigns a module's bindings (`x = …`, `x++`, a destructuring or
 * for-in/of target, a `var` declared again with a value, a Solid `ref={x}`
 * that may assign: `ClassifiedRef.assigns`), for the planners that ask
 * whether a binding keeps the value its declaration gave it (the router
 * planner's options, the Hydrate captures) and for the glue's export check.
 * A view over the classified references: nothing is built until a binding is
 * asked about, and then once. Erasure is the consumer's business, passed as
 * the `live` filter; a possible assignment counts only through one (a ref in
 * text an output erases assigns nothing there). `reassignedServerCode`
 * asks it for the planners' server code passed by name.
 */
import { unwrapExpression } from './source'
import type { ClassifiedRef, RefIndex } from './analysis'
import type { PlanContext } from './plan'
import type { Range } from './header'
import type { SymbolId } from './symbols'
import type { Node } from 'yuku'

export class MutationModel {
  private sites: Map<SymbolId, ReadonlyArray<ClassifiedRef>> | null = null

  constructor(private readonly refs: RefIndex) {}

  /**
   * The binding is assigned somewhere (`live`: in code an output keeps):
   * its value is not the one its declaration gave it.
   */
  isReassigned(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    const sites = this.sitesOf(sym)
    return sites.some((r) => counts(r, sites, live))
  }

  /** What assigns the binding (`live`: in code an output keeps), in source order. */
  writesOf(
    sym: SymbolId,
    live?: (ref: ClassifiedRef) => boolean,
  ): ReadonlyArray<ClassifiedRef> {
    const sites = this.sitesOf(sym)
    return sites.filter((r) => counts(r, sites, live))
  }

  private sitesOf(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    this.sites ??= new Map()
    let sites = this.sites.get(sym)
    if (sites === undefined) {
      sites = this.refs
        .refsOf(sym)
        .filter((r) => r.kind === 'write' || r.assigns !== undefined)
      this.sites.set(sym, sites)
    }
    return sites
  }
}

/**
 * Whether a write of `sites` counts: a possible assignment only through a
 * liveness filter, and on a callback binding only beside a kept explicit
 * write.
 */
function counts(
  r: ClassifiedRef,
  sites: ReadonlyArray<ClassifiedRef>,
  live: ((ref: ClassifiedRef) => boolean) | undefined,
): boolean {
  if (r.assigns === undefined) {
    return live === undefined || live(r)
  }
  return (
    live !== undefined &&
    live(r) &&
    (r.assigns === 'value' ||
      sites.some((w) => w.assigns === undefined && live(w)))
  )
}

/**
 * The binding server code passes by name (`arg`, through a cast:
 * `.handler(h as any)` passes `h` all the same) when the client keeps
 * assignments of it that only server code needs: the module writes it
 * explicitly (`h = …`, `h ??= …`, a destructuring target, in any function)
 * outside the module's server-only text (`PlanContext.serverText`, every
 * planner's), and nothing the client keeps for its own sake reads it. That
 * is no export, and no read outside the server-only text, the binding's own
 * declarator, and the assignments: each write's smallest clause (its
 * statement, `h = wrap(h)`, or the loop head or condition holding it) with
 * the tests of the control statements around it up to its function
 * (`if (!h) h = …`, `while (!h) { h = … }`), never a body
 * (`assignmentText`). Such assignments are statements, which the client
 * output keeps with what they read (R154), so the server code they assign
 * ships to the client. A planner refuses every argument it names, in every
 * compile (SPEC J4.5): the verdict reads the source only. A binding the
 * client reads anyway (a form calling the validator it also passes) ships
 * with its assignments whatever the planner does; assignments inside
 * server code leave the client with it. A Solid `ref={h}` is no explicit
 * assignment (Solid sets it when the element renders), and the element
 * reads `h`. (A `const` alias or a closure calling `h` is such a read: no
 * rule follows the name further.)
 */
export function reassignedServerCode(
  ctx: PlanContext,
  arg: Node,
): SymbolId | null {
  const { t1 } = ctx
  const named = unwrapExpression(arg)
  if (named.type !== 'Identifier') {
    return null
  }
  const sym = t1.refs
    .refsIn(named)
    .find((r) => r.range.start === named.start)?.sym
  // (most bindings are never written: no model built for them)
  if (
    sym === undefined ||
    !t1.refs.refsOf(sym).some((r) => r.kind === 'write')
  ) {
    return null
  }
  const serverText = ctx.serverText()
  const kept = t1.mutation
    .writesOf(sym)
    .filter((w) => !within(w.range, serverText))
  if (
    kept.length === 0 ||
    t1.refs.refsOf(sym).some((r) => r.kind === 'exportSpecifier') ||
    (t1.declaringUnits.get(sym) ?? []).some(
      (u) => t1.units[u]!.exported.length > 0,
    )
  ) {
    return null
  }
  const own = [
    ...kept.flatMap((w) => assignmentText(ctx, w.range)),
    ...declaratorText(ctx, sym).map((range) => ({ range, open: false })),
  ]
  const ofAssignment = (r: Range) =>
    own.some(
      (t) => within(r, [t.range]) && !(t.open && inFunctionOf(ctx, r, t.range)),
    )
  return t1.refs
    .valueRefsOf(sym)
    .some((r) => !within(r.range, serverText) && !ofAssignment(r.range))
    ? null
    : sym
}

/** Whether `at` is in a function or class nested in `text` (code that runs another time). */
function inFunctionOf(ctx: PlanContext, at: Range, text: Range): boolean {
  const file = ctx.analysis.file
  for (
    let n = ctx.t1.nodeAt(at.start);
    n !== null && within(n, [text]);
    n = file.parentOf(n)
  ) {
    if (BOUNDARY.has(n.type)) {
      return true
    }
  }
  return false
}

/**
 * The text a write at `at` belongs to: the smallest clause holding it (its
 * statement, or the head clause of a loop or `if` it is in: a `for` init,
 * test or update, a `for…in`/`for…of` target or object, a condition), and
 * the tests of every control statement around that clause (`if` tests, loop
 * conditions, a `switch`'s discriminant and case tests; a `for` update's
 * own loop test too), never their bodies and never past the function or
 * class around it. A head clause or test is `open`: a function or class in
 * it is not the assignment (`if (register(() => h())) { h = … }`).
 */
function assignmentText(
  ctx: PlanContext,
  at: Range,
): Array<{ range: Range; open: boolean }> {
  const file = ctx.analysis.file
  let below = ctx.t1.nodeAt(at.start)
  if (below === null) {
    return [{ range: at, open: false }]
  }
  const text: Array<{ range: Range; open: boolean }> = []
  let clause = false
  for (let n = file.parentOf(below); ; below = n, n = file.parentOf(n)) {
    if (n === null || n.type === 'Program' || BOUNDARY.has(n.type)) {
      if (!clause) {
        text.push({ range: below, open: false })
      }
      return text
    }
    const inHead = headsOf(n).some((h) => sameNode(h, below!))
    if (!clause && (inHead || isStatement(below))) {
      clause = true
      text.push({ range: below, open: inHead })
    }
    // (the tests of what holds the clause; a `for` update runs after its test)
    if (
      clause &&
      (!inHead ||
        (n.type === 'ForStatement' &&
          n.update !== null &&
          sameNode(n.update, below)))
    ) {
      text.push(...testsOf(n).map((range) => ({ range, open: true })))
    }
  }
}

/** The clauses of a control statement that are not its body. */
function headsOf(n: Node): Array<Node> {
  switch (n.type) {
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return [n.test]
    case 'ForStatement':
      return [n.init, n.test, n.update].filter((h) => h !== null)
    case 'ForInStatement':
    case 'ForOfStatement':
      return [n.left, n.right]
    case 'SwitchStatement':
      return [n.discriminant]
    case 'SwitchCase':
      return n.test ? [n.test] : []
    default:
      return []
  }
}

/** The tests deciding whether a control statement's body runs (`headsOf` but the loop targets and objects). */
function testsOf(n: Node): Array<Node> {
  switch (n.type) {
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return [n.test]
    case 'ForStatement':
      return n.test ? [n.test] : []
    case 'SwitchStatement':
      return [
        n.discriminant,
        ...n.cases.flatMap((c) => (c.test ? [c.test] : [])),
      ]
    default:
      return []
  }
}

function isStatement(n: Node): boolean {
  return n.type.endsWith('Statement') || n.type.endsWith('Declaration')
}

function sameNode(a: Range, b: Range): boolean {
  return a.start === b.start && a.end === b.end
}

/** A local binding's own declarator (a top-level one's reads are no `valueRefsOf`). */
function declaratorText(ctx: PlanContext, sym: SymbolId): Array<Range> {
  const file = ctx.analysis.file
  return (ctx.symbols.binding(sym)?.declarations ?? []).flatMap((name) => {
    for (let n = file.parentOf(name); n !== null; n = file.parentOf(n)) {
      if (
        n.type === 'VariableDeclarator' ||
        (n.type === 'FunctionDeclaration' &&
          n.id !== null &&
          sameNode(n.id, name))
      ) {
        return [n]
      }
      if (BOUNDARY.has(n.type) || n.type.endsWith('Statement')) {
        break
      }
    }
    return []
  })
}

/** What a write's statement does not reach past: code that runs another time. */
const BOUNDARY: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
  'ClassDeclaration',
  'ClassExpression',
  'StaticBlock',
  'PropertyDefinition',
])

function within(range: Range, texts: ReadonlyArray<Range>): boolean {
  return texts.some((t) => t.start <= range.start && range.end <= t.end)
}
