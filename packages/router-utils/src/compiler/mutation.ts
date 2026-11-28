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
 * `.handler(h as any)` passes `h` all the same) when the module writes it
 * explicitly (`h = …`, `h ??= …`, a destructuring target, in any function)
 * outside the module's server-only text (`PlanContext.serverText`, every
 * planner's): such a write is a statement, which the client output keeps
 * with what it reads (R154), so the server code it assigns can ship to the
 * client. No read, guard or export of the binding changes that (user
 * decision, 2026-11-26): a planner refuses every argument it names, in every
 * compile (SPEC J4.5), and the fix is a `const`. A write wholly inside
 * server-only text leaves the client with it. A Solid `ref={h}` is no
 * explicit assignment. (A `const` alias or a closure calling `h` is no
 * name at the position: no rule follows the name further.) With the
 * binding: its first such write, which the refusal names.
 */
export function reassignedServerCode(
  ctx: PlanContext,
  arg: Node,
): { sym: SymbolId; write: Range } | null {
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
  const write = t1.mutation
    .writesOf(sym)
    .find((w) => !within(w.range, serverText))
  return write === undefined ? null : { sym, write: write.range }
}

/** The 1-based `line:column` of an offset of the module, as a refusal names a write there. */
export function writePosition(ctx: PlanContext, at: Range): string {
  const { line, column } = ctx.analysis.source.locate(at.start)
  return `${line + 1}:${column + 1}`
}

function within(range: Range, texts: ReadonlyArray<Range>): boolean {
  return texts.some((t) => t.start <= range.start && range.end <= t.end)
}
