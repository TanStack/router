import { defineConfig } from '@rsbuild/core'
import { createRequire } from 'node:module'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'

const require = createRequire(import.meta.url)
const remotePort = Number(process.env.REMOTE_PORT || 3001)
const remoteOrigin = `http://localhost:${remotePort}`
const sharedForWeb = {
  react: {
    singleton: true,
    requiredVersion: false,
  },
  'react-dom': {
    singleton: true,
    requiredVersion: false,
  },
}
const sharedForNode = {
  react: {
    // Keep host-owned React in node runtime.
    // With remoteType=script + node runtime plugin, remote shared fallbacks
    // can otherwise trigger SSR chunk loading incompatibilities.
    import: false,
    singleton: true,
    requiredVersion: false,
  },
  'react-dom': {
    // Keep host-owned ReactDOM in node runtime.
    import: false,
    singleton: true,
    requiredVersion: false,
  },
}

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation(
      {
        name: 'mf_remote',
        filename: 'remoteEntry.js',
        exposes: {
          './message': './src/message.tsx',
          './routes': './src/routes.tsx',
          './server-data': './src/server-data.ts',
        },
        experiments: {
          asyncStartup: true,
        },
        runtimePlugins: [require.resolve('@module-federation/node/runtimePlugin')],
        shared: sharedForWeb,
      },
      {
        environment: 'web',
      },
    ),
    pluginModuleFederation(
      {
        name: 'mf_remote',
        filename: 'remoteEntry.js',
        dts: false,
        library: {
          type: 'commonjs-module',
        },
        remoteType: 'script',
        exposes: {
          './message': './src/message.tsx',
          './routes': './src/routes.tsx',
          './server-data': './src/server-data.ts',
        },
        experiments: {
          asyncStartup: true,
        },
        runtimePlugins: [require.resolve('@module-federation/node/runtimePlugin')],
        shared: sharedForNode,
      },
      {
        target: 'node',
        environment: 'ssr',
      },
    ),
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
        },
      },
    },
  },
})
