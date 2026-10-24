/**
 * Survival witness readers (DESIGN §3.14.4, R30; spike-j6-witness.md §5):
 * which edge modules survived tree-shaking, read from the bundler after
 * linking, and the bundler's graph for traces. An edge module survives
 * when it owns a used export (`renderedExports` on Rolldown, used exports
 * on Rspack) or, when its target is effectful, when it is in a chunk at
 * all (the `__fx` effect witness is kept iff its importer is evaluated).
 *
 * Structural types only: the readers take what Vite's `generateBundle` and
 * Rspack's `processAssets` hand the host.
 */
import type { EdgeModuleIds } from './edge-modules'
import type { ImportGraphView } from './graph-trace'

/** An edge module as the readers see it: its key and whether its target is effectful. */
export interface WitnessModule {
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

export interface RolldownRenderedModule {
  renderedExports: ReadonlyArray<string>
}

export interface RolldownOutputChunk {
  type: 'chunk'
  modules: Record<string, RolldownRenderedModule>
}

export type RolldownOutputBundle = Record<
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

export interface RollupModuleInfoLike {
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

/** Removes every output of a non-final pass so nothing is written (Rollup semantics; Rolldown honours deletes). */
export function discardBundle(bundle: Record<string, unknown>): void {
  for (const name of Object.keys(bundle)) {
    delete bundle[name]
  }
}

// ---------------------------------------------------------------------------
// Rspack
// ---------------------------------------------------------------------------

export interface RspackModuleLike {
  resource?: string
  /** Inner modules of a ConcatenatedModule. */
  modules?: Iterable<RspackModuleLike>
}

export interface RspackChunkLike {
  runtime?: Iterable<string> | string
}

export interface RspackConnectionLike {
  originModule: RspackModuleLike | null
}

export interface RspackCompilationLike {
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
    getIncomingConnections?: (
      module: RspackModuleLike,
    ) => Iterable<RspackConnectionLike>
    getModule?: (dependency: unknown) => RspackModuleLike | null
  }
  entries?: Map<string, { dependencies: Iterable<unknown> }>
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
 * The keys of the edge modules that survived an Rspack compilation
 * (`processAssets`, any stage: graph readings do not depend on it),
 * sorted. Only modules in a chunk can survive (concatenated inner modules
 * included); a used export or an effectful target makes it live; `null`
 * used exports (usedExports off) leave it to inclusion.
 */
export function readRspackWitness(
  compilation: RspackCompilationLike,
  lookup: WitnessLookup,
): Array<string> {
  const inChunk = new Map<
    string,
    { module: RspackModuleLike; edge: WitnessModule }
  >()
  for (const chunk of compilation.chunks) {
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      for (const inner of m.modules ?? [m]) {
        const res = inner.resource
        if (!res || inChunk.has(res)) {
          continue
        }
        const edge = lookup(res)
        if (edge) {
          inChunk.set(res, { module: inner, edge })
        }
      }
    }
  }
  const runtimes = runtimesOf(compilation)
  const live = new Set<string>()
  for (const { module, edge } of inChunk.values()) {
    const used = compilation.moduleGraph.getUsedExports(module, runtimes)
    if (
      used === true ||
      used === null ||
      (Array.isArray(used) && used.length > 0) ||
      edge.effectful
    ) {
      live.add(edge.key)
    }
  }
  return [...live].sort()
}

/** The module graph of an Rspack compilation for traces (by resource; entries from `compilation.entries`). */
export function rspackGraphView(
  compilation: RspackCompilationLike,
): ImportGraphView {
  let byResource: Map<string, RspackModuleLike> | null = null
  let entries: Set<string> | null = null
  const moduleOf = (id: string) => {
    if (!byResource) {
      byResource = new Map()
      for (const m of compilation.modules) {
        for (const inner of [m, ...(m.modules ?? [])]) {
          if (inner.resource && !byResource.has(inner.resource)) {
            byResource.set(inner.resource, inner)
          }
        }
      }
    }
    return byResource.get(id) ?? null
  }
  return {
    importers(id) {
      const m = moduleOf(id)
      const incoming = m
        ? compilation.moduleGraph.getIncomingConnections?.(m)
        : undefined
      const out: Array<string> = []
      for (const c of incoming ?? []) {
        const res = c.originModule?.resource
        if (res && res !== id && !out.includes(res)) {
          out.push(res)
        }
      }
      return out
    },
    isEntry(id) {
      if (!entries) {
        entries = new Set()
        for (const entry of compilation.entries?.values() ?? []) {
          for (const dep of entry.dependencies) {
            const res = compilation.moduleGraph.getModule?.(dep)?.resource
            if (res) {
              entries.add(res)
            }
          }
        }
      }
      return entries.has(id)
    },
  }
}
