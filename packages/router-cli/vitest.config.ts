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
  resolve: {},
})
