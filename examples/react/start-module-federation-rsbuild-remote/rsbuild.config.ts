import { defineConfig } from '@rsbuild/core'
import { createRequire } from 'node:module'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'

const require = createRequire(import.meta.url)
const remotePort = Number(process.env.REMOTE_PORT || 3001)
const remoteOrigin = `http://localhost:${remotePort}`

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'mf_remote',
      filename: 'remoteEntry.js',
      exposes: {
        './message': './src/message.tsx',
      },
      runtimePlugins: [require.resolve('@module-federation/node/runtimePlugin')],
      shared: {
        react: {
          singleton: true,
          requiredVersion: false,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: false,
        },
      },
    }),
  ],
  environments: {
    web: {
      output: {
        assetPrefix: `${remoteOrigin}/`,
      },
    },
    ssr: {
      source: {
        entry: {},
      },
      output: {
        assetPrefix: `${remoteOrigin}/ssr/`,
        cleanDistPath: false,
        distPath: {
          root: 'ssr',
        },
      },
      tools: {
        rspack: {
          target: 'async-node',
          output: {
            chunkFormat: 'commonjs',
            chunkLoading: 'async-node',
            library: {
              type: 'commonjs-module',
            },
          },
          plugins: [
            new ModuleFederationPlugin({
              name: 'mf_remote',
              filename: 'remoteEntry.js',
              library: {
                type: 'commonjs-module',
              },
              dts: false,
              exposes: {
                './message': './src/message.tsx',
              },
              runtimePlugins: [
                require.resolve('@module-federation/node/runtimePlugin'),
              ],
              shared: {
                react: {
                  singleton: true,
                  requiredVersion: false,
                },
                'react-dom': {
                  singleton: true,
                  requiredVersion: false,
                },
              },
            }),
          ],
        },
      },
    },
  },
})
