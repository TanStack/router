/**
 * Render: how a definition that does not stay gives up its text, by its
 * slot (`build.ts`). The decision is the mark's; nothing here asks what is
 * live. A dead definition leaves at the largest node all of whose bindings
 * are dead; one that cannot leave (beside a rest element that stays, a
 * parameter, an array pattern's rest element) is contracted in place: it
 * keeps its position and gives up its bindings and its default.
 */
import { extendOverTrailingLine } from '../header'
import { nextToken } from '../source'
import { removeItems } from './lists'
import type { Node } from 'yuku'
import type { Range } from '../header'
import type { PlacementInput } from '../placement'
import type { EditScope, Frag, OutputView } from '../rewrite'
import type { Def, Definitions } from './build'

const BY = 'core:removal'

const text = (part: string): Frag => ({ k: 'text', parts: [part] })
const rangeOf = (n: { start: number; end: number }): Range => ({
  start: n.start,
  end: n.end,
})

export interface RenderInput {
  input: PlacementInput
  defs: Definitions
  /** Per definition: whether it stays in the outputs this pass edits. */
  stays: Uint8Array
  /** Per definition: whether it stays in the outputs an earlier pass edited (those that do not are done). */
  earlier: Uint8Array | null
  view: OutputView
  scope: EditScope
}

