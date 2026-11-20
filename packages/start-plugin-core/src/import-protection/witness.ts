/**
 * Survival witness readers: which edge modules survived tree-shaking, read from
 * the bundler after linking, and the bundler's graph for traces. An edge module
 * survives when it owns a used export (`renderedExports` on Rolldown, used
 * exports on Rspack) or, when its target is effectful, when it is in a chunk at
 * all (the `__fx` effect witness is kept iff its importer is evaluated).
 *
 * Structural types only: the readers take what Vite's `generateBundle` and
 * Rspack's `processAssets` hand the host.
 */
import type { EdgeModuleIds } from './edge-modules'
import type { ImportGraphView } from './graph-trace'

/** An edge module as the readers see it: its key and whether its target is effectful. */
interface WitnessModule {
  key: string
  effectful: boolean
}

export type WitnessLookup = (idOrResource: string) => WitnessModule | null

/** Builds the lookup of an environment's edge modules from the host's ids and the registry. */
export function witnessLookup(
  ids: EdgeModuleIds,
  env: string,
  effectfulOf: (key: string) => boolean | null,
): WitnessLookup {
  return (id) => {
    const ref = ids.parse(id)
    if (!ref || ref.kind !== 'edge' || ref.env !== env) {
      return null
    }
    const effectful = effectfulOf(ref.key)
    return effectful === null ? null : { key: ref.key, effectful }
  }
}

// ---------------------------------------------------------------------------
// Vite / Rolldown
// ---------------------------------------------------------------------------

interface RolldownRenderedModule {
  renderedExports: ReadonlyArray<string>
}

interface RolldownOutputChunk {
  type: 'chunk'
  modules: Record<string, RolldownRenderedModule>
}

type RolldownOutputBundle = Record<
  string,
  RolldownOutputChunk | { type: 'asset' }
>

/** The keys of the edge modules that survived a Rolldown build (`generateBundle`), sorted. */
export function readRolldownWitness(
  bundle: RolldownOutputBundle,
  lookup: WitnessLookup,
): Array<string> {
  const live = new Set<string>()
  for (const out of Object.values(bundle)) {
    if (out.type !== 'chunk') {
      continue
    }
    for (const [id, m] of Object.entries(out.modules)) {
      const edge = lookup(id)
      if (edge && (m.renderedExports.length > 0 || edge.effectful)) {
        live.add(edge.key)
      }
    }
  }
  return [...live].sort()
}

interface RollupModuleInfoLike {
  importers: ReadonlyArray<string>
  dynamicImporters: ReadonlyArray<string>
  isEntry: boolean
}

/** The module graph of a Rolldown build for traces (`this.getModuleInfo`). */
export function rolldownGraphView(
  getModuleInfo: (id: string) => RollupModuleInfoLike | null,
): ImportGraphView {
  return {
    importers(id) {
      const info = getModuleInfo(id)
      return info ? [...info.importers, ...info.dynamicImporters] : []
    },
    isEntry: (id) => getModuleInfo(id)?.isEntry === true,
  }
}

// ---------------------------------------------------------------------------
// Rspack
// ---------------------------------------------------------------------------

interface RspackModuleLike {
  resource?: string
  /** The module's Rspack layer (`null`: none). */
  layer?: string | null
  /** Inner modules of a ConcatenatedModule. */
  modules?: Iterable<RspackModuleLike>
  /** The module a ConcatenatedModule stands in for (it has no `resource` of its own). */
  rootModule?: RspackModuleLike
}

interface RspackChunkLike {
  runtime?: Iterable<string> | string
}

interface RspackConnectionLike {
  originModule: RspackModuleLike | null
  /** The imported module as resolved (an inner module, when the connection moved to its ConcatenatedModule). */
  resolvedModule?: RspackModuleLike | null
  dependency?: unknown
}

interface RspackCompilationLike {
  chunks: Iterable<RspackChunkLike>
  modules: Iterable<RspackModuleLike>
  chunkGraph: {
    getChunkModules: (chunk: RspackChunkLike) => Iterable<RspackModuleLike>
  }
  moduleGraph: {
    getUsedExports: (
      module: RspackModuleLike,
      runtime: Array<string> | string | undefined,
    ) => ReadonlyArray<string> | boolean | null
    getIncomingConnections: (
      module: RspackModuleLike,
    ) => Iterable<RspackConnectionLike>
    getModule: (dependency: unknown) => RspackModuleLike | null
    /** The module a dependency belongs to (the inner module of a ConcatenatedModule). */
    getParentModule: (dependency: unknown) => RspackModuleLike | null
  }
  entries: { values: () => Iterable<{ dependencies: Iterable<unknown> }> }
}

