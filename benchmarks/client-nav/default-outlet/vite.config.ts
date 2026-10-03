import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export function createDefaultOutletConfig(target: 'client' | 'ssr') {
  const server = target === 'ssr'
  return defineConfig({
    root,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [
      !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
        codspeedPlugin(),
      react(),
    ],
    resolve: { conditions: [server ? 'node' : 'browser', 'production'] },
    ssr: {
      noExternal: process.env.VITEST ? undefined : true,
      resolve: { conditions: ['node', 'production'] },
    },
    build: {
      outDir: server ? './dist/ssr' : './dist',
      emptyOutDir: true,
      minify: false,
      ssr: server,
      lib: {
        entry: `${root}src/${target}.tsx`,
        formats: ['es'],
        fileName: 'app',
      },
      rolldownOptions: {
        platform: 'node',
        external: [
          'node:module',
          'module',
          /^react(?:\/|$)/,
          /^react-dom(?:\/|$)/,
        ],
        output: { entryFileNames: 'app.js' },
      },
    },
    test: {
      name: server
        ? 'react-default-outlet-performance-ssr'
        : 'react-default-outlet-performance',
      watch: false,
      environment: server ? 'node' : 'jsdom',
      setupFiles: server ? [] : ['../vitest.setup.ts'],
      server: { deps: { external: [/\/default-outlet\/dist\//] } },
      include: [],
      benchmark: { include: [`${target}.bench.ts`] },
    },
  })
}

export default createDefaultOutletConfig('client')
