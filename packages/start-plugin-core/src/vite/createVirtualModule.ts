import { createIdFilter, resolveViteId } from '../utils'
import type { Plugin } from 'vite'

type VirtualModuleLoadResult =
  | string
  | { code: string; meta?: Record<string, unknown> }
  | null
  | undefined

type VirtualModuleLoadHandler = (
  this: any,
  id: string,
) => VirtualModuleLoadResult | Promise<VirtualModuleLoadResult>

/** The id a virtual module (`createVirtualModule`) resolves to. */
export function resolvedVirtualId(moduleId: string): string {
  // Encode '#' as '%23' in the resolved ID to avoid browser treating it as URL fragment.
  // The browser requests /@id/__x00__%23tanstack-start-plugin-adapters instead of
  // /@id/__x00__#tanstack-start-plugin-adapters (which would truncate at #).
  return resolveViteId(moduleId.replaceAll('#', '%23'))
}

export function createVirtualModule(opts: {
  name: string
  moduleId: string
  load: VirtualModuleLoadHandler
  apply?: Plugin['apply']
  applyToEnvironment?: Plugin['applyToEnvironment']
  enforce?: Plugin['enforce']
  sharedDuringBuild?: boolean
}): Plugin {
  const resolvedId = resolvedVirtualId(opts.moduleId)

  return {
    name: opts.name,
    apply: opts.apply,
    applyToEnvironment: opts.applyToEnvironment,
    enforce: opts.enforce,
    sharedDuringBuild: opts.sharedDuringBuild,
    resolveId: {
      filter: { id: createIdFilter([opts.moduleId]) },
      handler(id) {
        if (id === opts.moduleId) {
          return resolvedId
        }

        return undefined
      },
    },
    load: {
      filter: { id: createIdFilter([resolvedId]) },
      handler(id) {
        if (id !== resolvedId) {
          return undefined
        }

        return opts.load.call(this, id)
      },
    },
  }
}
