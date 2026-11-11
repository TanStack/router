/**
 * The compiler's invalidations in a Vite dev server or `build --watch` (the
 * one invalidation operation of the core, `invalidate`): the hosts that
 * re-validate fingerprints, and the stale sets handed to Vite.
 */
import {
  invalidate,
  normalizePath,
  reloadStaleModules,
} from '@tanstack/router-utils/compiler'
import type {
  HostServices,
  InvalidateChange,
} from '@tanstack/router-utils/compiler'
import type { DevEnvironment, Environment } from 'vite'
import type { Session, ViteCompilerState } from './compiler-state'

/** The host of the invalidation operation (a dev environment's own resolver). */
function invalidationHost(
  state: ViteCompilerState,
  s: Session,
  environment: DevEnvironment,
): HostServices {
  return {
    ...state.hostFor(s, environment, async (specifier, importer) => {
      const r = await environment.pluginContainer.resolveId(specifier, importer)
      return r
        ? {
            id: r.id,
            external: r.external === true || typeof r.external === 'string',
          }
        : null
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
 * `build --watch`: the hosts of a file event's invalidation, per
 * environment: a plan's resolutions are asked again with its own
 * environment's resolver (`Session.resolvers`: the plugin context of its
 * last build), or the calling hook's (`own`) for an environment that has
 * not built.
 */
export function buildInvalidationHosts(
  state: ViteCompilerState,
  s: Session,
  own: Environment,
  resolve: NonNullable<ReturnType<Session['resolvers']['get']>>,
): (key: { env: string }) => HostServices {
  const hosts = new Map<string, HostServices>()
  return ({ env: name }) => {
    let h = hosts.get(name)
    if (!h) {
      h = state.hostFor(s, own, s.resolvers.get(name) ?? resolve)
      hosts.set(name, h)
    }
    return h
  }
}

/**
 * The invalidation of a file event or a registry change, by one hook
 * (each environment's hook forwards the event: the core compares, so a
 * repeat changes nothing). A failure is the dev server's to print: the hook
 * goes on to take its environment's stale set (what the invalidation found
 * stale stays there until a hook takes it).
 */
export async function invalidateFor(
  state: ViteCompilerState,
  s: Session,
  environment: DevEnvironment,
  change: InvalidateChange,
): Promise<void> {
  await invalidate(
    s.start.caches,
    change,
    invalidationHosts(state, s, environment),
  ).catch((error: unknown) => {
    environment.logger.error(
      `[tanstack-start] invalidating ${change.path} after a file change failed: ${String(error)}`,
    )
  })
}

/** Registry changes (the generator published a new `routesByFile`): route modules whose entry changed re-plan (`kind: 'registry'`), and their updates are sent. */
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
  await invalidateFor(state, s, first, {
    path: normalizePath(file),
    kind: 'registry',
  })
  for (const environment of environments) {
    if (state.envNames.has(environment.name)) {
      reloadStaleModules(s.start.caches, environment, false, '[tanstack-start]')
    }
  }
}

/**
 * A removed file's server functions leave the registry, when the core
 * judged the event a removal: a removal of a file that reads back (a
 * removal and re-creation delivered late) is a change and keeps them.
 */
export function forgetRemoved(s: Session, change: InvalidateChange): void {
  if (change.kind === 'unlink' && !s.start.caches.rawFacts.knows(change.path)) {
    s.start.forget(change.path)
  }
}

/** The compiler's change kind of a Vite file event. */
export function changeKindOf(
  event: 'create' | 'update' | 'delete',
): 'change' | 'add' | 'unlink' {
  return event === 'delete' ? 'unlink' : event === 'create' ? 'add' : 'change'
}
