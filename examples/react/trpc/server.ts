import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { appRouter } from './src/server/trpc'
import { createHTTPServer } from '@trpc/server/adapters/standalone'
import cors from 'cors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

process.env.MY_CUSTOM_SECRET = 'API_KEY_qwertyuiop'

export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort = 5173,
) {
  const resolve = (p) => path.resolve(__dirname, p)

  const app = express()

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite
  if (!isProd) {
    vite = await (
      await import('vite')
    ).createServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: 'custom',
    })
    // use vite's connect instance as middleware
    app.use(vite.middlewares)
  } else {
    throw new Error('Production is not supported yet')
  }

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl
      console.log('url', url)

      if (url.includes('.')) {
        console.warn(`${url} is not valid router path`)
        return res.status(404)
      }

      // Extract the head from vite's index transformation hook
      let viteHead = !isProd
        ? await vite.transformIndexHtml(
            url,
            `<html><head></head><body></body></html>`,
          )
        : ''

      viteHead = viteHead.substring(
        viteHead.indexOf('<head>') + 6,
        viteHead.indexOf('</head>'),
      )

      const entry = await (async () => {
        if (!isProd) {
          return vite.ssrLoadModule('/src/entry-server.tsx')
        } else {
          throw new Error('Production is not supported yet')
        }
      })()

      // Control/hydrate all the way up to <html>
      // Modify head
      // Request/Response control at the route level

      entry.render({ req, res, url, head: viteHead })
    } catch (e) {
      !isProd && vite.ssrFixStacktrace(e)
      console.log(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(3000, () => {
      console.log('Client Server: http://localhost:3000')
    }),
  )

  createHTTPServer({
    router: appRouter,
    middleware: cors(),
  }).listen(4000)
}
