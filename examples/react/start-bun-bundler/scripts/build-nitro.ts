import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({
  pages: [{ path: '/' }],
  prerender: {
    enabled: true,
    failOnError: true,
  },
  bun: {
    nitro: {
      preset: 'node-server',
    },
  },
})

await start.build()
console.info(
  '[start-bun-bundler] nitro build complete → dist/* + .output/public + .output/server',
)
