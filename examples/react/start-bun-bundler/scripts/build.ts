import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({
  pages: [{ path: '/' }],
  prerender: {
    enabled: true,
    failOnError: true,
  },
})

await start.build()
console.info('[start-bun-bundler] build complete → dist/client + dist/server')
