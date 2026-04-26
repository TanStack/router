import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import { solidStartDefaultEntryPaths } from './shared'
import type { PluginOption } from 'vite'

export function tanstackStart(
  options?: TanStackStartViteInputConfig,
): Array<PluginOption> {
  const corePluginOpts: TanStackStartVitePluginCoreOptions = {
    framework: 'solid',
    defaultEntryPaths: solidStartDefaultEntryPaths,
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    ssrResolverStrategy: {
      type: 'default',
    },
  }

  return [
    {
      name: 'tanstack-solid-start:config',
      config() {
        return {
          ssr: {
            // `@tanstack/solid-query` ships separate `development`/production
            // builds with their own `QueryClientContext` Symbol per file. If a
            // SSR-externalized package (e.g. `@tanstack/solid-router-ssr-query`)
            // imports it via Node's resolver while user source imports it via
            // Vite's resolver, they pick different files → two contexts →
            // `useQueryClient()` returns undefined. Force these through Vite's
            // pipeline so resolution is consistent. See #6151.
            noExternal: [
              '@tanstack/solid-router-ssr-query',
              '@tanstack/solid-query',
              '@tanstack/solid-query-devtools',
            ],
          },
        }
      },
      configEnvironment(environmentName, options) {
        return {
          optimizeDeps:
            environmentName === START_ENVIRONMENT_NAMES.client ||
            (environmentName === START_ENVIRONMENT_NAMES.server &&
              // This indicates that the server environment has opted in to dependency optimization
              options.optimizeDeps?.noDiscovery === false)
              ? {
                  // As `@tanstack/solid-start` depends on `@tanstack/solid-router`, we should exclude both.
                  exclude: [
                    '@tanstack/solid-start',
                    '@tanstack/solid-router',
                    '@tanstack/start-static-server-functions',
                  ],
                }
              : undefined,
        }
      },
    },
    tanStackStartVite(corePluginOpts, options),
  ]
}
