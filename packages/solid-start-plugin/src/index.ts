import viteSolid from 'vite-plugin-solid'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import { getTanStackStartOptions } from './schema'
import type { PluginOption } from 'vite'
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

  if (opts?.customViteSolidPlugin !== true) {
    console.warn(
      `please add the vite-solid plugin to your Vite config and set 'customViteSolidPlugin: true'`,
    )
    console.warn(
      `TanStack Start will not configure the vite-solid plugin in future anymore.`,
    )
  }

  return [
    TanStackStartVitePluginCore(
      {
        framework: 'solid',
        getVirtualServerRootHandler(ctx) {
          return `
import { toWebRequest, defineEventHandler } from '@tanstack/solid-start/server';
import serverEntry from '${ctx.serverEntryFilepath}';

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry({ request });
});`
        },
        getVirtualClientEntry(ctx) {
          return `
import { hydrate } from 'solid-js/web';
import { StartClient } from '@tanstack/solid-start';
import { createRouter } from '${ctx.routerFilepath}';

const router = createRouter();

hydrate(() => <StartClient router={router} />, document.body);`
        },
        getVirtualServerEntry(ctx) {
          return `
import { createStartHandler, defaultStreamHandler } from '@tanstack/solid-start/server';
import { createRouter } from '${ctx.routerFilepath}';

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);`
        },
      },
      options,
    ),
    !opts?.customViteSolidPlugin && viteSolid({ ...options.solid, ssr: true }),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
