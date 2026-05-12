import { fileURLToPath } from 'node:url'
import path from 'pathe'
import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import type { PluginOption } from 'vite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(currentDir, '..', 'default-entry')

/**
 * Default entry paths used by `tanStackStartVite` when the app doesn't
 * provide its own `client.tsx` / `server.ts` / `start.ts` under the
 * configured `srcDirectory`. The bundled defaults are minimal Remix UI
 * adapters that hydrate the router on the client and stream the SSR'd
 * document on the server.
 */
const remixStartDefaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client.tsx'),
  server: path.resolve(defaultEntryDir, 'server.ts'),
  start: path.resolve(defaultEntryDir, 'start.ts'),
}

/**
 * Vite plugin for `@tanstack/remix-start`. Mirrors `solid-start/plugin/vite`
 * — wraps `tanStackStartVite` from `@tanstack/start-plugin-core` with
 * `framework: 'remix'` and the Remix-specific default entry paths.
 *
 * The biggest payoff is build-time `createServerFn` extraction: handler
 * bodies (and any module reachable only through them) are stripped from
 * the client bundle and replaced with an RPC fetcher. Server bundle keeps
 * the bodies. Same env-shake mechanism solid-start / react-start use.
 */
export function tanstackStart(
  options?: TanStackStartViteInputConfig,
): Array<PluginOption> {
  const corePluginOpts: TanStackStartVitePluginCoreOptions = {
    framework: 'remix',
    defaultEntryPaths: remixStartDefaultEntryPaths,
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    ssrResolverStrategy: {
      type: 'default',
    },
  }

  return [
    {
      name: 'tanstack-remix-start:config',
      config() {
        return {
          ssr: {
            // Force the Remix bindings + the Remix UI runtime to be
            // bundled in the SSR build (rather than loaded as
            // externals), matching the per-framework convention.
            noExternal: ['@tanstack/remix-router', '@remix-run/ui'],
          },
        }
      },
      configEnvironment(environmentName, options) {
        return {
          optimizeDeps:
            environmentName === START_ENVIRONMENT_NAMES.client ||
            (environmentName === START_ENVIRONMENT_NAMES.server &&
              options.optimizeDeps?.noDiscovery === false)
              ? {
                  exclude: [
                    '@tanstack/remix-start',
                    '@tanstack/remix-router',
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
