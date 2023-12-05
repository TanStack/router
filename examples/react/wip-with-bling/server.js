import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import getPort, { portNumbers } from 'get-port'
import { handleFetch$, hasHandler } from '@tanstack/bling/server'
import { Request, Response } from 'node-fetch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

process.env.MY_CUSTOM_SECRET = 'API_KEY_qwertyuiop'

const expressRequestToRequest = (expressReq) => {
  const url = `${expressReq.protocol}://${expressReq.get('host')}${
    expressReq.originalUrl
  }`
  const headers = {}
  expressReq.rawHeaders.forEach((val, i, arr) => {
    if (i % 2 === 0) headers[val] = arr[i + 1]
  })

  const options = {
    method: expressReq.method,
    headers,
  }

  if (
    ['POST', 'PUT', 'PATCH'].includes(expressReq.method) &&
    expressReq.readable
  ) {
    options.body = expressReq
  }

  return new Request(url, options)
}

async function responseToExpressResponse(nativeRes, res) {
  // Extract headers from native Response
  const headers = {}
  nativeRes.headers.forEach((value, name) => {
    headers[name] = value
  })

  // Extract body from native Response
  const body = await nativeRes.text() // or nativeRes.json(), depending on need

  // Transfer to Express Response
  res.set(headers)
  res.status(nativeRes.status)
  res.send(body)
}

export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort,
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
    app.use((await import('compression')).default())
    app.use(
      (await import('serve-static')).default(resolve('dist/client'), {
        index: false,
      }),
    )
  }

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl

      const request = expressRequestToRequest(req)

      if (hasHandler(request.url)) {
        const response = await handleFetch$({
          request: request,
        })

        return responseToExpressResponse(response, res)
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
          return import('./dist/server/entry-server.tsx')
        }
      })()

      entry.render({ req, res, url, head: viteHead })
    } catch (e) {
      !isProd && vite.ssrFixStacktrace(e)
      console.error(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

if (!isTest) {
  createServer().then(async ({ app }) =>
    app.listen(await getPort({ port: portNumbers(3000, 3100) }), () => {
      console.info('Client Server: http://localhost:3000')
    }),
  )
}
