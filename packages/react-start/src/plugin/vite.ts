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

const isInsideRouterMonoRepo =
  path.basename(path.resolve(currentDir, '../../../../')) === 'packages'

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<PluginOption> {
  return [
    {
      name: 'tanstack-react-start:config',
      configEnvironment(environmentName, options) {
        return {
          resolve: {
            dedupe: [
              'react',
              'react-dom',
              '@tanstack/react-start',
              '@tanstack/react-router',
            ],
            external:
              options.resolve?.noExternal === true || !isInsideRouterMonoRepo
                ? undefined
                : ['@tanstack/react-router', '@tanstack/react-router-devtools'],
          },
          optimizeDeps:
            environmentName === VITE_ENVIRONMENT_NAMES.client ||
            (environmentName === VITE_ENVIRONMENT_NAMES.server &&
              // This indicates that the server environment has opted in to dependency optimization
              options.optimizeDeps?.noDiscovery === false)
              ? {
                  // As `@tanstack/react-start` depends on `@tanstack/react-router`, we should exclude both.
                  exclude: [
                    '@tanstack/react-start',
                    '@tanstack/react-router',
                    '@tanstack/react-router-devtools',
                    '@tanstack/start-static-server-functions',
                  ],
                  include: [
                    'react',
                    'react/jsx-runtime',
                    'react/jsx-dev-runtime',
                    'react-dom',
                    ...(environmentName === VITE_ENVIRONMENT_NAMES.client
                      ? ['react-dom/client']
                      : ['react-dom/server']),
                    // `@tanstack/react-store` has a dependency on `use-sync-external-store`, which is CJS.
                    // It therefore needs to be included so that it is converted to ESM.
                    '@tanstack/react-router > @tanstack/react-store',
                    ...(options.optimizeDeps?.exclude?.find(
                      (x) => x === '@tanstack/react-form',
                    )
                      ? ['@tanstack/react-form > @tanstack/react-store']
                      : []),
                  ],
                }
              : undefined,
        }
      },
    },
    TanStackStartVitePluginCore(
      {
        framework: 'react',
        defaultEntryPaths,
      },
      options,
    ),
  ]
}
