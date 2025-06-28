import path from 'node:path'
import url from 'node:url'
import express from 'express'
import { trpcMiddleWare } from './trpc'

const isProd = process.env.NODE_ENV === 'production'

const app = express()

app.use('/trpc', trpcMiddleWare)

if (isProd) {
  const __filename = url.fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  app.use(express.static(path.resolve(__dirname,'../client')))

  // Handle any requests that don't match an API route by serving the React app's index.html
  app.get('/{*any}', (req, res) => {
    res.sendFile(path.resolve(__dirname,'../client','index.html'))
  })
}

app.listen(3000, () => {
  console.info('Client Server: http://localhost:3000')
})
