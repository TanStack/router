import { defineConfig } from 'vitest/config'
import dts from 'vite-plugin-dts'
import packageJson from './package.json'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.json'),
      outDir: 'dist',
    }),
  ],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
  },
  build: {
    lib: {
      entry: ['./src/index.ts'],
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // Bundle router-core and history instead of externalizing them
      external: [],
    },
  },
})

export default config

