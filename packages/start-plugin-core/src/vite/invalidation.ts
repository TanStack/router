/**
 * The compiler's invalidations in a Vite dev server or `build --watch` (the
 * one invalidation operation of the core, `invalidate`): the hosts that
 * re-validate fingerprints, its application to an environment's module graph,
 * and the dependents whose output it changed.
 */
import {
  applyViteInvalidation,
  identify,
  invalidate,
  normalizePath,
} from '@tanstack/router-utils/compiler'
import type {
  HostServices,
  InvalidateChange,
} from '@tanstack/router-utils/compiler'
import type { DevEnvironment, Environment, EnvironmentModuleNode } from 'vite'
import type { Session, ViteCompilerState } from './compiler-state'

/** How many dependents of one file change `changedDependents` transforms at once. */
const DEPENDENT_TRANSFORMS = 128

/** The host of the invalidation operation (a dev environment's own resolver). */
function invalidationHost(
  state: ViteCompilerState,
  s: Session,
  environment: DevEnvironment,
): HostServices {
  return {
    ...state.hostFor(s, environment, async (specifier, importer) => {
      const r = await environment.pluginContainer.resolveId(specifier, importer)
      return r ? { id: r.id, external: r.external === true } : null
    }),
    onInvalidationError: (error) => {
      environment.logger.warnOnce(
        `[tanstack-start] re-checking a module after a file change failed: ${String(error)}`,
      )
    },
  }
}

/**
 * The hosts of one invalidation, per environment: each environment's
 * fingerprints are re-validated with its own resolver (per-environment
 * aliases and conditions); an environment the dev server does not
 * know falls back to the hook's own.
 */
export function invalidationHosts(
  state: ViteCompilerState,
  s: Session,
  own: DevEnvironment,
): (key: { env: string }) => HostServices {
  const hosts = new Map<string, HostServices>()
  return ({ env: name }) => {
    let h = hosts.get(name)
    if (!h) {
      h = invalidationHost(state, s, s.server?.environments[name] ?? own)
      hosts.set(name, h)
    }
    return h
  }
}

/**
 * Applies one invalidation to an env's module graph and returns the
 * dependents (`applyViteInvalidation`; Vite transforms them again and
 * propagates their updates): the changed file's own modules are Vite's own
 * update, and an `unlink`'s dependents wait for the next `add`.
 */
export function applyInvalidation(
  s: Session,
  environment: Environment,
  change: InvalidateChange,
  res: Awaited<ReturnType<typeof invalidate>>,
  timestamp: number,
): Array<EnvironmentModuleNode> {
  let waiting = s.awaitingAdd.get(environment.name)
  if (!waiting) {
    waiting = new Set()
    s.awaitingAdd.set(environment.name, waiting)
  }
  return applyViteInvalidation(
    environment as DevEnvironment,
    change,
    res,
    timestamp,
    { ownUpdate: true, awaitingAdd: waiting },
  )
}

/** Digest of the compiler's last output of a module id in an environment (`Session.outputDigests`). */
function digestOf(s: Session, id: string, key: string): string | undefined {
  return s.outputDigests.get(identify(id).path)?.get(key)
}

/** Forgets what the session and the host hold of a deleted file (`file`: its normalized path). */
export function forgetFile(s: Session, file: string): void {
  s.start.forget(file)
  s.outputDigests.delete(file)
}

/**
 * The dependents whose output the change altered: a dependent re-plans
 * (its plan was evicted), and the one the compiler emits again as the
 * page holds it is no update (D8: hard-invalidate where decisions
 * changed). Propagating it would only send the page a module it cannot
 * hot-apply (a route tree, accepted by nothing) and so a full reload,
 * e.g. after a route file gained an export. The comparison is of the
 * compiler's output, not Vite's (import analysis stamps `?t=` on the
 * imports of changed modules). The dependents are transformed
 * `DEPENDENT_TRANSFORMS` at a time (an export added to a shared module
 * re-plans each of its importers: their waits overlap, and the modules
 * in flight at once stay few); the result keeps their order.
 *
 * An unchanged dependent stays invalidated (soft: its next request reuses
 * this transform): Vite's graph, not the comparison, says whether what a
 * module runner holds is current. Another file's hot update may have
 * invalidated the dependent meanwhile (Vite keeps a transform that an HMR
 * invalidation overtook), and a runner whose copy failed to load (an
 * import was missing) is not told when the file is back.
 */
export async function changedDependents(
  s: Session,
  environment: DevEnvironment,
  dependents: Array<EnvironmentModuleNode>,
): Promise<Array<EnvironmentModuleNode>> {
  const unchanged: Array<boolean> = []
  let next = 0
  const transformNext = async (): Promise<void> => {
    while (next < dependents.length) {
      const i = next++
      const node = dependents[i]!
      if (node.id === null) {
        continue
      }
      // Vite's own propagation of the file change may have cleared the
      // node's transform result already; the compiler's last output is
      // what the page holds
      const key = `${environment.name}\0${node.id}`
      const previous = digestOf(s, node.id, key)
      if (previous === undefined) {
        continue
      }
      await environment.transformRequest(node.url).catch(() => null)
      unchanged[i] = digestOf(s, node.id, key) === previous
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(DEPENDENT_TRANSFORMS, dependents.length) },
      transformNext,
    ),
  )
  // once every transform ended: an invalidation reaches the importers,
  // and Vite drops a transform it overtook (compiled again on request)
  const changed: Array<EnvironmentModuleNode> = []
  dependents.forEach((node, i) => {
    if (unchanged[i]) {
      environment.moduleGraph.invalidateModule(
        node,
        undefined,
        undefined,
        false,
        true,
      )
    } else {
      changed.push(node)
    }
  })
  return changed
}

/** Registry changes (the generator published a new `routesByFile`): route modules whose entry changed re-plan (`kind: 'registry'`). */
export async function invalidateRegistry(
  state: ViteCompilerState,
  s: Session,
  file: string,
): Promise<void> {
  if (!s.server) {
    return
  }
  const environments = Object.values(s.server.environments)
  const first = environments[0]
  if (!first) {
    return
  }
  const change: InvalidateChange = {
    path: normalizePath(file),
    kind: 'registry',
  }
  const res = await invalidate(
    s.start.caches,
    change,
    invalidationHosts(state, s, first),
  )
  const now = Date.now()
  for (const environment of environments) {
    if (state.envNames.has(environment.name)) {
      applyInvalidation(s, environment, change, res, now)
    }
  }
}

/** The compiler's change kind of a Vite file event. */
export function changeKindOf(
  event: 'create' | 'update' | 'delete',
): InvalidateChange['kind'] {
  return event === 'delete' ? 'unlink' : event === 'create' ? 'add' : 'change'
}
