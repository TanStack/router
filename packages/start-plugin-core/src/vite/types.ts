import type { TanStackStartCoreOptions } from '../types'

export interface ViteRscForwardSsrResolverStrategy {
  type: 'vite-rsc-forward'
  sourceEnvironmentName: string
  sourceEntry: string
  exportName: 'getServerFnById'
}

export type SsrResolverStrategy =
  | { type: 'default' }
  | ViteRscForwardSsrResolverStrategy

/**
 * How server functions are compiled and transported.
 * - 'split' (default): TanStack's own module splitting + RPC transport.
 * - 'directive': emit "use server" directive trampolines and delegate
 *   splitting, registration and HTTP transport to the framework's native
 *   server-function pipeline (currently only vite-plugin-solid +
 *   `@solidjs/web/server-functions`).
 */
export type ServerFnTransport = 'split' | 'directive'

export type TanStackStartVitePluginCoreOptions = TanStackStartCoreOptions & {
  providerEnvironmentName: string
  ssrIsProvider: boolean
  ssrResolverStrategy: SsrResolverStrategy
  serverFnTransport?: ServerFnTransport
}
