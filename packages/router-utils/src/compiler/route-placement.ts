/**
 * Placement of a route file (`PlanContext.setRouteModule`): what route code
 * splitting on `main` does, by its outcome, on the core's analysis
 * (spec-main-splitting 1.1-1.8).
 *
 * - The env module (the route file) keeps its top-level statements, exports,
 *   enums and namespaces (R154), and the declarations and import specifiers
 *   they reach, transitively; every other declaration leaves it, with its
 *   initialiser and the imports only it read (a split value's declaration
 *   included, whatever only unreached code reads it).
 *   An exported name `main` shares that nothing else there reads moves to
 *   the shared module, which the env module re-exports it from.
 * - A split chunk takes what its option's value reads, transitively. What
 *   the env module also keeps, the chunk imports from it when `main`
 *   imports it (the route binding, `export const|let|var`, the names `main`
 *   shares: `RouteModule.imported`) and copies otherwise, with the
 *   statements reading or writing what it copies (`main`'s second instance,
 *   in `main`'s shapes, 1.8). What the env module does not keep has one
 *   home: the one chunk needing it, or one shared module the chunks needing
 *   it import (`?tsr-split=shared---<keys>`, one per file). Import
 *   specifiers are copied where they are read.
 * - Another planner's derived output (a server function's, `<Hydrate>`
 *   children's) imports what the env module keeps; a provider output
 *   (another layer's instance of the module) copies what it reaches.
 * - A derived output that would assign a binding it imports (`main` fails
 *   such a build: a shared `let`, an `export let`) does not take the root
 *   bringing that code: the root falls back (`Placement.fallbacks`) and its
 *   planner keeps it in place.
 */
