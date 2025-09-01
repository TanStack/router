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
  client: path.resolve(defaultEntryDir, 'client'),
  server: path.resolve(defaultEntryDir, 'server'),
}

const isInsideRouterMonoRepo =
  path.basename(path.resolve(currentDir, '../../../../')) === 'packages'

function hasRootExport(
  exportsField?: Record<string, unknown> | string,
): boolean {
  if (!exportsField) return false

  if (typeof exportsField === 'string') {
    // shorthand form: "exports": "./index.js"
    return true
  }

  if (typeof exportsField === 'object') {
    return '.' in exportsField
  }

  return false
}

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<PluginOption> {
  return [
    {
      name: 'tanstack-react-start:config',
      configEnvironment(env, userConfig) {
        return {
          resolve: {
            dedupe: ['react', 'react-dom', '@tanstack/react-router'],

            external:
              userConfig.resolve?.noExternal === true || !isInsideRouterMonoRepo
                ? undefined
                : ['@tanstack/react-router', '@tanstack/react-router-devtools'],
          },

          optimizeDeps: {
            exclude: ['@tanstack/react-router-devtools'],
            include: [
              'react',
              'react/jsx-runtime',
              'react/jsx-dev-runtime',
              'react-dom',
              'react-dom/client',
              '@tanstack/react-router',
              ...(env === VITE_ENVIRONMENT_NAMES.server
                ? ['react-dom/server']
                : []),
            ],
          },
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
