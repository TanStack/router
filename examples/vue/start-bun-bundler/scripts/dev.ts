import { tanstackStart } from '@tanstack/vue-start/plugin/bun'

const start = tanstackStart({
  bun: {
    port: 3000,
    hostname: '0.0.0.0',
  },
  router: {
    autoCodeSplitting: false,
  },
})

await start.dev({ port: 3000 })
