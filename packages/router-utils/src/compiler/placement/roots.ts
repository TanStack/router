/**
 * What the source used: the clusters text an output no longer holds
 * references (`readFromRemoved`, the removal rule's first half).
 */
import { NEED_KINDS } from './clusters'
import type { ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { TopLevelItem } from '../units'
import type { PlacementInput } from '../reach'

/**
 * The type-only export statements `main` deletes before its removal rule
 * (`stripTypeExports`): `export type X = …`, `export interface X {…}`,
 * `export type { X }`, and an `export { type X }` specifier. Their text is
 * removed text like an erased handler's: a value only they read was used by
 * the source and goes when nothing left reads it (F1). A re-export reads
 * nothing of the module.
 */
function typeOnlyExportRanges(
  items: ReadonlyArray<TopLevelItem>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (const { node, nodeRange } of items) {
    if (node.type !== 'ExportNamedDeclaration' || node.source !== null) {
      continue
    }
    if (node.exportKind === 'type') {
      out.push(nodeRange)
      continue
    }
    for (const spec of node.specifiers) {
      if (spec.exportKind === 'type') {
        out.push({ start: spec.start, end: spec.end })
      }
    }
  }
  return out
}

/**
 * Provenance, the one removal rule (R153 amendment, R154), in two halves:
 * - "the source used it": the clusters text an output no longer holds
 *   (`removed`: what it erases, what a claim moves out) references,
 *   transitively, by value or in a type position (`useState<X>()`,
 *   `v as typeof x`, a local `type` alias);
 * - "nothing left uses it" is the caller's: what that output keeps reads,
 *   by value only (TypeScript and the bundlers strip types).
 * Only the returned clusters can leave an output; code the source never
 * used stays as written (`function Unused() {…}`, `const unused =
 * register('x')`, an unused import).
 */
export function readFromRemoved(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  removed: Iterable<{ start: number; end: number }>,
): Set<ClusterId> {
  const { refs, symbols } = input.t1
  const seeds = new Set<ClusterId>()
  const parts = [...removed, ...typeOnlyExportRanges(input.t1.items)]
  for (const part of parts) {
    for (const ref of refs.refsIn(part)) {
      // a write names the binding too: an initialiser only an erased
      // handler assigns is orphaned with it
      if (!NEED_KINDS.has(ref.kind) || !symbols.isModuleLevel(ref.sym)) {
        continue
      }
      const d = graph.clusterOfSym.get(ref.sym)
      if (d !== undefined) {
        seeds.add(d)
      }
    }
  }
  // the type-position references: in removed text, a seed; elsewhere, a
  // use by the cluster holding them
  const typeUses = new Map<ClusterId, Array<ClusterId>>()
  for (const [s, d] of graph.clusterOfSym) {
    if (!symbols.isModuleLevel(s)) {
      continue
    }
    for (const ref of symbols.binding(s)?.references ?? []) {
      if (!ref.inTypePosition) {
        continue
      }
      const at = ref.node.start
      if (parts.some((p) => at >= p.start && at < p.end)) {
        seeds.add(d)
        continue
      }
      const r = input.rewrites.regions.innermostAt(at)
      const by = r === null ? undefined : graph.clusterOfRegion.get(r)
      if (by !== undefined && by !== d) {
        typeUses.set(by, [...(typeUses.get(by) ?? []), d])
      }
    }
  }
  const out = new Set<ClusterId>()
  const work = [...seeds]
  while (work.length > 0) {
    const c = work.pop()!
    if (out.has(c)) {
      continue
    }
    out.add(c)
    for (const d of reads.successors(c, 'env', false)) {
      work.push(d)
    }
    for (const d of typeUses.get(c) ?? []) {
      work.push(d)
    }
  }
  return out
}