function runtimesOf(compilation: RspackCompilationLike): Array<string> {
  const out = new Set<string>()
  for (const chunk of compilation.chunks) {
    const r = chunk.runtime
    if (typeof r === 'string') {
      out.add(r)
    } else if (r) {
      for (const name of r) {
        out.add(name)
      }
    }
  }
  return [...out]
}

/** The layer of a module (an inner module of a ConcatenatedModule without one of its own: its holder's). */
const layerOf = (
  inner: RspackModuleLike,
  holder: RspackModuleLike,
): string | undefined => inner.layer ?? holder.layer ?? undefined

/**
 * The keys of the edge modules that survived an Rspack compilation
 * (`processAssets`, any stage: graph readings do not depend on it), by
 * compile environment (`envOf`: of a module's layer; `lookups`: each
 * environment's), sorted. Only modules in a chunk can survive (concatenated
 * inner modules included); a used export or an effectful target makes it
 * live; `null` used exports (usedExports off) leave it to inclusion. A file
 * in two layers is a module of each environment.
 */
export function readRspackWitness(
  compilation: RspackCompilationLike,
  lookups: ReadonlyMap<string, WitnessLookup>,
  envOf: (layer: string | undefined) => string,
  idOf: (resource: string) => string = (resource) => resource,
): Map<string, Array<string>> {
  const inChunk = new Map<
    string,
    { env: string; module: RspackModuleLike; edge: WitnessModule }
  >()
  for (const chunk of compilation.chunks) {
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      for (const inner of m.modules ?? [m]) {
        const res = inner.resource
        if (!res) {
          continue
        }
        const env = envOf(layerOf(inner, m))
        const key = `${env}\0${res}`
        const lookup = lookups.get(env)
        if (!lookup || inChunk.has(key)) {
          continue
        }
        const edge = lookup(idOf(res))
        if (edge) {
          inChunk.set(key, { env, module: inner, edge })
        }
      }
    }
  }
  const runtimes = runtimesOf(compilation)
  const live = new Map<string, Set<string>>()
  for (const { env, module, edge } of inChunk.values()) {
    const used = compilation.moduleGraph.getUsedExports(module, runtimes)
    if (
      used === true ||
      used === null ||
      (Array.isArray(used) && used.length > 0) ||
      edge.effectful
    ) {
      let keys = live.get(env)
      if (!keys) {
        keys = new Set()
        live.set(env, keys)
      }
      keys.add(edge.key)
    }
  }
  const out = new Map<string, Array<string>>()
  for (const env of lookups.keys()) {
    out.set(env, [...(live.get(env) ?? [])].sort())
  }
  return out
}

/**
 * The files (by `idOf`) with a module in each of the compile environments
 * `envs` (`envOf`: of a module's layer), concatenated inner modules included.
 */
export function rspackFilesIn(
  compilation: Pick<RspackCompilationLike, 'modules'>,
  idOf: (resource: string) => string,
  envOf: (layer: string | undefined) => string,
  envs: ReadonlyArray<string>,
): Array<string> {
  const found = new Map<string, Set<string>>()
  for (const m of compilation.modules) {
    for (const inner of [m, ...(m.modules ?? [])]) {
      const env = inner.resource ? envOf(layerOf(inner, m)) : null
      if (env === null || !envs.includes(env)) {
        continue
      }
      const id = idOf(inner.resource!)
      let seen = found.get(id)
      if (!seen) {
        seen = new Set()
        found.set(id, seen)
      }
      seen.add(env)
    }
  }
  return [...found].flatMap(([id, seen]) =>
    seen.size === envs.length ? [id] : [],
  )
}

/**
 * The client-reference handoff into a compile environment: the environment
 * whose server components render its client references (`from`), and the
 * files that are client references there (`'use client'`). Rspack's RSC
 * plugin adds a `'use client'` file's SSR-layer module for the RSC layer's
 * client reference, with no importer of its own: the server component that
 * imports the file in `from` is its importer.
 */
export interface ClientReferenceHandoff {
  from: string
  clientReferences: ReadonlySet<string>
}

