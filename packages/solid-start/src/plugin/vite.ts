import { fileURLToPath } from 'node:url'
import {
  TanStackStartVitePluginCore,
  VITE_ENVIRONMENT_NAMES,
} from '@tanstack/start-plugin-core'
import path from 'pathe'
import type { TanStackStartInputConfig } from '@tanstack/start-plugin-core'
import type { PluginOption } from 'vite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(
  currentDir,
  '..',
  '..',
  'plugin',
  'default-entry',
)
const defaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client.tsx'),
  server: path.resolve(defaultEntryDir, 'server.ts'),
  start: path.resolve(defaultEntryDir, 'start.ts'),
}

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<PluginOption> {
  return [
    {
      name: 'tanstack-solid-start:config',
      config() {
        // Ensure a single copy of Solid runtime packages is used across the
        // app, the router, and the auto-injected default client/server entries.
        // Without this, mixed pnpm resolutions (e.g. `@solidjs/web` beta.6
        // linked into `@tanstack/solid-start`'s node_modules vs. beta.7 in the
        // user's project) cause two parallel runtimes to be bundled. Two
        // `_$HY.done` setters then race, causing `hydrate()` to early-return
        // into non-hydrating render mode and breaking client interactivity.
        return {
          resolve: {
            dedupe: ['solid-js', '@solidjs/web', '@solidjs/signals'],
          },
        }
      },
      configEnvironment(environmentName, options) {
        return {
          optimizeDeps:
            environmentName === VITE_ENVIRONMENT_NAMES.client ||
            (environmentName === VITE_ENVIRONMENT_NAMES.server &&
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
    TanStackStartVitePluginCore(
      {
        framework: 'solid',
        defaultEntryPaths,
      },
      options,
    ),
  ]
}
