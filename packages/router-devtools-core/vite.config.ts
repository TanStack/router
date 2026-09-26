import { allowedNodeEnvironmentFlags } from 'node:process'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [solid()],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    // Node 25+ exposes native Web Storage globals that shadow jsdom's storage.
    // Disable them in test workers so each jsdom window owns its storage.
    execArgv: allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
      ? ['--no-experimental-webstorage']
      : [],
    typecheck: { enabled: true },
    setupFiles: [],
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
  },
})

const merged = mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: './src/index.tsx',
    srcDir: './src',
    bundledDeps: ['solid-js', 'solid-js/web'],
  }),
)

merged.build.rolldownOptions.output.manualChunks = undefined
merged.build.rolldownOptions.output.preserveModules = false

export default merged
