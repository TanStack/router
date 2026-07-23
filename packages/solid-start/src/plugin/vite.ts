import { joinPaths } from '@tanstack/router-core'
import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import { serverFunctions as solidServerFunctions } from 'vite-plugin-solid'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import { solidStartDefaultEntryPaths } from './shared'
import type { PluginOption } from 'vite'

export function tanstackStart(
  options?: TanStackStartViteInputConfig,
): Array<PluginOption> {
  const corePluginOpts: TanStackStartVitePluginCoreOptions = {
    framework: 'solid',
    defaultEntryPaths: solidStartDefaultEntryPaths,
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    ssrResolverStrategy: {
      type: 'default',
    },
    // Server functions compile to "use server" directive trampolines and run
    // through vite-plugin-solid's serverFunctions pipeline + the
    // @solidjs/web/server-functions runtime (see the serverFunctions plugins
    // appended below).
    serverFnTransport: 'directive',
  }

  // Must produce the same path as TSS_SERVER_FN_BASE (createServerFnBasePath):
  // vite-plugin-solid applies the Vite `base` itself, and the router basepath
  // defaults to that base — so only an explicitly configured basepath is
  // included here. Misaligned setups (vite base and router basepath both set,
  // to different values) are not supported with the directive transport.
  const serverFnEndpoint = joinPaths([
    '/',
    options?.router?.basepath ?? '',
    options?.serverFns?.base ?? '/_serverFn',
    '/',
  ])

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
          ssr: {
            noExternal: [
              '@tanstack/solid-router-ssr-query',
              '@tanstack/solid-query',
              '@tanstack/solid-query-devtools',
            ],
          },
        }
      },
      configEnvironment(environmentName, options) {
        return {
          optimizeDeps:
            environmentName === START_ENVIRONMENT_NAMES.client ||
            (environmentName === START_ENVIRONMENT_NAMES.server &&
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
      configResolved(config) {
        // Our serverFunctions plugins are appended below; if the user ALSO
        // enabled `serverFunctions` on their own vite-plugin-solid instance,
        // every "use server" module would be compiled twice.
        const compilerInstances = config.plugins.filter(
          (p) => p.name === 'solid:server-functions/compiler',
        ).length
        if (compilerInstances > 1) {
          config.logger.warn(
            '[tanstack-solid-start] Multiple vite-plugin-solid serverFunctions ' +
              'compilers detected. TanStack Start already configures server ' +
              'functions — remove the `serverFunctions` option from your ' +
              'viteSolid() plugin config.',
          )
        }
      },
    },
    tanStackStartVite(corePluginOpts, options),
    // The standalone serverFunctions() export (meta-framework mode): performs
    // the "use server" directive split + manifest, but installs no dev
    // middleware — TanStack Start dispatches the endpoint itself through
    // createStartHandler (see #tanstack-start-server-fn-dispatch).
    ...solidServerFunctions({ endpoint: serverFnEndpoint }),
  ]
}
