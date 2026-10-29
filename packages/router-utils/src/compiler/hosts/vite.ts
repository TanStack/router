/** Helpers of the Vite hosts (router and Start). */
import { readFile } from 'node:fs/promises'
import { deriveId, identify } from '../identity'
import { pathsOf } from './rebuild'
import type { CompilerCaches, InvalidateChange } from '../host'
import type { PlanKey } from '../identity'

/**
 * Whether a Vite environment build (its `build` config) is the last one of
 * the logical build, after which `releaseEnvironment` is due: a written
 * bundle outside watch mode. A `write: false` build may be a scan that
 * builds the environment again (an RSC client scan), and a watch build
 * rebuilds it: their plans stay.
 */
export function isFinalBuild(
  build: { write?: boolean; watch?: unknown } | undefined,
): boolean {
  return build !== undefined && build.write !== false && !build.watch
}

/** What the invalidation reads of a Vite environment's module graph. */
export interface ModuleGraphLike<TNode> {
  getModulesByFile: (file: string) => Set<TNode> | undefined
  invalidateModule: (
    mod: TNode,
    seen: Set<TNode>,
    timestamp: number,
    isHmr: boolean,
    softInvalidate: boolean,
  ) => void
}

/**
 * The `load` of a derived id of a file of the project (`route.tsx?tsr-split=…`,
 * Start's `?tss-hydrate=…`, `?tss-serverfn-split`): the file's own text,
 * read here and watched. Vite's load fallback cleans the id of its query and
 * fragment, and a `#` of a project path (`C#`, `project #2`) would end the
 * path there. A derived id with a foreign query (`.vue?vue&…`) or of a
 * virtual module is its owner's to load (null).
 */
export async function loadDerivedSource(
  ctx: { addWatchFile: (id: string) => void },
  id: string,
): Promise<string | null> {
  const identity = identify(id)
  if (
    identity.derived === null ||
    identity.foreignQuery !== '' ||
    identity.path.startsWith('\0')
  ) {
    return null
  }
  const code = await readFile(identity.path, 'utf8').catch(() => null)
  if (code === null) {
    return null
  }
  ctx.addWatchFile(identity.path)
  return code
}

/**
 * Applies an `invalidate()` result to a Vite environment's module graph,
 * the host side of the one operation: the modules of the files of its
 * evicted and dependent plans in the environment are hard-invalidated (Vite
 * transforms them again on their next request) and returned. A registry
 * change invalidates the changed file's own modules too (a file that was no
 * route before has no plan to evict, and is one now). Start's hosts, whose
 * plans depend on other modules, opt in to two refinements:
 * - `ownUpdate`: the changed file's own modules are Vite's own hot update,
 *   left out of the returned dependents;
 * - `awaitingAdd`: on `unlink`, the dependents wait for a file to appear
 *   (`add`) before they are invalidated. Vite propagates the deleted
 *   module's own update to its importers at once, and a dependent
 *   transformed while the file is missing fails at `vite:import-analysis`,
 *   which marks it not self-accepting, so its later updates go through its
 *   importers (a route module, whose split component is never re-imported:
 *   the page keeps the old module). Such dependents keep their
 *   soft-invalidated output until then; a plan of theirs the core evicted at
 *   `unlink` is compiled then.
 */
export function applyViteInvalidation<TNode>(
  environment: { name: string; moduleGraph: ModuleGraphLike<TNode> },
  change: InvalidateChange,
  res: { evicted: Array<PlanKey>; dependents: Array<PlanKey> },
  timestamp: number,
  opts: { ownUpdate?: boolean; awaitingAdd?: Set<string> } = {},
): Array<TNode> {
  const files = new Set(
    pathsOf([...res.evicted, ...res.dependents], environment.name),
  )
  if (opts.ownUpdate) {
    files.delete(change.path)
  }
  const waiting = opts.awaitingAdd
  if (waiting && change.kind === 'unlink') {
    for (const file of files) {
      waiting.add(file)
    }
    return []
  }
  if (waiting && change.kind === 'add') {
    for (const file of waiting) {
      files.add(file)
    }
    waiting.clear()
  }
  if (change.kind === 'registry') {
    files.add(change.path)
  }
  const graph = environment.moduleGraph
  const seen = new Set<TNode>()
  const nodes: Array<TNode> = []
  for (const file of files) {
    for (const node of graph.getModulesByFile(file) ?? []) {
      graph.invalidateModule(node, seen, timestamp, true, false)
      nodes.push(node)
    }
  }
  return nodes
}

/**
 * The modules of a file's hot update that the file's current plan still
 * produces: the file's own modules, and its derived modules
 * (`?tsr-split=…`) whose output the plan declares. A derived module of a
 * layout the file no longer has (an extracted export once the export went,
 * a split chunk once the file stopped splitting) stays in Vite's module
 * graph, imported by the chunk or route module until those re-import: nothing
 * on the page holds its next evaluation, and an update of it either
 * dead-ends into a full reload or, as a React Refresh boundary, invalidates
 * itself ("export removed") against the route update. The file's own module
 * is transformed first, so its plan is current (Vite invalidated it before
 * the hooks ran); without a plan (the file does not parse, or is not the
 * compiler's), a derived module without importers is stale.
 * `undefined` when every module is live.
 */
export async function liveModules<
  T extends {
    id: string | null
    url: string
    importers: ReadonlySet<unknown>
  },
>(
  environment: {
    name: string
    transformRequest: (url: string) => Promise<unknown>
  },
  caches: CompilerCaches,
  file: string,
  modules: Array<T>,
): Promise<Array<T> | undefined> {
  const identities = modules.map((m) => (m.id === null ? null : identify(m.id)))
  if (!identities.some((i) => i !== null && i.derived !== null)) {
    return undefined
  }
  for (const [i, identity] of identities.entries()) {
    if (identity !== null && identity.derived === null) {
      await environment.transformRequest(modules[i]!.url).catch(() => null)
    }
  }
  let produced: Set<string> | null = null
  for (const cache of caches.plans.values()) {
    if (cache.env !== environment.name) {
      continue
    }
    for (const key of cache.keysAt(file)) {
      const entry = cache.get(key)
      if (entry) {
        produced ??= new Set()
        for (const output of Object.keys(entry.plan.outputs)) {
          produced.add(output)
        }
      }
    }
  }
  const live = modules.filter((m, i) => {
    const identity = identities[i] ?? null
    if (identity === null || identity.derived === null) {
      return true
    }
    if (produced !== null) {
      return produced.has(
        `derived:${deriveId(identity.canonicalId, identity.derived)}`,
      )
    }
    return m.importers.size > 0
  })
  return live.length === modules.length ? undefined : live
}
