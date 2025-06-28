import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/server.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist/server',
  platform: 'node',
  format: "esm"
})
