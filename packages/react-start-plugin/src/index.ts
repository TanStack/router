import viteReact from '@vitejs/plugin-react'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import { getTanStackStartOptions } from './schema'
import type { TanStackStartInputConfig, WithReactPlugin } from './schema'
import type { PluginOption } from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithReactPlugin,
} from './schema'

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

  return [
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
      },
      options,
    ),
    !opts?.customViteReactPlugin && viteReact(options.react),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
