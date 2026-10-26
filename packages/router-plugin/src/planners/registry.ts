/**
 * The route registry as the router planners read it (`RouteRegistryService`
 * on `HostServices.services.routes`, `HostServices.routes.digestFor`): the
 * generator's `routesByFile` by normalized path, with a lookup by the real
 * path of a symlinked route file (bundlers resolve modules to their real
 * path, the generator scans the link). Shared by the
 * standalone router hosts and Start's hosts.
 */
import fs from 'node:fs'
import { routeEntryDigest } from './route'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { RouteEntryFacts } from './route'
import type { RouteRegistryService } from './split'
import type { RouteRegistry } from '@tanstack/router-utils/compiler'

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export class RouteRegistryView implements RouteRegistryService, RouteRegistry {
  /** The registry's entries by the real path of their (symlinked) files, per registry. */
  private realPaths: {
    registry: RouterPluginContext['routesByFile']
    byRealPath: Map<string, { routeId: string }>
  } | null = null

  constructor(private readonly context: RouterPluginContext) {}

  /**
   * The registry entry of a file, by its normalized path: the path the
   * generator scanned, or the real path of a symlinked route file.
   */
  lookup(path: string): RouteEntryFacts | null {
    const p = normalizePath(path)
    const registry = this.context.routesByFile
    let entry: { routeId: string } | undefined = registry.get(p)
    if (!entry) {
      if (this.realPaths?.registry !== registry) {
        const byRealPath = new Map<string, { routeId: string }>()
        for (const [file, e] of registry) {
          let real: string
          try {
            real = normalizePath(fs.realpathSync.native(file))
          } catch {
            continue
          }
          if (real !== file && !registry.has(real)) {
            byRealPath.set(real, { routeId: e.routeId })
          }
        }
        this.realPaths = { registry, byRealPath }
      }
      entry = this.realPaths.byRealPath.get(p)
    }
    return entry ? { routeId: entry.routeId } : null
  }

  /** The route-registry fingerprint of a file (`HostServices.routes`). */
  digestFor(path: string): string | null {
    return routeEntryDigest(this.lookup(path))
  }
}
