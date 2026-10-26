/**
 * Violation traces (J6.5): a real import chain from an
 * entry of the environment to the importer, found by a breadth-first walk
 * up the bundler's own module graph (Vite `moduleGraph` importers in dev,
 * Rollup `getModuleInfo().importers` / Rspack incoming connections in
 * builds), joined with what our own compiles resolved (`EdgeIndex`: the
 * specifier and original position of each step, and edges the bundler has
 * not recorded yet). Cut at `maxTraceDepth`, keeping the importer.
 */
import { identify } from '@tanstack/router-utils/compiler'
import type { TraceStep } from './trace'

/** The bundler's graph, as a trace needs it. Ids are bundler module ids. */
export interface ImportGraphView {
  importers: (id: string) => Iterable<string>
  isEntry: (id: string) => boolean
}

export interface IndexedEdge {
  /** The target's canonical id (as the env's resolver gave it). */
  resolved: string
  /** The specifier as written. */
  specifier: string
  /** 1-based original position of the specifier, when known. */
  line?: number
  column?: number
}

/**
 * Per environment: the resolved edges of every module our compiles judged
 * (importer id → its edges), replaced when the importer is judged again.
 * Bounded by the live modules; only feeds traces (diagnostics).
 */
export class EdgeIndex {
  private readonly forward = new Map<string, Map<string, IndexedEdge>>()
  private readonly reverse = new Map<string, Set<string>>()

  set(importerId: string, edges: ReadonlyArray<IndexedEdge>): void {
    this.delete(importerId)
    const byTarget = new Map<string, IndexedEdge>()
    for (const e of edges) {
      if (!byTarget.has(e.resolved)) {
        byTarget.set(e.resolved, e)
      }
      let importers = this.reverse.get(e.resolved)
      if (!importers) {
        importers = new Set()
        this.reverse.set(e.resolved, importers)
      }
      importers.add(importerId)
    }
    this.forward.set(importerId, byTarget)
  }

  delete(importerId: string): void {
    const prev = this.forward.get(importerId)
    if (!prev) {
      return
    }
    for (const target of prev.keys()) {
      const importers = this.reverse.get(target)
      importers?.delete(importerId)
      if (importers?.size === 0) {
        this.reverse.delete(target)
      }
    }
    this.forward.delete(importerId)
  }

  has(importerId: string): boolean {
    return this.forward.has(importerId)
  }

  /** The edges of an importer (Rspack: recorded in its `buildInfo` for a restored module's traces). */
  edgesOf(importerId: string): Array<IndexedEdge> {
    return [...(this.forward.get(importerId)?.values() ?? [])]
  }

  importerIds(): Iterable<string> {
    return this.forward.keys()
  }

  /** Forgets the edges of every importer id of a deleted file. */
  forget(path: string): void {
    for (const importerId of [...this.forward.keys()]) {
      if (traceFile(importerId) === path) {
        this.delete(importerId)
      }
    }
  }

  edge(importerId: string, targetId: string): IndexedEdge | undefined {
    return this.forward.get(importerId)?.get(targetId)
  }

  importers(targetId: string): Iterable<string> {
    return this.reverse.get(targetId) ?? []
  }

  clear(): void {
    this.forward.clear()
    this.reverse.clear()
  }
}

/** The file a trace step names: the module's path (owned and foreign queries stripped; virtual ids as they are). */
export function traceFile(id: string): string {
  return id.startsWith('\0') ? id : identify(id).path
}

/**
 * The trace of `importerId`: entry first, importer last; at most
 * `maxDepth + 1` steps (a deeper chain is cut on the entry side). Each step
 * names its import of the next module (and where it is) when known.
 */
export function buildTrace(
  importerId: string,
  graph: ImportGraphView | null,
  index: EdgeIndex | null,
  maxDepth: number,
): Array<TraceStep> {
  const next = new Map<string, string>()
  const seen = new Set<string>([importerId])
  let queue = [importerId]
  let root: string | null = null
  let firstRootless: string | null = null
  const importersOf = (id: string): Array<string> => {
    const out: Array<string> = []
    const add = (i: string) => {
      if (!out.includes(i)) {
        out.push(i)
      }
    }
    if (graph) {
      for (const i of graph.importers(id)) {
        add(i)
      }
    }
    if (index) {
      for (const i of index.importers(id)) {
        add(i)
      }
    }
    return out
  }
  search: while (queue.length > 0) {
    const level: Array<string> = []
    for (const id of queue) {
      if (id !== importerId && graph?.isEntry(id)) {
        root = id
        break search
      }
      const importers = importersOf(id)
      if (importers.length === 0 && firstRootless === null) {
        firstRootless = id
      }
      for (const i of importers) {
        if (seen.has(i)) {
          continue
        }
        seen.add(i)
        next.set(i, id)
        level.push(i)
      }
    }
    queue = level
  }
  root ??= firstRootless ?? importerId
  const chain: Array<string> = [root]
  for (let id = root; id !== importerId; ) {
    const n = next.get(id)
    if (n === undefined) {
      break
    }
    chain.push(n)
    id = n
  }
  const steps: Array<TraceStep> = chain.map((id, i) => {
    const step: TraceStep = { file: traceFile(id) }
    const to = chain[i + 1]
    const edge = to !== undefined ? index?.edge(id, to) : undefined
    if (edge) {
      step.specifier = edge.specifier
      if (edge.line !== undefined) {
        step.line = edge.line
        step.column = edge.column
      }
    }
    return step
  })
  const keep = Math.max(1, maxDepth + 1)
  return steps.length > keep ? steps.slice(steps.length - keep) : steps
}

/** A Vite dev environment's module graph (structural: `environment.moduleGraph`). */
export interface ViteModuleGraphLike {
  getModuleById: (
    id: string,
  ) => { importers: Iterable<{ id: string | null }> } | undefined
}

/**
 * The dev server's graph of an environment for traces and report readiness
 * (`ImportProtectionEnv.graph`). `entries`: the environment's resolved entry
 * ids (router entry, start entry, client/server entry); a module nothing
 * imports is a root too.
 */
export function viteDevGraphView(
  moduleGraph: ViteModuleGraphLike,
  isEntry: (id: string) => boolean,
): ImportGraphView {
  return {
    importers(id) {
      const out: Array<string> = []
      for (const m of moduleGraph.getModuleById(id)?.importers ?? []) {
        if (m.id !== null) {
          out.push(m.id)
        }
      }
      return out
    },
    isEntry,
  }
}