/**
 * The module graph of an Rspack compilation for traces, of one compile
 * environment (by resource, as the host's ids name it: `idOf`; entries from
 * `compilation.entries`). `scope`: the environment and the one of a layer
 * (`envOf`). An id's importers are those of the environment's modules of
 * it (a file in two layers is a module of each), of its modules in each
 * environment an importer of another layer was found in (an issuer-layer
 * rule: an SSR-layer module importing the RSC layer's server-fn module; the
 * walk goes on in the layer it reached the file in), and, for a client
 * reference of `handoff`, of its modules in `handoff.from`. Without `scope`,
 * every module of an id.
 */
export function rspackGraphView(
  compilation: RspackCompilationLike,
  idOf: (resource: string) => string = (resource) => resource,
  scope?: {
    env: string
    envOf: (layer: string | undefined) => string
    handoff?: ClientReferenceHandoff
  },
): ImportGraphView {
  // a production module can also be an inner module of a ConcatenatedModule (scope hoisting),
  // which holds the connections from outside the concatenation
  let byResource: Map<
    string,
    Array<{ module: RspackModuleLike; env: string | null }>
  > | null = null
  let entries: Set<string> | null = null
  /** The environments of other layers each importer was found in (`importers`). */
  const reached = new Map<string, Set<string>>()
  /** The modules of an id whose importers are its importers in the environment (see `rspackGraphView`). */
  const modulesOf = (id: string): Array<RspackModuleLike> => {
    if (!byResource) {
      byResource = new Map()
      for (const m of compilation.modules) {
        for (const inner of [m, ...(m.modules ?? [])]) {
          if (!inner.resource) {
            continue
          }
          const key = idOf(inner.resource)
          let list = byResource.get(key)
          if (!list) {
            list = []
            byResource.set(key, list)
          }
          const env = scope ? scope.envOf(layerOf(inner, m)) : null
          for (const holder of inner === m ? [m] : [inner, m]) {
            if (!list.some((one) => one.module === holder)) {
              list.push({ module: holder, env })
            }
          }
        }
      }
    }
    const all = byResource.get(id) ?? []
    if (!scope) {
      return all.map((one) => one.module)
    }
    const envs = new Set(reached.get(id))
    envs.add(scope.env)
    if (scope.handoff?.clientReferences.has(id)) {
      envs.add(scope.handoff.from)
    }
    return all.filter((one) => envs.has(one.env!)).map((one) => one.module)
  }
  const { moduleGraph } = compilation
  return {
    importers(id) {
      const out: Array<string> = []
      const visit = (m: RspackModuleLike, viaContext: boolean) => {
        for (const c of moduleGraph.getIncomingConnections(m)) {
          // a ConcatenatedModule holds the connections of each of its inner modules
          const target = c.resolvedModule?.resource
          if (target !== undefined && idOf(target) !== id) {
            continue
          }
          // the importing module itself, inside a ConcatenatedModule origin
          const origin =
            (c.dependency !== undefined
              ? moduleGraph.getParentModule(c.dependency)
              : null) ?? c.originModule
          const res = origin?.resource && idOf(origin.resource)
          if (res) {
            if (res !== id && !out.includes(res)) {
              out.push(res)
            }
            // the walk goes on in the importer's layer
            const env =
              scope &&
              origin &&
              scope.envOf(layerOf(origin, c.originModule ?? origin))
            if (env && env !== scope.env) {
              let envs = reached.get(res)
              if (!envs) {
                envs = new Set()
                reached.set(res, envs)
              }
              envs.add(env)
            }
          } else if (origin && !viaContext) {
            // a context module (`import.meta.webpackContext`, a template
            // literal `import()`): the modules importing it import `id`
            visit(origin, true)
          }
        }
      }
      for (const m of modulesOf(id)) {
        visit(m, false)
      }
      return out
    },
    isEntry(id) {
      if (!entries) {
        entries = new Set()
        for (const entry of compilation.entries.values()) {
          for (const dep of entry.dependencies) {
            // a production entry is usually a ConcatenatedModule (scope hoisting)
            const m = compilation.moduleGraph.getModule(dep)
            const res = m?.resource ?? m?.rootModule?.resource
            if (res) {
              entries.add(idOf(res))
            }
          }
        }
      }
      return entries.has(id)
    },
  }
}
