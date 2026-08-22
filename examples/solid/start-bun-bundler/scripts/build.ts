import { tanstackStart } from '@tanstack/solid-start/plugin/bun'

const start = tanstackStart({
  bun: {
    port: 3000,
    hostname: '0.0.0.0',
  },
  // Keep routes in the server bundle for this minimal example (lazy splits
  // need more Solid SSR wiring under Bun before they render reliably).
  router: {
    autoCodeSplitting: false,
  },
})

await start.build()
console.info('[start-bun-bundler] build complete → dist/client + dist/server')
