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

  return [
    TanStackStartVitePluginCore(
      {
        framework: 'solid',
        getVirtualServerHandlerEntry(ctx) {
          return `
import { toWebRequest, defineEventHandler } from '@tanstack/solid-start/server';
import serverEntry from '${ctx.ssrEntryFilepath}';

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
        getVirtualSsrEntry(ctx) {
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
    viteSolid({ ...options.solid, ssr: true }),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
