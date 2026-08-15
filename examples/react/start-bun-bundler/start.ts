/**
 * TanStack Start — Bun bundler entry (no Vite).
 *
 * Contrast with examples/react/start-bun which still uses Vite to build and
 * Bun only as the production HTTP host.
 */
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({
  bun: {
    port: 3000,
    hostname: '0.0.0.0',
  },
  pages: [{ path: '/' }],
  prerender: {
    enabled: true,
    failOnError: true,
  },
})

const isDev = Bun.argv.includes('--dev')
const isBuild = Bun.argv.includes('--build') || !isDev

if (isDev) {
  await start.dev({ port: 3000 })
} else if (isBuild) {
  await start.build()
  console.info('[start-bun-bundler] build complete → dist/client + dist/server')
}