import { deriveId } from './identity'
import { buildClusters } from './placement/clusters'
import { readIndex } from './placement/reads'
import type { ClusterId } from './placement/clusters'
import type {
  ExtractedExport,
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

export function computeRoutePlacement(input: PlacementInput): Placement {
  const { t1, rewrites, outputs } = input
  const { imported, shared: sharedNames } = input.routeModule!
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
   * function and class declarations, and the declarations and imports
   * planners generate without an effect, where they are read (a planner's
   * `auto` home).
   */
  const removable = (c: ClusterId): boolean => {
    const cl = clusters[c]!
    if (fixedHome.has(c) || envReaders.includes(c)) {
      return false
    }
    if (cl.units.length === 0) {
      // a declaration or an import a planner generates; one with an effect
      // (route HMR's block, with its own helper import) is a statement
      return cl.gens.every(
        (g) =>
          !gens[g]!.effectful &&
          (gens[g]!.declares.length > 0 || (gens[g]!.imports ?? []).length > 0),
      )
    }
    // (a type merged with the binding, `import { type X }` beside
    // `function X`, and a function's overload signatures are TypeScript's:
    // they decide nothing)
    const values = cl.units.filter(
      (u) =>
        units[u]!.kind !== 'type' &&
        units[u]!.node.type !== 'TSDeclareFunction',
    )
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

  /** What a chunk imports from the env module rather than copying it (`RouteModule.imported`). */
  const importedFromEnv = (c: ClusterId) =>
    [...clusters[c]!.declares].some((s) => imported.has(s))

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
  /** What the env module keeps reads, transitively. */
  const closeEnv = () => {
    while (envWork.length > 0) {
      const r = reads.clusterReads(envWork.pop()!, 'env', true)
      for (const s of r.syms) {
        keepInEnv(clusterOfSym.get(s))
      }
      for (const child of r.children) {
        keepInEnv(child)
      }
    }
  }
  /**
   * Exported declarations of names `main` shares: `main` moves them to its
   * shared module and the route file re-exports them from there; so here,
   * unless the env module keeps them for another reader.
   */
  const sharedExports: Array<ClusterId> = []
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
      // a statement or an export stays (R154); a declaration stays when
      // something that stays reaches it
      const exported = cl.units.some((u) => units[u]!.exported.length > 0)
      if (
        exported &&
        removable(c) &&
        !isImport(c) &&
        [...cl.declares].every((s) => sharedNames.has(s))
      ) {
        sharedExports.push(c)
      } else if (!removable(c) || exported) {
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
  closeEnv()

  /** The statements of the env module reading or writing each declaration it keeps: a chunk copying the declaration copies them (`main`'s chunks keep the statements naming what they declare). */
  const statementsOf = new Map<ClusterId, Array<ClusterId>>()
  for (const c of env) {
    const cl = clusters[c]!
    if (cl.kind !== 'effect' || cl.units.length === 0) {
      continue
    }
    for (const s of reads.clusterReads(c, 'env', true).syms) {
      const t = clusterOfSym.get(s)
      if (t !== undefined && t !== c && env.has(t) && !isImport(t)) {
        statementsOf.set(t, [...(statementsOf.get(t) ?? []), c])
      }
    }
  }

  // ---- the derived outputs: what each needs ----------------------------------
  const copying = (o: OutputId) => outputs.get(o)?.kind === 'provider'
  /** A split chunk: it copies what the env module keeps but `main` would not import. */
  const isChunk = (o: OutputId) => outputs.get(o)?.kind === 'split'
  /** The roots of a derived output: what its planners rooted there, and the generated units homed there. */
  const rootsOf = (o: OutputDecl): Array<RootRef> => [
    ...o.roots,
    ...gens
      .filter((g) => g.home === o.id)
      .map((g) => ({ t: 'gen' as const, id: g.id })),
  ]
  /**
   * What output `o` takes from `roots`, transitively: everything they read
   * but types and what another module of the file holds (a generated
   * unit's own home; the env module, but what a chunk copies from it:
   * imported).
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
        // (so is what a statement declaring a `var` names, `if (…) { var
        // flag = … }`: `main` deletes that declarator from the route file,
        // which runs the rest of the statement; a copy of the statement
        // would run it twice)
        if (
          !isChunk(o) ||
          importedFromEnv(t) ||
          clusters[t]!.kind === 'effect' ||
          (statementsOf.get(t) ?? []).some(
            (st) => clusters[st]!.declares.size > 0,
          )
        ) {
          return // imported from the env module
        }
        // copied, with the statements naming it
        for (const s of statementsOf.get(t) ?? []) {
          take(s)
        }
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
  // the shared exports the env module does not keep, and what they read:
  // in the shared module, whoever else reads them
  const exportedShared = sharedExports.filter((c) => !env.has(c))
  const SHARED = 'shared' as OutputId
  if (exportedShared.length > 0) {
    const roots = exportedShared.map((c) => ({
      t: 'sym' as const,
      id: [...clusters[c]!.declares][0]!,
    }))
    for (const c of reachFrom(SHARED, roots)) {
      if (!isImport(c) && !fixedHome.has(c) && !env.has(c)) {
        needers.set(c, new Set([SHARED]))
      }
    }
  }
  for (const o of derived) {
    const seen = reachFrom(o.id, rootsOf(o))
    reached.set(o.id, seen)
    if (!copying(o.id)) {
      for (const c of seen) {
        if (!isImport(c) && !fixedHome.has(c) && !env.has(c)) {
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
    if (set.size === 1 && !set.has(SHARED)) {
      home.set(c, [...set][0]!)
    } else {
      for (const o of set) {
        if (o !== SHARED) {
          sharedKeys.add(outputs.get(o)!.key)
        }
      }
      home.set(c, SHARED) // resolved below
    }
  }
  if ([...home.values()].includes(SHARED)) {
    const key = [...sharedKeys].sort().join('+') || 'export'
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
      if (h === SHARED) {
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
      // what a chunk copies from the env module
      for (const c of reached.get(o) ?? []) {
        if (env.has(c) && !isImport(c)) {
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
    if (
      w.member ||
      w.augment ||
      c === undefined ||
      d === undefined ||
      c === d
    ) {
      continue
    }
    for (const h of all) {
      const set = included.get(h)!
      if (
        !copying(h) &&
        set.has(c) &&
        !set.has(d) &&
        home.get(d) !== 'removed' &&
        // (a write in text that output erases, a client's stubbed server-fn
        // handler, assigns nothing there)
        !graph.viewOf(h).isErasedAt(w.at)
      ) {
        writers.set(c, w.sym)
      }
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

  // ---- the shared exports: re-exported by the env module ---------------------
  const extracted: Array<ExtractedExport> = []
  if (shared !== null) {
    const { id } = shared
    const syms = exportedShared
      .filter((c) => home.get(c) === id)
      .flatMap((c) => [...clusters[c]!.declares])
    if (syms.length > 0) {
      extracted.push({ output: id, syms })
      let exported = exportsNeeded.get(id)
      if (!exported) {
        exportsNeeded.set(id, (exported = new Set()))
      }
      for (const s of syms) {
        exported.add(s)
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
    extracted,
    kept: [],
    droppedTypeUnits,
    check: () => undefined,
  }
}
