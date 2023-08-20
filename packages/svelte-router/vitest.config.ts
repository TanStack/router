import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'svelte-router',
    watch: false,
    // deps: {
    //   interopDefault: true,
    //   inline: true,
    // },
  },
  resolve: {
    alias: {
      '@tanstack/store': resolve(__dirname, '../store/build/esm/index.js'),
    },
  },
})
