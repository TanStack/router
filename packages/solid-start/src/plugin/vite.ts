import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import { solidStartDefaultEntryPaths } from './shared'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import type { PluginOption } from 'vite'

// @solidjs/vite-plugin's client-assets manifest: resolves the module keys its
// compiler bakes into lazy() calls to client JS/CSS assets — a live resolver
// over the dev module graph in dev, the client build's `.vite/manifest.json`
// in builds. Solid's server renderer consumes either shape natively.
const SOLID_MANIFEST_ID = 'virtual:solid-manifest'

// @tanstack/solid-router's inert stand-in for that manifest (see the stub's
// doc comment). We swap its content for the real thing in the server
// environment, matched by path across every dist flavor of the package.
const CLIENT_ASSETS_MANIFEST_STUB_RE =
  /solid-router\/(?:src|dist\/[^/]+)\/ssr\/clientAssetsManifest\.[cm]?[jt]sx?$/

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
  }

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
          // The build flavor of `virtual:solid-manifest` reads the client
          // build's `.vite/manifest.json`, which vite only emits on demand.
          build:
            environmentName === START_ENVIRONMENT_NAMES.client
              ? { manifest: true }
              : undefined,
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
    },
    {
      name: 'tanstack-solid-start:client-assets-manifest',
      async load(id) {
        if (this.environment.name !== START_ENVIRONMENT_NAMES.server) {
          return undefined
        }

        const cleanId = id.split('?')[0]!
        if (!CLIENT_ASSETS_MANIFEST_STUB_RE.test(cleanId)) {
          return undefined
        }

        // Only swap when the installed @solidjs/vite-plugin actually registers
        // the virtual module (older versions don't) — otherwise keep the
        // inert stub.
        const resolved = await this.resolve(SOLID_MANIFEST_ID, id)
        if (!resolved) {
          return undefined
        }

        // TanStack Start already emits entry/route CSS and preloads through
        // its own route manifest, so neutralize `isEntry` before handing the
        // built manifest to Solid — otherwise its registerEntryAssets pass
        // duplicates the entry stylesheet link. Lazy() module lookups are
        // unaffected. The dev flavor is a `{ resolve }` bridge and passes
        // through untouched (Solid skips entry registration for resolvers).
        return `import manifest from '${SOLID_MANIFEST_ID}'
const clientAssetsManifest =
  manifest && typeof manifest === 'object' && typeof manifest.resolve !== 'function'
    ? Object.fromEntries(
        Object.entries(manifest).map(([key, entry]) =>
          entry && typeof entry === 'object' && entry.isEntry
            ? [key, { ...entry, isEntry: false }]
            : [key, entry],
        ),
      )
    : manifest
export default clientAssetsManifest
`
      },
    },
    tanStackStartVite(corePluginOpts, options),
  ]
}
