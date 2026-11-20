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
import type { GraphNode, NodeGraph } from './graph-trace'

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

/**
 * The module graph of the Rolldown build of environment `env`
 * (`this.getModuleInfo`): another environment's nodes are not readable
 * there (null).
 */
export function rolldownNodeGraph(
  env: string,
  getModuleInfo: (id: string) => RollupModuleInfoLike | null,
): NodeGraph {
  return {
    importers(node) {
      if (node.env !== env) {
        return null
      }
      const info = getModuleInfo(node.id)
      return info
        ? [...info.importers, ...info.dynamicImporters].map((id) => ({
            env,
            id,
          }))
        : []
    },
    isEntry: (node) =>
      node.env === env && getModuleInfo(node.id)?.isEntry === true,
  }
}

// ---------------------------------------------------------------------------
// Rspack
// ---------------------------------------------------------------------------

export interface RspackModuleLike {
  resource?: string
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
  /** The child compilations (a worker plugin's), done during `make`. */
  children?: Iterable<RspackCompilationLike>
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

/**
 * The compile environment of a module of an Rspack compilation, from the
 * host (`holder`: the ConcatenatedModule of an inner module, else the
 * module): an edge module's is the one its id names, any other module's
 * that of its layer.
 */
export type RspackEnvOf = (
  module: RspackModuleLike,
  holder: RspackModuleLike,
) => string

/**
 * The keys of the edge modules that survived an Rspack compilation
 * (`processAssets`, any stage: graph readings do not depend on it), by
 * compile environment (`envOf`; `lookups`: each environment's), sorted. Only modules in a chunk can survive (concatenated
 * inner modules included); a used export or an effectful target makes it
 * live; `null` used exports (usedExports off) leave it to inclusion. A file
 * in two layers is a module of each environment.
 */
export function readRspackWitness(
  compilation: RspackCompilationLike,
  lookups: ReadonlyMap<string, WitnessLookup>,
  envOf: RspackEnvOf,
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
        const env = envOf(inner, m)
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

/** An Rspack compilation's graph (`rspackNodeGraph`). */
export interface RspackNodeGraph extends NodeGraph {
  /** Whether `node` is a module of the compilation or of one of its child compilations (what `hold` keeps). */
  holds: (node: GraphNode) => boolean
  /** Whether `node` is a module of the compilation itself: one it can build again (the settlement decides it). */
  builds: (node: GraphNode) => boolean
}

/**
 * The module graph of an Rspack compilation and of its child compilations
 * (a worker plugin's, done during `make`: their modules are compiled as
 * this compiler's), of all their compile environments (`envOf`), by
 * canonical resource (`idOf`): a node's importers are the origins of the
 * connections into its modules (a file in two layers is a module of each;
 * a file in the compilation and in a child is one node, its importers
 * those of both), each a node of its own environment; entries are nodes
 * too (`entries` of each compilation). Its index is built on its first
 * read: a compilation with no denied module reads nothing. Readable once
 * the compilation's modules are built (`finishMake`, later hooks); a step
 * that builds modules again needs a new one.
 */
export function rspackNodeGraph(
  compilation: RspackCompilationLike,
  idOf: (resource: string) => string,
  envOf: RspackEnvOf,
): RspackNodeGraph {
  /** A module holding a node's connections, with the graph of its compilation. */
  interface Held {
    module: RspackModuleLike
    moduleGraph: RspackCompilationLike['moduleGraph']
  }
  const compilations = (): Array<RspackCompilationLike> => {
    const out = [compilation]
    for (const c of out) {
      out.push(...(c.children ?? []))
    }
    return out
  }
  // a production module can also be an inner module of a ConcatenatedModule (scope hoisting),
  // which holds the connections from outside the concatenation
  let byNode: Map<string, Array<Held>> | null = null
  /** The nodes of the compilation's own modules. */
  const own = new Set<string>()
  /** The environment of each module of the index (an inner module's, from its holder). */
  const envs = new Map<RspackModuleLike, string>()
  let entries: Set<string> | null = null
  const key = (env: string, id: string) => `${env}\0${id}`
  const index = (): Map<string, Array<Held>> => {
    if (!byNode) {
      byNode = new Map()
      for (const c of compilations()) {
        for (const m of c.modules) {
          for (const inner of [m, ...(m.modules ?? [])]) {
            if (!inner.resource) {
              continue
            }
            const env = envOf(inner, m)
            envs.set(inner, env)
            const k = key(env, idOf(inner.resource))
            if (c === compilation) {
              own.add(k)
            }
            let list = byNode.get(k)
            if (!list) {
              list = []
              byNode.set(k, list)
            }
            for (const holder of inner === m ? [m] : [inner, m]) {
              if (!list.some((h) => h.module === holder)) {
                list.push({ module: holder, moduleGraph: c.moduleGraph })
              }
            }
          }
        }
      }
    }
    return byNode
  }
  return {
    importers(node) {
      const out: Array<GraphNode> = []
      const seen = new Set<string>([key(node.env, node.id)])
      const visit = (
        m: RspackModuleLike,
        moduleGraph: Held['moduleGraph'],
        viaContext: boolean,
      ) => {
        for (const c of moduleGraph.getIncomingConnections(m)) {
          // a ConcatenatedModule holds the connections of each of its inner modules
          const target = c.resolvedModule
          if (
            target?.resource !== undefined &&
            (idOf(target.resource) !== node.id ||
              (envs.get(target) ?? envOf(target, target)) !== node.env)
          ) {
            continue
          }
          // the importing module itself, inside a ConcatenatedModule origin
          const origin =
            (c.dependency !== undefined
              ? moduleGraph.getParentModule(c.dependency)
              : null) ?? c.originModule
          if (origin?.resource) {
            const from = {
              env: envs.get(origin) ?? envOf(origin, c.originModule ?? origin),
              id: idOf(origin.resource),
            }
            const k = key(from.env, from.id)
            if (!seen.has(k)) {
              seen.add(k)
              out.push(from)
            }
          } else if (origin && !viaContext) {
            // a context module (`import.meta.webpackContext`, a template
            // literal `import()`): the modules importing it import `node`
            visit(origin, moduleGraph, true)
          }
        }
      }
      for (const { module, moduleGraph } of index().get(
        key(node.env, node.id),
      ) ?? []) {
        visit(module, moduleGraph, false)
      }
      return out
    },
    isEntry(node) {
      if (!entries) {
        entries = new Set()
        for (const c of compilations()) {
          for (const entry of c.entries.values()) {
            for (const dep of entry.dependencies) {
              // a production entry is usually a ConcatenatedModule (scope hoisting)
              const m = c.moduleGraph.getModule(dep)
              const module = m?.resource ? m : m?.rootModule
              if (m && module?.resource) {
                entries.add(key(envOf(module, m), idOf(module.resource)))
              }
            }
          }
        }
      }
      return entries.has(key(node.env, node.id))
    },
    holds: (node) => index().has(key(node.env, node.id)),
    builds(node) {
      index()
      return own.has(key(node.env, node.id))
    },
  }
}
