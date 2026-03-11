import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = process.env.CDN_PORT || 3002

const app = express()

// Health check endpoint for Playwright webServer readiness.
// This should return 200 even before the client build exists.
app.get('/health', (_req, res) => {
  res.status(200).send('ok')
})

// Serve the built client assets with CORS headers to simulate a CDN
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  next()
})

app.use(express.static(path.resolve(__dirname, '..', 'dist', 'client')))

app.listen(port, () => {
  console.info(`CDN Server: http://localhost:${port}`)
})
