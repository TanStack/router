import { tanstackStart } from '@tanstack/vue-start/plugin/bun'

const start = tanstackStart({
  bun: {
    port: 3000,
    hostname: '0.0.0.0',
  },
  // Keep routes in the server bundle for this minimal example.
  router: {
    autoCodeSplitting: false,
  },
})

await start.build()
console.info('[start-bun-bundler] build complete → dist/client + dist/server')
