import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import type { TanStackStartInputConfig } from '@tanstack/start-plugin-core'
import type { PluginOption } from 'vite'

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<PluginOption> {
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
  ]
}
