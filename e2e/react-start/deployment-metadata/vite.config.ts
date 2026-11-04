import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { deploymentMetadata } from './src/deployment-metadata.config'
import type { Plugin } from 'vite'

const outDir = process.env.E2E_DIST_DIR ?? 'dist'
const withDeploymentMetadata = process.env.E2E_DEPLOYMENT_METADATA !== 'off'

function fakeDeploymentProvider(): Plugin {
  return {
    name: 'e2e-fake-deployment-provider',
    api: {
      'vite/deploymentMetadata': {
        id: 'e2e-fake-deployment-provider',
        getMetadata: () => [
          { id: 'VDM0001', version: 1, ...deploymentMetadata },
        ],
      },
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    outDir,
    // force url for asset tests
    assetsInlineLimit: 0,
  },
  plugins: [
    withDeploymentMetadata && fakeDeploymentProvider(),
    tanstackStart(),
    viteReact(),
  ],
})
