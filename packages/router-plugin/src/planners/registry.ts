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

export class RouteRegistryView implements RouteRegistry {
  constructor(private readonly context: RouterPluginContext) {}

  /** The registry entry of a file, by its normalized path (scanned or real). */
  lookup(path: string): RouteEntryFacts | null {
    const entry = this.context.routesByFile.get(normalizePath(path))
    return entry
      ? { routeId: entry.routeId, routerConstructor: entry.routerConstructor }
      : null
  }

  /** The route-registry fingerprint of a file (`HostServices.routes`). */
  digestFor(path: string): string | null {
    return routeEntryDigest(this.lookup(path))
  }
}
