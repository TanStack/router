import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from '@solidjs/vite-plugin'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [solid()],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: [],
    server: {
      deps: {
        inline: [/solid-js/, /@solidjs/],
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
    bundledDeps: ['solid-js', '@solidjs/web', '@solidjs/signals'],
  }),
)

// The library output is not minified, but styles.css is inlined as a string
// that consumers' minifiers cannot shrink, so minify the CSS here. esbuild
// keeps declaration values as written.
merged.build.cssMinify = 'esbuild'
merged.build.rolldownOptions.output.manualChunks = undefined
merged.build.rolldownOptions.output.preserveModules = false

export default merged
