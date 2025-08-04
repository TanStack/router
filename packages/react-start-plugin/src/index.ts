import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import path from 'pathe'
import { getTanStackStartOptions } from './schema'
import type { TanStackStartInputConfig, WithReactPlugin } from './schema'
import type { PluginOption } from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithReactPlugin,
} from './schema'

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

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig & WithReactPlugin,
): Array<PluginOption> {
  type OptionsWithReact = ReturnType<typeof getTanStackStartOptions> &
    WithReactPlugin
  const options: OptionsWithReact = getTanStackStartOptions(opts)

  if (opts?.customViteReactPlugin !== true) {
    console.warn(
      `please add the vite-react plugin to your Vite config and set 'customViteReactPlugin: true'`,
    )
    console.warn(
      `TanStack Start will not configure the vite-react plugin in future anymore.`,
    )
  }

  const isInsideRouterMonoRepo = (() => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    return path.basename(path.resolve(currentDir, '../../../')) === 'packages'
  })()

  return [
    {
      name: 'tanstack-react-start:config',
      configEnvironment() {
        return {
          resolve: {
            dedupe: ['react', 'react-dom', '@tanstack/react-router'],

            external: isInsideRouterMonoRepo
              ? ['@tanstack/react-router', '@tanstack/react-router-devtools']
              : undefined,
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
            ],
          },
        }
      },
    },
    TanStackStartVitePluginCore(
      {
        framework: 'react',
        getVirtualServerRootHandler(ctx) {
          return `
import { toWebRequest, defineEventHandler } from '@tanstack/react-start/server';
import serverEntry from '${ctx.serverEntryFilepath}';

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry({ request });
});`
        },
        getVirtualClientEntry(ctx) {
          return `
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from '${ctx.routerFilepath}';

const router = createRouter();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient router={router} />
    </StrictMode>
  );
});`
        },
        getVirtualServerEntry(ctx) {
          return `
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { createRouter } from '${ctx.routerFilepath}';

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);`
        },
        crawlPackages(opts) {
          if (opts.name === '@tanstack/react-router-devtools') {
            return 'exclude'
          }
          if (hasRootExport(opts.exports) && 'react' in opts.peerDependencies) {
            return 'include'
          }
          return undefined
        },
      },
      options,
    ),
    !opts?.customViteReactPlugin && viteReact(options.react),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
