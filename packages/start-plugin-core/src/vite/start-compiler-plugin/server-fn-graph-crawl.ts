import { TRANSFORM_ID_REGEX } from '../../constants'
import { cleanId } from '../../start-compiler/utils'
import type { ServerFn } from '../../start-compiler/types'

/**
 * The subset of the Rollup/Vite plugin context that the discovery crawl needs.
 */
export type ServerFnGraphCrawlContext = {
  getModuleIds: () => IterableIterator<string>
  load: (options: {
    id: string
    resolveDependencies?: boolean
  }) => Promise<{
    importedIds: ReadonlyArray<string>
    dynamicallyImportedIds: ReadonlyArray<string>
  } | null>
}

/**
 * Should this module be *walked* (loaded, then its imports followed) when
 * discovering server functions?
 *
 * The graph BFS is bounded to the application's own source. The framework
 * runtime — which is what imports the resolver virtual module and pulls in a
 * large dependency graph — lives in `node_modules` / outside the project root,
 * so this bound both keeps the walk cheap and, crucially, prevents it from
 * wandering into the framework and re-entering the resolver module that is
 * currently being generated.
 *
 * Note this only gates which modules' *imports we follow*. Server functions
 * defined outside the root (e.g. in a shared package) are still discovered —
 * see the provider-module phase in `ensureServerModuleGraphTransformed`.
 */
export function shouldWalkForServerFns(id: string, root: string): boolean {
  // Virtual modules (Vite/Rollup prefix their ids with a NUL byte) never
  // contain user server functions and can pull in the resolver itself. Check
  // the raw id, since `cleanId` strips the leading NUL byte.
  if (id.startsWith('\0')) {
    return false
  }
  const cleaned = cleanId(id)
  if (cleaned.includes('/node_modules/')) {
    return false
  }
  // Require a path boundary (`root/…`) so a sibling directory that merely shares
  // a name prefix (e.g. `<root>-other`) is not treated as being under the root.
  if (!cleaned.startsWith(`${root}/`)) {
    return false
  }
  return TRANSFORM_ID_REGEX.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(cleaned)
  })
}

/**
 * Eagerly transform the modules that can contribute server functions before the
 * caller snapshots `serverFnsById`.
 *
 * This does not change what ends up in the bundle (these modules are part of the
 * server build regardless) — it only forces the transform side effect, and thus
 * server-function discovery, to run before the one-shot resolver module is
 * generated. Without it, server functions reachable only from server-only code
 * (a middleware `.server()` body or another server function's handler) can be
 * discovered after the resolver has already been generated, leaving them out of
 * the manifest.
 */
export async function ensureServerModuleGraphTransformed(
  ctx: ServerFnGraphCrawlContext,
  selfId: string,
  root: string,
  serverFnsById: Record<string, ServerFn>,
): Promise<void> {
  const visited = new Set<string>([selfId])

  // Phase 1 — walk the application's own source graph (bounded to avoid the
  // framework runtime). `resolveDependencies` loads each module's direct imports,
  // registering server functions referenced from bodies that survive the
  // server-side transform (most notably middleware `.server()` handlers, which
  // are not stripped on the server), and following imports reaches app modules
  // not yet in the graph.
  const queue = [...ctx.getModuleIds()].filter((id) =>
    shouldWalkForServerFns(id, root),
  )
  while (queue.length > 0) {
    const moduleId = queue.pop()!
    if (visited.has(moduleId)) {
      continue
    }
    visited.add(moduleId)

    if (!shouldWalkForServerFns(moduleId, root)) {
      continue
    }

    let info
    try {
      info = await ctx.load({ id: moduleId, resolveDependencies: true })
    } catch {
      // Unloadable ids are not part of server-fn discovery.
      continue
    }
    if (!info) {
      continue
    }

    for (const dep of info.importedIds) {
      if (!visited.has(dep)) {
        queue.push(dep)
      }
    }
    for (const dep of info.dynamicallyImportedIds) {
      if (!visited.has(dep)) {
        queue.push(dep)
      }
    }
  }

  // Phase 2 — a server function invoked from a *handler* body is dropped from the
  // caller module (the handler becomes an RPC stub), so Phase 1's imports miss
  // it. Its `?tss-serverfn-split` provider module keeps the handler body intact,
  // so loading that provider module (with its direct dependencies) registers the
  // server functions it calls.
  //
  // Unlike Phase 1 this is NOT bounded by the project root: a provider id always
  // refers to a user/shared server-function implementation (never the framework
  // runtime), so it is safe and bounded to load regardless of where the function
  // is defined — this is what lets server functions defined in external packages
  // be discovered. We only load these modules (we do not follow their imports)
  // to stay bounded, and iterate until no new server functions appear.
  let previousCount = -1
  while (Object.keys(serverFnsById).length !== previousCount) {
    previousCount = Object.keys(serverFnsById).length
    for (const fn of Object.values(serverFnsById)) {
      const providerId = fn.extractedFilename
      if (visited.has(providerId)) {
        continue
      }
      visited.add(providerId)
      try {
        await ctx.load({ id: providerId, resolveDependencies: true })
      } catch {
        // Provider module not loadable in isolation — skip.
      }
    }
  }
}
