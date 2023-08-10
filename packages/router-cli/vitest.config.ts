import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'router',
    watch: false,
    // deps: {
    //   interopDefault: true,
    //   inline: true,
    // },
  },
  resolve: {
    alias: {
      '@tanstack/react-store': resolve(
        __dirname,
        '../react-store/build/esm/index.js',
      ),
      '@tanstack/store': resolve(__dirname, '../store/build/esm/index.js'),
    },
  },
})
