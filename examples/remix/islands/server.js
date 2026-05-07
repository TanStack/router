import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 5174)

const vite = await createViteServer({
  root: __dirname,
  server: { middlewareMode: true },
  appType: 'custom',
})

const server = http.createServer((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const url = req.url || '/'
      const template = await vite.transformIndexHtml(
        url,
        fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'),
      )

      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
      const stream = await render(url)

      const [head, tail] = template.split('<!--ssr-outlet-->')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.write(head)
      const reader = stream.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end(tail)
    } catch (err) {
      vite.ssrFixStacktrace(err)
      console.error(err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
      }
      res.end(String(err.stack ?? err))
    }
  })
})

server.listen(PORT, () => {
  console.log(`Remix 3 islands example: http://localhost:${PORT}/`)
})
