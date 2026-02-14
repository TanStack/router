import { defineConfig } from '@rsbuild/core'
import { createRequire } from 'node:module'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

const require = createRequire(import.meta.url)
const remotePort = Number(process.env.REMOTE_PORT || 3001)
const remoteOrigin = `http://localhost:${remotePort}`
const hostMode = process.env.HOST_MODE || 'ssr'
const isSpaMode = hostMode === 'spa'
const isPrerenderMode = hostMode === 'prerender'
const enableServerFederationRuntime = hostMode === 'ssr'
const shared = {
  react: {
    singleton: true,
    requiredVersion: false,
  },
  'react-dom': {
    singleton: true,
    requiredVersion: false,
  },
}
const startConfig = isSpaMode
  ? {
      spa: {
        enabled: true,
      },
    }
  : isPrerenderMode
    ? {
        prerender: {
          enabled: true,
          crawlLinks: false,
          autoStaticPathsDiscovery: false,
        },
        pages: [
          { path: '/' },
          { path: '/selective-client-only' },
        ],
      }
    : undefined

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation(
      {
        name: 'mf_host',
        remotes: {
          mf_remote: `mf_remote@${remoteOrigin}/remoteEntry.js`,
        },
        dts: false,
        experiments: {
          asyncStartup: true,
        },
        runtimePlugins: [require.resolve('@module-federation/node/runtimePlugin')],
        shared,
      },
      {
        environment: 'client',
      },
    ),
    pluginModuleFederation(
      {
        name: 'mf_host_ssr',
        remotes: {
          // Server remotes are fetched via node runtime over HTTP from the remote SSR output.
          mf_remote: `mf_remote@${remoteOrigin}/ssr/remoteEntry.js`,
        },
        dts: false,
        // Required by @module-federation/node runtime container loading.
        remoteType: 'script',
        experiments: {
          asyncStartup: true,
        },
        runtimePlugins: enableServerFederationRuntime
          ? [require.resolve('@module-federation/node/runtimePlugin')]
          : [],
        shared,
      },
      {
        target: 'node',
        environment: 'ssr',
      },
    ),
    ...tanstackStart(startConfig),
  ],
  environments: {
    ssr: {},
  },
})
