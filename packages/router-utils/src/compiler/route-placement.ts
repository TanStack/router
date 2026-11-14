/**
 * Placement of a route file (`PlanContext.setRouteModule`): what route code
 * splitting on `main` does, by its outcome, on the core's analysis.
 *
 * - The env module (the route file) keeps everything but what the planners'
 *   edits left unread: an import specifier, a declarator, a function or a
 *   class declaration that something read in the source and that nothing
 *   the env module keeps reads or writes any more is removed, with its
 *   initialiser (`main`'s dead-code elimination after the split: what only
 *   split code read leaves the route file, effects included; `main` keeps a
 *   class in the route file and copies it, or moves it to its shared module
 *   when two groups read it). Statements, enums, namespaces, exports and
 *   code the source never read stay.
 * - Every other output takes what its roots (a split option's value, a
 *   server-function handler, …) read, transitively, with one home per
 *   declaration: what the env module keeps is imported from it; what one
 *   output alone needs moves there; what several need is one shared module
 *   they import (`?tsr-split=shared---<keys>`, one per file); import
 *   specifiers are copied where they are read. A provider output (another
 *   layer's instance of the module) copies what it reaches.
 * - A derived output that would assign a binding it imports (`main` fails
 *   such a build) does not take the root bringing that code: the root falls
 *   back (`Placement.fallbacks`) and its planner keeps it in place.
 *
 * Why this is never worse than `main` on input `main` compiles correctly:
 * each declaration but an import exists in one module (one instance, its
 * initialiser runs once), every statement runs once in the env module, and
 * a declaration leaves the env module when `main` removes it there or moves
 * it to its shared module (a class: also when `main` copies it).
 * Where `main` copies a declaration into a chunk (a copy of state it keeps
 * in the route file, a class, a top-level statement), the chunk imports the
 * route file's instance instead.
 */
import { deriveId } from './identity'
import { buildClusters } from './placement/clusters'
import { readIndex } from './placement/reads'
import type { ClusterId } from './placement/clusters'
import type {
  Fallback,
  Home,
  OutputDecl,
  Placement,
  PlacementInput,
  RootRef,
} from './reach'
import type { SymbolId } from './symbols'
import type { RegionId, UnitId } from './units'
import type { OutputId } from './rewrite'

/** The reference kinds that keep a declaration: reads, writes, JSX tags, export specifiers. */
const KEEPS = new Set([
  'value',
  'write',
  'jsxTag',
  'exportSpecifier',
  'implicitJsxFactory',
])

