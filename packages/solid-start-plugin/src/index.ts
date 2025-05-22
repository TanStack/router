import path from 'node:path'
import viteSolid from 'vite-plugin-solid'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import * as vite from 'vite'
import { getTanStackStartOptions } from './schema'
import type { PluginOption, ResolvedConfig } from 'vite'
import type { TanStackStartInputConfig, WithSolidPlugin } from './schema'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithSolidPlugin,
} from './schema'

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig & WithSolidPlugin,
): Array<PluginOption> {
  type OptionsWithSolid = ReturnType<typeof getTanStackStartOptions> &
    WithSolidPlugin
  const options: OptionsWithSolid = getTanStackStartOptions(opts)

  let resolvedConfig: ResolvedConfig

  return [
    TanStackStartVitePluginCore({ framework: 'solid' }, options),
    {
      name: 'tanstack-solid-start:resolve-entries',
      configResolved: (config) => {
        resolvedConfig = config
      },
      resolveId(id) {
        if (
          [
            '/~start/server-entry',
            '/~start/default-server-entry',
            '/~start/default-client-entry',
          ].includes(id)
        ) {
          return `${id}.tsx`
        }

        return null
      },
      load(id) {
        const routerImportPath = JSON.stringify(
          path.resolve(options.root, options.tsr.srcDirectory, 'router'),
        )

        if (id === '/~start/server-entry.tsx') {
          const serverEntryPath = options.serverEntryPath
            ? vite.normalizePath(
                path.resolve(resolvedConfig.root, options.serverEntryPath),
              )
            : undefined

          return serverEntryPath
            ? `export { default } from from '${serverEntryPath}';`
            : `
import { toWebRequest, createStartHandler, defaultStreamHandler, defineEventHandler } from '@tanstack/solid-start/server';
import { createRouter } from ${routerImportPath};

const serverEntry = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry({ request });
})
`
        }

        if (id === '/~start/default-client-entry.tsx') {
          return `
import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

hydrate(() => <StartClient router={router} />, document.body)
`
        }

        return null
      },
    },
    viteSolid({ ...options.solid, ssr: true }),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
