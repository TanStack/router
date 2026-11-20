/**
 * Violation traces (J6.5): a real import chain from an
 * entry of the environment to the importer, found by a breadth-first walk
 * up the bundler's own module graph (Vite `moduleGraph` importers in dev,
 * Rollup `getModuleInfo().importers` / Rspack incoming connections in
 * builds), joined with what our own compiles resolved (`EdgeIndex`: the
 * specifier and original position of each step, and edges the bundler has
 * not recorded yet). Cut at `maxTraceDepth`, keeping the importer.
 *
 * A step's position is located when the trace is built, from the raw file
 * (the edge keeps the offset of its specifier in the compile's input text and
 * the input's revision): a bundler's transform context, and so its input
 * map, lives only while the hook runs, and a trace is a diagnostic nothing
 * reports in most builds. An input another plugin rewrote (its revision is
 * not the file's) locates nothing.
 */
import fs from 'node:fs'
import { identify, revision } from '@tanstack/router-utils/compiler'
import { Locator } from './locate'
import type { TraceStep } from './trace'

/** A module of one compile environment: the environment's key and the bundler's module id. */
export interface GraphNode {
  env: string
  id: string
}

/**
 * The bundler's graph of a compilation (or of a dev server), by node: each
 * importer is a module of its own environment, which may differ from the
 * imported module's (an Rspack rule's `layer`).
 */
export interface NodeGraph {
  /** The nodes importing `node`; null when the graph cannot read `node`'s environment (another Vite build's). */
  importers: (node: GraphNode) => Iterable<GraphNode> | null
  /**
   * The importers a walk up the graph takes (traces, report readiness), when
   * the graph knows fewer than there are (`viteDevNodeGraph`); default
   * `importers`. Verdicts read `importers`.
   */
  walkImporters?: (node: GraphNode) => Iterable<GraphNode> | null
  /** Whether `node` is an entry of the graph (a file can be an entry in one environment only). */
  isEntry: (node: GraphNode) => boolean
}

/** A node's key, for sets. */
export const nodeKey = (node: GraphNode): string => `${node.env}\0${node.id}`

export interface IndexedEdge {
  /** The target's canonical id (as the env's resolver gave it). */
  resolved: string
  /** The specifier as written. */
  specifier: string
  /** UTF-16 offset of the specifier in the importer's input text, when it is in that text. */
  offset?: number
}

/** The raw text of a source file for trace positions, or null (a virtual id, a missing file). */
export type SourceReader = (path: string) => string | null

