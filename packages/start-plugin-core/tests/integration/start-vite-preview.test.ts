/**
 * `vite preview` over HTTPS, as a browser uses it: HTTP/2 (Vite's HTTPS
 * server is an HTTP/2 server that also accepts HTTP/1.1) and
 * `accept-encoding: gzip` (Vite preview's compression middleware).
 */
import http2 from 'node:http2'
import https from 'node:https'
import { gunzipSync } from 'node:zlib'
import { generate } from 'selfsigned'
import { expect, onTestFinished, test } from 'vitest'
import {
  appFiles,
  buildStartApp,
  createStartApp,
  startVitePreview,
} from './start-app'
import type { AddressInfo } from 'node:net'

const timeout = 60_000

const app = appFiles({
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => 'MARK_INDEX_PAGE',
})
`,
  'src/routes/cookies.ts': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/cookies')({
  server: {
    handlers: {
      GET: () => {
        const headers = new Headers({ 'content-type': 'text/plain' })
        headers.append('set-cookie', 'a=1; Path=/')
        headers.append('set-cookie', 'b=2; Path=/')
        // (over the compression middleware's threshold, 1 kB)
        return new Response('x'.repeat(2048), { status: 201, headers })
      },
    },
  },
})
`,
})

/** Builds the app and serves it with `vite preview` over HTTPS; returns its origin. */
async function previewOverHttps() {
  const startApp = await createStartApp(app)
  await buildStartApp(startApp, 'vite')
  const pems = await generate([{ name: 'commonName', value: 'localhost' }])
  const server = await startVitePreview(startApp, {
    https: { key: pems.private, cert: pems.cert },
  })
  const { port } = server.httpServer.address() as AddressInfo
  return `https://localhost:${port}`
}

interface Answer {
  status: number
  headers: Record<string, string | Array<string> | undefined>
  body: string
}

/** GETs `path` the way a browser does: gzip accepted, over `protocol`. */
async function get(
  origin: string,
  path: string,
  protocol: 'HTTP/2' | 'HTTP/1.1',
): Promise<Answer> {
  const chunks: Array<Buffer> = []
  const { status, headers } = await new Promise<Omit<Answer, 'body'>>(
    (resolve, reject) => {
      if (protocol === 'HTTP/2') {
        const client = http2.connect(origin, { rejectUnauthorized: false })
        onTestFinished(() => {
          client.close()
        })
        client.on('error', reject)
        const req = client.request({ ':path': path, 'accept-encoding': 'gzip' })
        let answer: Omit<Answer, 'body'>
        req.on('response', ({ ':status': responseStatus, ...rest }) => {
          answer = { status: Number(responseStatus), headers: rest }
        })
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => resolve(answer))
        req.on('error', reject)
        req.end()
      } else {
        const req = https.get(
          `${origin}${path}`,
          { rejectUnauthorized: false, headers: { 'accept-encoding': 'gzip' } },
          (res) => {
            res.on('data', (chunk: Buffer) => chunks.push(chunk))
            res.on('end', () =>
              resolve({ status: res.statusCode!, headers: res.headers }),
            )
            res.on('error', reject)
          },
        )
        req.on('error', reject)
      }
    },
  )
  const raw = Buffer.concat(chunks)
  const gzipped = headers['content-encoding'] === 'gzip'
  return {
    status,
    headers,
    body: (gzipped ? gunzipSync(raw) : raw).toString(),
  }
}

/** Response headers whose name is a number ("0", "1", ...). */
function numberedHeaders(answer: Answer) {
  return Object.keys(answer.headers).filter((name) => /^\d+$/.test(name))
}

// The preview server copied a response's headers with `res.setHeaders`, which
// Node's HTTP/2 response has not: every page answered 500 over HTTP/2.
test(
  'vite preview over HTTPS: a page renders over HTTP/2',
  async () => {
    const origin = await previewOverHttps()
    const answer = await get(origin, '/', 'HTTP/2')
    expect(answer.status).toBe(200)
    expect(answer.headers['content-type']).toMatch(/^text\/html/)
    expect(answer.body).toContain('MARK_INDEX_PAGE')
  },
  timeout,
)

// A response's headers reach the browser as the app set them, over both
// protocols: every cookie (copied one header at a time, each `set-cookie`
// replaced the last), and no headers named "0", "1", ... (the compression
// middleware's `writeHead` took the flat `[name, value, ...]` array the
// response was then sent with for an object of headers).
for (const protocol of ['HTTP/2', 'HTTP/1.1'] as const) {
  test(
    `vite preview over HTTPS, ${protocol}: every cookie arrives, and no other header`,
    async () => {
      const origin = await previewOverHttps()
      const answer = await get(origin, '/cookies', protocol)
      expect(answer.status).toBe(201)
      expect(answer.headers['set-cookie']).toEqual([
        'a=1; Path=/',
        'b=2; Path=/',
      ])
      expect(numberedHeaders(answer)).toEqual([])
      expect(answer.headers['content-encoding']).toBe('gzip')
      expect(answer.body).toBe('x'.repeat(2048))
    },
    timeout,
  )
}
