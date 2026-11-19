import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

// Serves the built app the way a static host serves a SPA: an existing file wins, a
// directory's index.html wins, and every other address falls back to the shell with a
// 200. That is `try_files $uri $uri/index.html /index.html` in nginx, and it is what
// makes the prerendered pages and the SPA fallback both reachable, unlike `serve`,
// which either 404s unknown addresses or rewrites every address to the shell.
const root = resolve(process.argv[2] ?? 'dist/client')
const port = Number(process.env.PORT ?? 3000)

const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const fileFor = (pathname) => {
  const candidate = join(root, normalize(pathname))
  if (!candidate.startsWith(root)) return join(root, 'index.html')
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  const nested = join(candidate, 'index.html')
  if (existsSync(nested)) return nested
  return join(root, 'index.html')
}

createServer((req, res) => {
  const file = fileFor(new URL(req.url ?? '/', 'http://localhost').pathname)
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
}).listen(port, () => {
  console.log(`Listening on http://localhost:${port}`)
})