export function readSourceFile(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * The module ids of each file (one file has an id per query), so that
 * forgetting a deleted file touches that file's records only: a checkout
 * deleting many files would otherwise pay for every module of the app per file.
 * A record id that is not a module id gives the file of its module.
 */
export class IdsByFile {
  private readonly ids = new Map<string, Set<string>>()

  add(id: string, file = traceFile(id)): void {
    let set = this.ids.get(file)
    if (!set) {
      set = new Set()
      this.ids.set(file, set)
    }
    set.add(id)
  }

  /** Forgets one id. */
  delete(id: string, file = traceFile(id)): void {
    const set = this.ids.get(file)
    set?.delete(id)
    if (set?.size === 0) {
      this.ids.delete(file)
    }
  }

  /** The ids of `file`, forgotten here. */
  take(file: string): Iterable<string> {
    const set = this.ids.get(file)
    this.ids.delete(file)
    return set ?? []
  }
}

/**
 * Per environment: the resolved edges of every module our compiles judged
 * (importer id → its edges, with the revision of the input they were judged
 * in), replaced when the importer is judged again. Bounded by the live
 * modules. It feeds traces (diagnostics) and the decisions on a module that
 * is its own violation: an unchecked importer makes it real (`incoming`), a
 * stale one explains it (`explainedByStaleImporter`).
 */
export class EdgeIndex {
  private readonly forward = new Map<
    string,
    { byTarget: Map<string, IndexedEdge>; revision: string | null }
  >()
  private readonly reverse = new Map<string, Set<string>>()
  private readonly idsByFile = new IdsByFile()

  constructor(private readonly readSource: SourceReader = readSourceFile) {}

  set(
    importerId: string,
    edges: ReadonlyArray<IndexedEdge>,
    revision: string | null = null,
  ): void {
    this.delete(importerId)
    this.idsByFile.add(importerId)
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
    this.forward.set(importerId, { byTarget, revision })
  }

  /** The revision of the input `importerId`'s edges were judged in (Rspack: recorded with them). */
  revisionOf(importerId: string): string | null {
    return this.forward.get(importerId)?.revision ?? null
  }

  /** The 1-based position of an edge's specifier, located in the raw file when it is still the text the edge was judged in. */
  position(
    importerId: string,
    edge: IndexedEdge,
  ): { line: number; column: number } | null {
    const rev = this.revisionOf(importerId)
    if (edge.offset === undefined || rev === null) {
      return null
    }
    const file = traceFile(importerId)
    const text = this.readSource(file)
    if (text === null || revision(text) !== rev) {
      return null
    }
    return new Locator(text, file, () => null).at(edge.offset)
  }

  delete(importerId: string): void {
    const prev = this.forward.get(importerId)
    if (!prev) {
      return
    }
    for (const target of prev.byTarget.keys()) {
      const importers = this.reverse.get(target)
      importers?.delete(importerId)
      if (importers?.size === 0) {
        this.reverse.delete(target)
      }
    }
    this.forward.delete(importerId)
    this.idsByFile.delete(importerId)
  }

  /** The importer ids. */
  ids(): Iterable<string> {
    return this.forward.keys()
  }

  has(importerId: string): boolean {
    return this.forward.has(importerId)
  }

  /** The edges of an importer (Rspack: recorded in its `buildInfo` for a restored module's traces). */
  edgesOf(importerId: string): Array<IndexedEdge> {
    return [...(this.forward.get(importerId)?.byTarget.values() ?? [])]
  }

  /** Forgets the edges of every importer id of a deleted file. */
  forget(path: string): void {
    for (const importerId of this.idsByFile.take(path)) {
      this.delete(importerId)
    }
  }

  edge(importerId: string, targetId: string): IndexedEdge | undefined {
    return this.forward.get(importerId)?.byTarget.get(targetId)
  }

  importers(targetId: string): Iterable<string> {
    return this.reverse.get(targetId) ?? []
  }
}

/** The file a trace step names: the module's path (owned and foreign queries stripped; virtual ids as they are). */
export function traceFile(id: string): string {
  return id.startsWith('\0') ? id : identify(id).path
}

/** A violation's whole chain (`traceOf`), as a report prints it. */
export interface Trace {
  /** Entry first, importer last. */
  steps: Array<TraceStep>
  /** Whether the first step is an entry of the graph (not a module nothing is known to import). */
  fromEntry: boolean
}

/** The last `maxDepth + 1` steps of a trace (at least the importer). */
export function cutTrace<T>(steps: Array<T>, maxDepth: number): Array<T> {
  const keep = Math.max(1, maxDepth + 1)
  return steps.length > keep ? steps.slice(steps.length - keep) : steps
}

/**
 * The whole trace of `start`: entry first, importer last. Each step is a
 * node, whose importers are those the graph has (it knows the node each
 * import landed on), else, when the graph cannot read its environment,
 * those import protection recorded there (`edgesOf`), and those `extra`
 * adds (the client-reference handoff); each step names its import of the
 * next module (and where it is) from its own environment's records.
 */
export function traceOf(
  start: GraphNode,
  graph: NodeGraph | null,
  edgesOf: (env: string) => EdgeIndex | null,
  extra?: (node: GraphNode) => Iterable<GraphNode>,
): Trace {
  const next = new Map<string, GraphNode>()
  const seen = new Set<string>([nodeKey(start)])
  let queue = [start]
  let root: GraphNode | null = null
  let firstRootless: GraphNode | null = null
  search: while (queue.length > 0) {
    const level: Array<GraphNode> = []
    for (const node of queue) {
      if (node !== start && graph?.isEntry(node)) {
        root = node
        break search
      }
      let rootless = true
      const known =
        (graph?.walkImporters ?? graph?.importers)?.(node) ??
        [...(edgesOf(node.env)?.importers(node.id) ?? [])].map((id) => ({
          env: node.env,
          id,
        }))
      for (const importers of [known, extra?.(node)]) {
        for (const i of importers ?? []) {
          rootless = false
          const key = nodeKey(i)
          if (seen.has(key)) {
            continue
          }
          seen.add(key)
          next.set(key, node)
          level.push(i)
        }
      }
      if (rootless && firstRootless === null) {
        firstRootless = node
      }
    }
    queue = level
  }
  root ??= firstRootless ?? start
  const fromEntry = graph?.isEntry(root) === true
  const chain: Array<GraphNode> = [root]
  for (let node = root; nodeKey(node) !== nodeKey(start); ) {
    const n = next.get(nodeKey(node))
    if (n === undefined) {
      break
    }
    chain.push(n)
    node = n
  }
  const steps: Array<TraceStep> = chain.map((node, i) => {
    const step: TraceStep = { file: traceFile(node.id) }
    const to = chain[i + 1]
    const index = to !== undefined ? edgesOf(node.env) : null
    const edge = index?.edge(node.id, to!.id)
    if (edge) {
      step.specifier = edge.specifier
      const at = index!.position(node.id, edge)
      if (at !== null) {
        step.line = at.line
        step.column = at.column
      }
    }
    return step
  })
  return { steps, fromEntry }
}

/** A Vite dev environment's module graph (structural: `environment.moduleGraph`). */
interface ViteModuleGraphLike {
  getModuleById: (
    id: string,
  ) => { importers: Iterable<{ id: string | null }> } | undefined
}

/**
 * The dev server's graph (`ImportProtectionEnv.graph`): a node's importers
 * are those of its environment's module graph (`moduleGraphOf`), in that
 * environment. A walk (traces, report readiness) also takes the importers
 * import protection recorded there (`edgesOf`): a dev server's graph knows
 * an import once the importer's module was served (a full-bundle dev
 * server's has few), and an edge never crosses environments on Vite, so a
 * record of the node's environment is an import of that node, the import
 * it substituted included (the graph has the edge module there).
 * `isEntry`: the resolved entry ids (router entry, start entry,
 * client/server entry); a module nothing imports is a root too.
 */
export function viteDevNodeGraph(
  moduleGraphOf: (env: string) => ViteModuleGraphLike | undefined,
  edgesOf: (env: string) => EdgeIndex | null,
  isEntry: (id: string) => boolean,
): NodeGraph {
  const importers = (node: GraphNode): Array<GraphNode> | null => {
    const graph = moduleGraphOf(node.env)
    if (!graph) {
      return null
    }
    const out: Array<GraphNode> = []
    for (const m of graph.getModuleById(node.id)?.importers ?? []) {
      if (m.id !== null) {
        out.push({ env: node.env, id: m.id })
      }
    }
    return out
  }
  return {
    importers,
    walkImporters(node) {
      const known = importers(node)
      if (!known) {
        return null
      }
      const ids = new Set(known.map((i) => i.id))
      for (const id of edgesOf(node.env)?.importers(node.id) ?? []) {
        if (!ids.has(id)) {
          ids.add(id)
          known.push({ env: node.env, id })
        }
      }
      return known
    },
    isEntry: (node) => isEntry(node.id),
  }
}
