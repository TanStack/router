import { toNodeHandler } from 'srvx/node'
import express from 'express'

const port = process.env.PORT || 3000

async function createStartServer() {
  const server = (await import('../dist/server/server.js')).default
  const nodeHandler = toNodeHandler(server.fetch)

  const app = express()

  // Serve static client assets (matching basic example pattern)
  app.use(express.static('../dist/client', { redirect: false }))

  app.use(async (req, res, next) => {
    try {
      await nodeHandler(req, res)
    } catch (error) {
      next(error)
    }
  })

  return { app }
}

createStartServer().then(async ({ app }) =>
  app.listen(port, () => {
    console.log(`Flamegraph bench server: http://localhost:${port}`)
  }),
)
