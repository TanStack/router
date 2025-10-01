import { toNodeHandler } from 'srvx/node'
import path from 'node:path'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const port = process.env.PORT || 3000

const startPort = process.env.START_PORT || 3001

export async function createStartServer() {
  const server = (await import('./dist/server/server.js')).default
  const nodeHandler = toNodeHandler(server.fetch)

  const app = express()

  app.use(express.static('./dist/client'))

  app.use(async (req, res, next) => {
    try {
      await nodeHandler(req, res)
    } catch (error) {
      next(error)
    }
  })

  return { app }
}

export async function createSpaServer() {
  const app = express()

  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://localhost:${startPort}/api`, // Replace with your target server's URL
      changeOrigin: false, // Needed for virtual hosted sites,
    }),
  )

  app.use(
    '/_serverFn',
    createProxyMiddleware({
      target: `http://localhost:${startPort}/_serverFn`, // Replace with your target server's URL
      changeOrigin: false, // Needed for virtual hosted sites,
    }),
  )

  app.use(express.static('./dist/client'))

  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.resolve('./dist/client/index.html'))
  })

  return { app }
}

createSpaServer().then(async ({ app }) =>
  app.listen(port, () => {
    console.info(`Client Server: http://localhost:${port}`)
  }),
)

createStartServer().then(async ({ app }) =>
  app.listen(startPort, () => {
    console.info(`Start Server: http://localhost:${startPort}`)
  }),
)