/** Writes the removals of one view. Returns whether it wrote any. */
export function render(a: RenderInput): boolean {
  const { input, defs, stays, earlier, view, scope } = a
  const { rewrites, code } = input
  const file = input.file
  let changed = false
  const live = (d: Def) => stays[d.id] === 1
  /** Dead here and not handled by the earlier pass. */
  const ours = (d: Def) => !live(d) && (earlier === null || earlier[d.id] === 1)
  const erased = (n: { start: number; end: number }) =>
    view.isErasedRange(rangeOf(n))
  const edit = (range: Range, body: Array<Frag> = []) => {
    changed = true
    rewrites.scopedEdit({ range, body, scope, by: BY })
  }
  const props = new Map<Node, Set<Node>>()
  const decls = new Map<Node, Set<Node>>()
  const group = (map: Map<Node, Set<Node>>, list: Node, item: Node) => {
    let set = map.get(list)
    if (!set) {
      map.set(list, (set = new Set()))
    }
    set.add(item)
  }
  const removeStatement = (statement: Node, slot: Def['slot']) => {
    if (slot === 'list') {
      edit({
        start: statement.start,
        end: extendOverTrailingLine(code, statement.end),
      })
    } else if (slot === 'init') {
      edit(rangeOf(statement))
    } else if (slot === 'body') {
      edit(rangeOf(statement), [text(';')])
    }
  }
  /** A rest element of `holder`'s object pattern stays: it would receive a key that left. */
  const restStays = (holder: Def | null): boolean =>
    holder !== null &&
    holder.pattern?.type === 'ObjectPattern' &&
    holder.children.some((c) => c.kind === 'rest' && live(c))

  /** `d` does not stay while what holds it does: it leaves by its slot. */
  const leave = (d: Def): void => {
    if (d.unit || d.kind === 'key' || erased(d)) {
      return
    }
    switch (d.slot) {
      case 'list':
      case 'init':
      case 'body':
        removeStatement(d.node, d.slot)
        break
      case 'item':
        if (d.kind === 'declarator') {
          group(decls, file.parentOf(d.node)!, d.node)
        } else if (d.kind === 'property' && restStays(d.parent)) {
          contract(d)
        } else {
          group(props, file.parentOf(d.node)!, d.node)
        }
        break
      case 'hole': {
        // the iterator is stepped as often as before
        const follows = code[nextToken(code, d.end)] === ','
        edit(rangeOf(d), follows ? [] : [text(',')])
        break
      }
      case 'tied':
      case 'fixed':
        contract(d)
        break
    }
  }
  /**
   * `d` keeps its position and gives up what it defines: its bindings leave
   * by their own slots (an object pattern becomes `{}`, an array pattern
   * keeps a hole per element), and its default goes: after a name in a
   * pattern it is dropped; after a pattern the empty literal of the
   * pattern's kind stands for it (an absent value is still destructured
   * without an error, a `null` still throws); a parameter that is a name
   * keeps a default that is a literal, and `void 0` stands for one that
   * reads or calls anything.
   */
  const contract = (d: Def): void => {
    const target = d.target
    if (d.kind === 'statement') {
      // (a `for…in/of` head: its declarator stays, emptied)
      for (const c of d.children) {
        contract(c)
      }
      return
    }
    if (d.pattern === null) {
      if (d.kind === 'parameter') {
        // (a parameter's own default: without it the function's `length`
        // would change)
        if (d.dflt !== null && !isLiteral(d.dflt) && !erased(d.dflt)) {
          edit(rangeOf(d.dflt), [text('void 0')])
        }
      } else if (
        target?.type === 'AssignmentPattern' &&
        d.kind !== 'declarator'
      ) {
        edit({ start: target.left.end, end: target.end })
      }
      return
    }
    for (const c of d.children) {
      leave(c)
    }
    if (d.dflt !== null && !erased(d.dflt)) {
      edit(rangeOf(d.dflt), [
        text(d.pattern.type === 'ArrayPattern' ? '[]' : '{}'),
      ])
    }
  }
  /** `d` stays: what does not stay under it leaves. */
  const descend = (d: Def): void => {
    for (const c of d.children) {
      if (live(c)) {
        descend(c)
      } else if (c.cand > 0 && ours(c)) {
        leave(c)
      }
    }
  }
  /** Whether the text holding `top`'s tree does not stay (the tree goes with it). */
  const goesWithHolder = (top: Def): boolean => {
    for (let o = top.outer; o !== null; ) {
      if (!live(o)) {
        return true
      }
      while (o.parent !== null) {
        o = o.parent
      }
      o = o.outer
    }
    return false
  }

  for (const d of defs.all) {
    if (d.parent !== null || goesWithHolder(d)) {
      continue
    }
    if (live(d)) {
      descend(d)
    } else if (d.cand > 0 && ours(d)) {
      leave(d)
    }
  }
  for (const [pat, pruned] of props) {
    if (pat.type !== 'ObjectPattern') {
      continue
    }
    const items = pat.properties as ReadonlyArray<Node>
    // the pattern's own `}` (its range covers a type annotation): past the
    // last property, a trailing comma and the comments
    let closing = nextToken(code, items[items.length - 1]!.end)
    if (code[closing] === ',') {
      closing = nextToken(code, closing + 1)
    }
    removeItems(items, (p) => pruned.has(p) || erased(p), pruned, closing, edit)
  }
  for (const [statement, pruned] of decls) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }
    const items = statement.declarations as ReadonlyArray<Node>
    const gone = (d: Node) => pruned.has(d) || erased(d)
    if (items.every(gone)) {
      // (the others were erased before: the statement goes, by its slot)
      const def = defs.all.find((x) => x.node === statement)
      if (def !== undefined) {
        removeStatement(statement, def.slot)
      }
    } else {
      removeItems(items, gone, pruned, null, edit)
    }
  }
  return changed
}

/** A value written out: it reads no binding and calls nothing. */
function isLiteral(node: Node): boolean {
  switch (node.type) {
    case 'Literal':
      return true
    // (not through a type assertion: its type can name what leaves)
    case 'ParenthesizedExpression':
    case 'TSNonNullExpression':
      return isLiteral(node.expression)
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'UnaryExpression':
      return (
        (node.operator === '-' ||
          node.operator === '+' ||
          node.operator === '!' ||
          node.operator === 'void') &&
        isLiteral(node.argument)
      )
    case 'ArrayExpression':
      return node.elements.every((el) => el === null || isLiteral(el))
    case 'ObjectExpression':
      return node.properties.every(
        (p) =>
          p.type === 'Property' &&
          p.kind === 'init' &&
          !p.computed &&
          !p.method &&
          isLiteral(p.value),
      )
    default:
      return false
  }
}
