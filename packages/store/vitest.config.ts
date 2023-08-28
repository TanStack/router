import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'store',
    watch: false,
    // deps: {
    //   interopDefault: true,
    //   inline: true,
    // },
  },
})
