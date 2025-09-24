import { VIRTUAL_MODULES } from './virtual-modules'
import type { VirtualModules } from './virtual-modules'

/**
 * we need to explicitly enumerate all imports with string literals,
 * otherwise vite will not pick them up during build
 */
export async function loadVirtualModule<TId extends keyof VirtualModules>(
  id: TId,
): Promise<VirtualModules[TId]> {
  switch (id) {
    case VIRTUAL_MODULES.startManifest:
      return (await import('tanstack-start-manifest:v')) as any
    case VIRTUAL_MODULES.serverFnManifest:
      return (await import('tanstack-start-server-fn-manifest:v')) as any
    case VIRTUAL_MODULES.injectedHeadScripts:
      return (await import('tanstack-start-injected-head-scripts:v')) as any
    default:
      throw new Error(`Unknown virtual module: ${id}`)
  }
}
