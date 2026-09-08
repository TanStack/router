import path from 'node:path'
import { defineConfig, isRunnableDevEnvironment } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const outDir = process.env.E2E_DIST_DIR ?? 'dist'
const bundledDev = process.env.E2E_VITE_BUNDLED_DEV === 'true'

function ssrCacheProbe(): Plugin {
  const identities = new WeakMap<object, number>()
  let nextId = 1
  function getIdentity(value: object | null | undefined) {
    if (!value) {
      return 0
    }
    let id = identities.get(value)
    if (id === undefined) {
      id = nextId++
      identities.set(value, id)
    }
    return id
  }

  return {
    name: 'test:ssr-cache-probe',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/__test/ssr-cache') {
          return next()
        }
        const environment = server.environments.ssr
        if (!isRunnableDevEnvironment(environment)) {
          return next(new Error('Expected a runnable SSR environment'))
        }

        const snapshot = (fileName: string) => {
          const id = path.resolve(server.config.root, 'src/routes', fileName)
          return {
            exports: getIdentity(
              environment.runner.evaluatedModules.getModuleById(id)?.exports,
            ),
            transform: getIdentity(
              environment.moduleGraph.getModuleById(id)?.transformResult,
            ),
          }
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            root: snapshot('__root.tsx'),
            child: snapshot('child.tsx'),
          }),
        )
      })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  experimental: bundledDev ? { bundledDev: true } : undefined,
  build: {
    outDir,
  },
  server: {
    port: 3000,
  },
  plugins: [ssrCacheProbe(), tanstackStart(), viteReact()],
})
