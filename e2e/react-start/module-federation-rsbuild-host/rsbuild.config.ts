import { defineConfig } from '@rsbuild/core'
import { createRequire } from 'node:module'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

const require = createRequire(import.meta.url)
const remotePort = Number(process.env.REMOTE_PORT || 3001)
const remoteOrigin = `http://localhost:${remotePort}`
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
    ...tanstackStart(),
  ],
  environments: {
    ssr: {
      tools: {
        rspack: {
          plugins: [
            new ModuleFederationPlugin({
              name: 'mf_host_ssr',
              remotes: {
                mf_remote: `mf_remote@${remoteOrigin}/ssr/remoteEntry.js`,
              },
              dts: false,
              experiments: {
                asyncStartup: true,
              },
              remoteType: 'script',
              library: {
                type: 'commonjs-module',
              },
              runtimePlugins: [
                require.resolve('@module-federation/node/runtimePlugin'),
              ],
              shared,
            }),
          ],
        },
      },
    },
  },
})