export function computeRoutePlacement(input: PlacementInput): Placement {
  const { t1, rewrites, outputs } = input
  const { units, items } = t1
  const graph = buildClusters(input, true)
  const reads = readIndex(input, graph)
  const { clusters, clusterOfSym } = graph
  const gens = rewrites.generated

  // ---- what each cluster is -------------------------------------------------
  /** The output a generated unit is homed in by its planner. */
  const fixedHome = new Map<ClusterId, OutputId>()
  /** Generated units with `env-readers` homes (decided last). */
  const envReaders: Array<ClusterId> = []
  for (const g of gens) {
    const c = graph.clusterOfGen.get(g.id)!
    if (typeof g.home === 'string' && g.home !== 'auto') {
      fixedHome.set(c, g.home)
    } else if (typeof g.home === 'object') {
      envReaders.push(c)
    }
  }
  /**
   * `main`'s removal rule applies to it: import specifiers, declarators,
   * function and class declarations, and the declarations planners generate
   * where they are read (a planner's `auto` home).
   */
  const removable = (c: ClusterId): boolean => {
    const cl = clusters[c]!
    if (fixedHome.has(c) || envReaders.includes(c)) {
      return false
    }
    if (cl.units.length === 0) {
      return cl.gens.some(
        (g) =>
          gens[g]!.declares.length > 0 || (gens[g]!.imports ?? []).length > 0,
      )
    }
    // (a type merged with the binding, `import { type X }` beside
    // `function X`, is TypeScript's: it decides nothing)
    const values = cl.units.filter((u) => units[u]!.kind !== 'type')
    return values.every((u) => {
      const unit = units[u]!
      return (
        unit.kind === 'import-specifier' ||
        (unit.kind === 'declaration' &&
          (unit.node.type === 'VariableDeclarator' ||
            unit.node.type === 'FunctionDeclaration' ||
            unit.node.type === 'ClassDeclaration'))
      )
    })
  }
  const isType = (c: ClusterId) => clusters[c]!.kind === 'type'
  /** Copied where it is read: an import specifier, a planner's generated import. */
  const isImport = (c: ClusterId) => clusters[c]!.kind === 'import'

  // ---- what the source reads (provenance) ----------------------------------
  // a declaration is "read in the source" when code that is itself read (or
  // a statement, an export) reads or writes it: code already dead stays as
  // written, in the env module only
  const sourceLive = new Set<ClusterId>()
  {
    const work: Array<ClusterId> = []
    for (const cl of clusters) {
      if (
        cl.units.length > 0 &&
        !isType(cl.id) &&
        (!removable(cl.id) ||
          cl.units.some((u) => units[u]!.exported.length > 0))
      ) {
        sourceLive.add(cl.id)
        work.push(cl.id)
      }
    }
    while (work.length > 0) {
      const c = work.pop()!
      for (const u of clusters[c]!.units) {
        for (const ref of t1.refs.refsIn(units[u]!.range)) {
          const t = KEEPS.has(ref.kind) ? clusterOfSym.get(ref.sym) : undefined
          if (t !== undefined && t !== c && !sourceLive.has(t)) {
            sourceLive.add(t)
            work.push(t)
          }
        }
      }
    }
    // a value import the source uses only in type positions (TypeScript
    // erases it): read, so it leaves with its readers, as on `main`
    for (const cl of clusters) {
      if (
        cl.units.length > 0 &&
        cl.units.every((u) => units[u]!.kind === 'import-specifier') &&
        [...cl.declares].every(
          (s) => (t1.symbols.binding(s)?.references.length ?? 0) > 0,
        )
      ) {
        sourceLive.add(cl.id)
      }
    }
  }

  // ---- the env module --------------------------------------------------------
  const derived = [...outputs.values()].filter(
    (o) => o.id !== 'env' && o.kind !== 'export',
  )
  const rootedElsewhere = new Set<ClusterId>()
  for (const o of derived) {
    for (const r of o.roots) {
      if (r.t === 'gen') {
        rootedElsewhere.add(graph.clusterOfGen.get(r.id)!)
      }
    }
  }
  const env = new Set<ClusterId>()
  const envWork: Array<ClusterId> = []
  const keepInEnv = (c: ClusterId | undefined) => {
    if (c !== undefined && !env.has(c) && !isType(c)) {
      const home = fixedHome.get(c)
      if (home !== undefined && home !== 'env') {
        return
      }
      env.add(c)
      envWork.push(c)
    }
  }
  for (const cl of clusters) {
    const c = cl.id
    if (envReaders.includes(c) || isType(c)) {
      continue
    }
    if (fixedHome.get(c) === 'env') {
      keepInEnv(c)
    } else if (fixedHome.has(c)) {
      continue
    } else if (cl.units.length > 0) {
      // a statement, a class, an export, or a declaration the source never read
      if (
        !removable(c) ||
        !sourceLive.has(c) ||
        cl.units.some((u) => units[u]!.exported.length > 0)
      ) {
        keepInEnv(c)
      }
    } else if (!removable(c) && !rootedElsewhere.has(c) && cl.gens.length > 0) {
      // a planner's generated effect no output roots
      keepInEnv(c)
    }
  }
  for (const r of outputs.get('env')!.roots) {
    keepInEnv(
      r.t === 'unit'
        ? graph.clusterOfRegion.get(units[r.id]!.region)
        : r.t === 'gen'
          ? graph.clusterOfGen.get(r.id)
          : clusterOfSym.get(r.id),
    )
  }
  while (envWork.length > 0) {
    const c = envWork.pop()!
    const r = reads.clusterReads(c, 'env', true)
    for (const s of r.syms) {
      keepInEnv(clusterOfSym.get(s))
    }
    for (const child of r.children) {
      keepInEnv(child)
    }
  }

  // ---- the derived outputs: what each needs ----------------------------------
  const copying = (o: OutputId) => outputs.get(o)?.kind === 'provider'
  /** The roots of a derived output: what its planners rooted there, and the generated units homed there. */
  const rootsOf = (o: OutputDecl): Array<RootRef> => [
    ...o.roots,
    ...gens
      .filter((g) => g.home === o.id)
      .map((g) => ({ t: 'gen' as const, id: g.id })),
  ]
  /**
   * What output `o` takes from `roots`, transitively: everything they read
   * but what another module of the file holds (the env module, or a
   * generated unit's own home: imported) and types.
   */
  const reachFrom = (
    o: OutputId,
    roots: ReadonlyArray<RootRef>,
  ): Set<ClusterId> => {
    const seen = new Set<ClusterId>()
    const work: Array<ClusterId> = []
    const take = (c: ClusterId) => {
      if (!seen.has(c)) {
        seen.add(c)
        work.push(c)
      }
    }
    const read = (t: ClusterId | undefined) => {
      if (t === undefined || seen.has(t) || isType(t)) {
        return
      }
      const home = fixedHome.get(t)
      if (home !== undefined && home !== o) {
        return // imported from its home
      }
      if (!copying(o) && env.has(t) && !isImport(t)) {
        return // imported from the env module
      }
      take(t)
    }
    for (const r of roots) {
      if (r.t === 'sym') {
        read(clusterOfSym.get(r.id))
      } else {
        take(
          r.t === 'unit'
            ? graph.clusterOfRegion.get(units[r.id]!.region)!
            : graph.clusterOfGen.get(r.id)!,
        )
      }
    }
    while (work.length > 0) {
      const c = work.pop()!
      const r = reads.clusterReads(c, o, true)
      for (const s of r.syms) {
        read(clusterOfSym.get(s))
      }
      for (const child of r.children) {
        read(child)
      }
    }
    return seen
  }
  /** Derived outputs (not copying) reaching each declaration the env module does not keep. */
  const needers = new Map<ClusterId, Set<OutputId>>()
  const reached = new Map<OutputId, Set<ClusterId>>()
  for (const o of derived) {
    const seen = reachFrom(o.id, rootsOf(o))
    reached.set(o.id, seen)
    if (!copying(o.id)) {
      for (const c of seen) {
        if (!isImport(c) && !fixedHome.has(c)) {
          let set = needers.get(c)
          if (!set) {
            needers.set(c, (set = new Set()))
          }
          set.add(o.id)
        }
      }
    }
  }

  // ---- homes ------------------------------------------------------------------
  const home = new Map<ClusterId, Home>()
  const created: Array<OutputDecl> = []
  let shared: OutputDecl | null = null
  const sharedKeys = new Set<string>()
  for (const [c, set] of needers) {
    if (set.size === 1) {
      home.set(c, [...set][0]!)
    } else {
      for (const o of set) {
        sharedKeys.add(outputs.get(o)!.key)
      }
      home.set(c, 'shared' as OutputId) // resolved below
    }
  }
  if (sharedKeys.size > 0) {
    const key = [...sharedKeys].sort().join('+')
    const derivedId = deriveId(input.canonicalId, {
      kind: 'shared',
      value: key,
    })
    shared = {
      id: `derived:${derivedId}`,
      kind: 'shared',
      key: `shared~${key}`,
      derivedId,
      roots: [],
    }
    created.push(shared)
    for (const [c, h] of home) {
      if (h === ('shared' as OutputId)) {
        home.set(c, shared.id)
      }
    }
  }
  for (const c of env) {
    home.set(c, 'env')
  }
  for (const [c, h] of fixedHome) {
    home.set(c, h)
  }
  for (const cl of clusters) {
    if (!home.has(cl.id)) {
      home.set(cl.id, isImport(cl.id) ? 'duplicate' : 'removed')
    }
  }

  // ---- inclusion and imports ----------------------------------------------------
  const included = new Map<OutputId, Set<ClusterId>>()
  const imports = new Map<OutputId, Map<OutputId, Set<SymbolId>>>()
  const exportsNeeded = new Map<OutputId, Set<SymbolId>>()
  const importFrom = (o: OutputId, h: OutputId, s: SymbolId) => {
    let byHome = imports.get(o)
    if (!byHome) {
      imports.set(o, (byHome = new Map()))
    }
    let syms = byHome.get(h)
    if (!syms) {
      byHome.set(h, (syms = new Set()))
    }
    syms.add(s)
    let exported = exportsNeeded.get(h)
    if (!exported) {
      exportsNeeded.set(h, (exported = new Set()))
    }
    exported.add(s)
  }
  included.set('env', env)
  const all: Array<OutputId> = [
    ...derived.map((o) => o.id),
    ...created.map((o) => o.id),
  ]
  for (const o of all) {
    const set = new Set<ClusterId>()
    included.set(o, set)
    if (copying(o)) {
      for (const c of reached.get(o)!) {
        set.add(c)
      }
    } else {
      for (const [c, h] of home) {
        if (h === o) {
          set.add(c)
        }
      }
    }
  }
  // what each output reads that it does not hold: imported from its home
  // (an import specifier is copied where it is read)
  for (const o of ['env' as OutputId, ...all]) {
    const set = included.get(o)!
    const work = [...set]
    while (work.length > 0) {
      const c = work.pop()!
      for (const s of reads.clusterReads(c, o, true).syms) {
        const t = clusterOfSym.get(s)
        if (t === undefined || set.has(t) || isType(t)) {
          continue
        }
        const h = home.get(t)
        if (isImport(t) || h === undefined || h === 'removed' || h === o) {
          // (a read of what no output holds: as `main`, the name stays unbound)
          if (isImport(t)) {
            set.add(t)
            work.push(t)
          }
          continue
        }
        importFrom(o, h as OutputId, s)
      }
    }
  }
  // route HMR's registration: every derived output importing a binding of
  // the env module other than the ones it names
  for (const c of envReaders) {
    const besides = new Set(
      clusters[c]!.gens.flatMap((g) => {
        const h = gens[g]!.home
        return typeof h === 'object' ? [...h.besides] : []
      }),
    )
    for (const o of all) {
      const fromEnv = imports.get(o)?.get('env')
      if (fromEnv && [...fromEnv].some((s) => !besides.has(s))) {
        included.get(o)!.add(c)
      }
    }
  }

  // ---- an output that would assign a binding it imports --------------------
  // A module cannot assign a binding it imports: a derived output that would
  // assign (`=`, `++`, `+=`, …) a binding another module of the file holds
  // does not take the root that brings that code (a split option's value, a
  // server function's handler, `<Hydrate>` children). The root falls back:
  // its planner keeps it in place in the next round. One check of the
  // outcome, on the write table every placement shares.
  const writers = new Map<ClusterId, SymbolId>()
  for (const w of graph.writes) {
    const c = w.owner === null ? undefined : graph.clusterOfRegion.get(w.owner)
    const d = clusterOfSym.get(w.sym)
    const h = c === undefined ? undefined : home.get(c)
    if (
      !w.member &&
      !w.augment &&
      c !== undefined &&
      d !== undefined &&
      c !== d &&
      h !== undefined &&
      h !== 'env' &&
      h !== 'removed' &&
      h !== 'duplicate' &&
      !copying(h) &&
      home.get(d) !== h
    ) {
      writers.set(c, w.sym)
    }
  }
  const fallbacks: Array<Fallback> = []
  if (writers.size > 0) {
    const fellBack = new Set<RegionId>()
    const fallBack = (region: RegionId, binding: SymbolId) => {
      if (!fellBack.has(region)) {
        fellBack.add(region)
        fallbacks.push({ region, reason: 'shared-writer', binding })
      }
    }
    for (const o of derived) {
      if (copying(o.id)) {
        continue
      }
      for (const root of rootsOf(o)) {
        let binding: SymbolId | undefined
        for (const c of reachFrom(o.id, [root])) {
          binding ??= writers.get(c)
        }
        if (binding === undefined) {
          continue
        }
        // the root's place in the source: its claimed text, or the
        // declaration of the binding it names
        if (root.t === 'gen') {
          for (const r of clusters[graph.clusterOfGen.get(root.id)!]!.regions) {
            if (rewrites.claims.has(r)) {
              fallBack(r, binding)
            }
          }
        } else if (root.t === 'sym') {
          for (const u of t1.declaringUnits.get(root.id) ?? []) {
            if (units[u]!.kind !== 'type') {
              fallBack(units[u]!.region, binding)
            }
          }
        } else {
          fallBack(units[root.id]!.region, binding)
        }
      }
    }
  }

  // ---- TypeScript-only specifiers leave with their statement's values -------
  const droppedTypeUnits = new Set<UnitId>()
  units.forEach((unit, u) => {
    if (unit.kind !== 'type') {
      return
    }
    const inlineImportSpecifier =
      unit.importIndex !== null &&
      (items[unit.item]!.node as { importKind?: string }).importKind !== 'type'
    const typeOnlyExportSpecifier =
      unit.node.type === 'ExportSpecifier' && unit.node.exportKind !== 'type'
    if (inlineImportSpecifier || typeOnlyExportSpecifier) {
      droppedTypeUnits.add(u)
    }
  })

  return {
    clusterOfRegion: graph.clusterOfRegion,
    clusterOfGen: graph.clusterOfGen,
    home,
    included,
    imports,
    exportsNeeded,
    fallbacks,
    created,
    extracted: [],
    kept: [],
    droppedTypeUnits,
    check: () => undefined,
  }
}
