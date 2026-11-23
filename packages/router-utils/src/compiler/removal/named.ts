/**
 * What generated text names, where it stands in the source: the bodies of
 * edits and placeholders, the placeholders of claims, the inserts. A
 * reference of the source has a position and a binding; so has a name a
 * planner wrote. The closure and the mark read both the same way.
 */
import { symRefsOf } from '../clusters'
import type { Range } from '../header'
import type { SymbolId } from '../symbols'
import type {
  EditScope,
  Frag,
  GenFrag,
  OutputId,
  OutputView,
  RangeNode,
  RewriteSet,
} from '../rewrite'

export interface Named {
  at: number
  end: number
  syms: Array<SymbolId>
  /** Where it applies (null: a claim's placeholder, where the claim is in scope). */
  scope: EditScope | null
  node: RangeNode | null
}

/** Whether a body names a symbol (`symRefsOf` would return one). */
function names(body: ReadonlyArray<Frag | GenFrag>): boolean {
  for (const f of body) {
    if (f.k === 'ref') {
      return true
    }
    if (f.k === 'text') {
      for (const p of f.parts) {
        if (typeof p !== 'string') {
          return true
        }
      }
    }
  }
  return false
}

export class NamedText {
  private list: Array<Named> | null = null

  constructor(private readonly rewrites: RewriteSet) {}

  /** Every name generated text holds, by position. */
  all(): ReadonlyArray<Named> {
    if (this.list !== null) {
      return this.list
    }
    const list: Array<Named> = []
    const { rewrites } = this
    const add = (
      at: number,
      end: number,
      body: ReadonlyArray<Frag | GenFrag>,
      scope: EditScope | null,
      node: RangeNode | null,
    ) => {
      // (most bodies name nothing: no list for them)
      if (names(body)) {
        list.push({ at, end, syms: symRefsOf(body), scope, node })
      }
    }
    const visit = (n: RangeNode) => {
      if (n.edits !== null) {
        for (const e of n.edits) {
          add(n.start, n.end, e.body, e.scope, n)
        }
      }
      if (n.places !== null) {
        for (const p of n.places) {
          add(n.start, n.end, p.body, p.scope, n)
        }
      }
      if (n.claim !== null) {
        add(n.start, n.end, n.claim.placeholder, null, n)
      }
      for (const c of n.children) {
        if (c.marked) {
          visit(c)
        }
      }
    }
    if (rewrites.regions.marked) {
      visit(rewrites.regions.module)
    }
    for (const e of rewrites.inserts) {
      add(e.range.start, e.range.start, e.body, e.scope, null)
    }
    // (the walk is in source order: only the inserts can be out of place)
    if (rewrites.inserts.length > 0) {
      list.sort((x, y) => x.at - y.at)
    }
    this.list = list
    return list
  }

  /** Whether `n` stands in `output`'s text (its scope; not whether the text around it renders). */
  applies(n: Named, output: OutputId, view: OutputView): boolean {
    return n.scope !== null
      ? this.rewrites.inScope(n.scope, output)
      : n.node !== null && view.isClaimed(n.node)
  }

  /** The names standing inside `range`. */
  in(range: Range, visit: (n: Named) => void): void {
    const list = this.all()
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid]!.at < range.start) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo; i < list.length && list[i]!.at < range.end; i++) {
      visit(list[i]!)
    }
  }
}
