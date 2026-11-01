/**
 * Placement, stage 7: what each output contains and imports. A cluster is
 * included in its home; a copy goes where it is rooted and follows its
 * readers; a provider output includes everything it reaches. Every output
 * imports what it reads from the cluster's home, which exports it; the
 * TypeScript-only specifiers follow their statement's value specifiers.
 */
import { READ_KINDS, describeCluster } from './clusters'
import type { ClusterGraph, ClusterId } from './clusters'
import type { ReadIndex } from './reads'
import type { Roots } from './settle'
import type { Homes } from './homes'
import type { SymbolId } from '../symbols'
import type { UnitId } from '../units'
import type { OutputId } from '../rewrite'
import type { ExtractedExport, PlacementInput } from '../reach'

export interface Inclusion {
  /** Clusters each output contains (homed or duplicated). */
  included: Map<OutputId, Set<ClusterId>>
  /** o → (home output → symbols o imports from it). */
  imports: Map<OutputId, Map<OutputId, Set<SymbolId>>>
  /** Symbols each output must export for other outputs. */
  exportsNeeded: Map<OutputId, Set<SymbolId>>
  /** Type units the env module drops; every other type unit stays there, whatever its cluster. */
  droppedTypeUnits: Set<UnitId>
}

export function includeAndImport(
  input: PlacementInput,
  graph: ClusterGraph,
  reads: ReadIndex,
  roots: Roots,
  homes: Homes,
  extracted: ReadonlyArray<ExtractedExport>,
): Inclusion {
  const { t1, outputs, routeModule } = input
  const { units, items, refs, symbols } = t1
  const { clusters, clusterOfRegion, clusterOfSym } = graph
  const { envRoots, derivedRoots, derivedReach } = roots
  const { home, created, derivedNeeders } = homes

  const allOutputs: Array<OutputId> = [
    'env',
    ...[...outputs.keys()].filter((o) => o !== 'env'),
    ...created.map((c) => c.id),
  ]
  const included = new Map<OutputId, Set<ClusterId>>()
  for (const o of allOutputs) {
    included.set(o, new Set())
  }
  for (const cl of clusters) {
    const h = home.get(cl.id)!
    if (h === 'removed') {
      continue
    }
    if (h === 'duplicate') {
      // a copy goes where it is rooted, and follows its direct readers (below): a needer that
      // reaches it only through a cluster it imports from elsewhere does not copy it
      if (envRoots.has(cl.id)) {
        included.get('env')!.add(cl.id)
      }
      for (const o of derivedNeeders[cl.id]!) {
        if (derivedRoots.get(o)?.has(cl.id)) {
          included.get(o)!.add(cl.id)
        }
      }
      continue
    }
    included.get(h)!.add(cl.id)
  }
  // a provider output is the module's own instance in another layer or environment
  // (J4.14): it includes every cluster its roots reach, the env-homed ones
  // as copies, instead of importing them from the env module (whose server fns are stubs)
  for (const [o, decl] of outputs) {
    if (decl.kind !== 'provider') {
      continue
    }
    const inc = included.get(o)!
    for (const c of derivedReach.get(o) ?? []) {
      if (home.get(c) !== 'removed') {
        inc.add(c)
      }
    }
  }
  // duplicated clusters follow their readers into every output that includes
  // a reader (each round adds a copy somewhere, so the rounds end)
  for (;;) {
    let changed = false
    for (const o of allOutputs) {
      const inc = included.get(o)!
      for (const c of [...inc]) {
        const { syms } = reads.clusterReads(c, o, true)
        for (const s of syms) {
          const d = clusterOfSym.get(s)
          if (d !== undefined && !inc.has(d) && home.get(d) === 'duplicate') {
            inc.add(d)
            changed = true
          }
        }
      }
    }
    if (!changed) {
      break
    }
  }

  // ---- TypeScript-only specifiers: they follow their statement's value specifiers ----
  /**
   * Whether a type unit stays in the env module. Type units stay as written
   * whatever their cluster (`import type { X }` next to a value `X` that
   * moves stays type-only), except the TypeScript-only forms (an inline
   * `type` specifier, an `export { X }` of a type-only binding): they
   * follow the value specifiers of their statement.
   */
  const typeUnitStays = (u: UnitId): boolean => {
    const unit = units[u]!
    const inlineImportSpecifier =
      unit.importIndex !== null &&
      (items[unit.item]!.node as { importKind?: string }).importKind !== 'type'
    const typeOnlyExportSpecifier =
      unit.node.type === 'ExportSpecifier' && unit.node.exportKind !== 'type'
    if (!inlineImportSpecifier && !typeOnlyExportSpecifier) {
      return true
    }
    if (routeModule) {
      // the statement leaves with its value specifiers (an inline `type`
      // specifier alone keeps loading the module under
      // verbatimModuleSyntax); a type-only `export { X }` names nothing at
      // run time
      return false
    }
    if (inlineImportSpecifier) {
      return items[unit.item]!.units.some((sibling) => {
        const su = units[sibling]!
        const c = clusterOfRegion.get(su.region)
        return (
          su.kind !== 'type' && c !== undefined && included.get('env')!.has(c)
        )
      })
    }
    // `export { X }` of a type-only binding: leaves with the inline type
    // import specifiers declaring `X` when they left
    const ref = refs
      .refsIn(unit.range)
      .find((r) => r.kind === 'exportSpecifier')
    const decls =
      ref === undefined ? [] : (t1.declaringUnits.get(ref.sym) ?? [])
    return (
      decls.length === 0 ||
      decls.some((d) => units[d]!.kind !== 'type' || typeUnitStays(d))
    )
  }
  const droppedTypeUnits = new Set<UnitId>()
  units.forEach((unit, u) => {
    if (unit.kind === 'type' && !typeUnitStays(u)) {
      droppedTypeUnits.add(u)
    }
  })
  if (process.env.NODE_ENV !== 'production') {
    // a static output (an extracted export's module) never reads, at its
    // evaluation, a non-copyable binding the env module keeps: the roots
    // settled with such readers rooted in the env module (`readsKeptEagerly`)
    for (const [o, decl] of outputs) {
      if (decl.kind !== 'export') {
        continue
      }
      for (const c of included.get(o)!) {
        for (const r of clusters[c]!.regions) {
          for (const ref of graph.ownedRefs.get(r) ?? []) {
            if (
              !ref.eager ||
              !READ_KINDS.has(ref.kind) ||
              !symbols.isModuleLevel(ref.sym) ||
              !graph.isLive(ref, o)
            ) {
              continue
            }
            const d = clusterOfSym.get(ref.sym)
            if (
              d !== undefined &&
              d !== c &&
              !clusters[d]!.copyable &&
              clusters[d]!.kind !== 'import' &&
              home.get(d) === 'env'
            ) {
              throw new Error(
                `placement: ${describeCluster(input, clusters[c]!)} in static output ${o} reads ${describeCluster(input, clusters[d]!)} of the env module at its evaluation`,
              )
            }
          }
        }
      }
    }
  }

  // ---- imports and the exports they need -----------------------------------
  const imports = new Map<OutputId, Map<OutputId, Set<SymbolId>>>()
  const exportsNeeded = new Map<OutputId, Set<SymbolId>>()
  const exportOf = (h: OutputId): Set<SymbolId> => {
    let ex = exportsNeeded.get(h)
    if (!ex) {
      ex = new Set()
      exportsNeeded.set(h, ex)
    }
    return ex
  }
  for (const o of allOutputs) {
    const inc = included.get(o)!
    const map = new Map<OutputId, Set<SymbolId>>()
    imports.set(o, map)
    const wanted: Array<SymbolId> = []
    for (const c of inc) {
      for (const s of reads.clusterReads(c, o, true).syms) {
        wanted.push(s)
      }
    }
    // a root homed elsewhere is imported by the output that rooted it
    for (const c of derivedRoots.get(o) ?? []) {
      if (!inc.has(c)) {
        for (const s of clusters[c]!.declares) {
          wanted.push(s)
        }
      }
    }
    for (const s of wanted) {
      if (!symbols.isModuleLevel(s)) {
        continue
      }
      const d = clusterOfSym.get(s)
      if (d === undefined || inc.has(d)) {
        continue
      }
      const h = home.get(d)
      if (h === undefined || h === 'removed' || h === 'duplicate' || h === o) {
        continue
      }
      let set = map.get(h)
      if (!set) {
        set = new Set()
        map.set(h, set)
      }
      set.add(s)
      exportOf(h).add(s)
    }
  }
  for (const e of extracted) {
    const ex = exportOf(e.output)
    for (const s of e.syms) {
      ex.add(s)
    }
  }

  return { included, imports, exportsNeeded, droppedTypeUnits }
}
