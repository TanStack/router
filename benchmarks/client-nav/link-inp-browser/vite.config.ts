import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import type { Plugin } from 'vite'

const harnessDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(harnessDir, '../../..')

const framework = process.env.LINK_INP_FRAMEWORK
if (framework !== 'react' && framework !== 'solid' && framework !== 'vue') {
  throw new Error('Set LINK_INP_FRAMEWORK to react, solid or vue')
}
// Repository checkout whose built packages the app links against.
const packagesRoot = resolve(process.env.LINK_INP_PACKAGES_ROOT ?? repoRoot)
const outDir = resolve(
  process.env.LINK_INP_OUT_DIR ?? join(harnessDir, 'dist/candidate', framework),
)
// Bare imports of the harness sources resolve as if they were made from that
// checkout's client-nav benchmark package, so each arm bundles its own
// packages' `dist` (and their dependencies) with one identical app.
const proxyImporter = join(packagesRoot, 'benchmarks/client-nav/package.json')
if (!existsSync(proxyImporter)) {
  throw new Error(`Missing ${proxyImporter}`)
}

function packagesRootPlugin(): Plugin {
  return {
    name: 'link-inp-packages-root',
    enforce: 'pre',
    resolveId(id, importer, options) {
      if (
        !importer?.startsWith(harnessDir) ||
        importer.startsWith(join(harnessDir, 'node_modules') + sep) ||
        /^[./\0]/.test(id) ||
        id.includes(':') ||
        id.startsWith('vite/')
      ) {
        return null
      }
      return this.resolve(id, proxyImporter, { ...options, skipSelf: true })
    },
  }
}

export default defineConfig({
  root: join(harnessDir, framework),
  base: '/',
  logLevel: 'warn',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    packagesRootPlugin(),
    framework === 'react'
      ? react()
      : framework === 'solid'
        ? solid({ hot: false, dev: false })
        : vueJsx(),
  ],
  build: {
    outDir,
    emptyOutDir: true,
    modulePreload: false,
    sourcemap: true,
  },
})
