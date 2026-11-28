/**
 * The route registry as the router planner reads it (`HostServices.routes`:
 * `lookup` for the planner, `digestFor` for plan validation): the
 * generator's `routesByFile` by normalized path (a symlinked route file is
 * listed under its real path too, where bundlers resolve it). Shared by the
 * standalone router hosts and Start's hosts.
 */
import { normalizePath } from '@tanstack/router-utils/compiler'
import { routeEntryDigest } from './route'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { RouteEntryFacts } from './route'
import type { RouteRegistry } from '@tanstack/router-utils/compiler'

/**
 * The digest of every file while the routes were never generated: the
 * generator's error, which a route module's diagnostic quotes (another
 * failure compiles it again). No entry digest starts with a NUL.
 */
function notGeneratedDigest(failure: unknown): string {
  return `\u0000${failure instanceof Error ? failure.message : String(failure)}`
}

export class RouteRegistryView implements RouteRegistry {
  constructor(private readonly context: RouterPluginContext) {}

  /** The registry entry of a file, by its normalized path (scanned or real). */
  lookup(path: string): RouteEntryFacts | null {
    const entry = this.context.routesByFile.get(normalizePath(path))
    return entry
      ? {
          routeId: entry.routeId,
          kind: entry.kind,
          routerConstructor: entry.routerConstructor,
        }
      : null
  }

  /** The route-registry fingerprint of a file (`HostServices.routes`); the generator's error for every file while the routes were never generated. */
  digestFor(path: string): string | null {
    const failure = this.context.generationFailure
    return failure !== undefined
      ? notGeneratedDigest(failure)
      : routeEntryDigest(this.lookup(path))
  }

  /** The generator's error while it has never generated the routes. */
  failure(): unknown {
    return this.context.generationFailure
  }
}
