import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({
  pages: [{ path: '/' }],
  prerender: {
    enabled: true,
    failOnError: true,
  },
  bun: {
    standalone: {
      outfile: 'dist/server/start',
    },
  },
})

await start.build()
console.info(
  '[start-bun-bundler] standalone build complete → dist/server/start',
)
