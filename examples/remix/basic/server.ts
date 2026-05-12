import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createStartHandler } from '@tanstack/remix-start/server'
import { makeRouter } from './src/router.ts'

/**
 * The Start handler dispatches `/_serverFn/<id>` requests to
 * `handleServerAction` (the framework-agnostic RPC runtime) and falls
 * through to the TSR app handler for everything else. Server functions
 * declared via `createServerFn` are exposed automatically — no
 * hand-rolled API endpoints to maintain.
 *
 * `<Frame>` SSR works out of the box: the underlying router handler's
 * default `resolveFrame` recurses through this same handler, so a
 * `<Frame src="/_serverFn/<id>">` resolves through the server-action
 * runtime — exactly the same path a client-side RPC call takes.
 */
const handler = createStartHandler({ createRouter: makeRouter })

const port = Number(process.env.PORT ?? 3000)
createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : (Readable.toWeb(req) as ReadableStream<Uint8Array>)
  const request = new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: body ? 'half' : undefined,
  } as RequestInit)

  const response = await handler(request)
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  if (response.body) {
    Readable.fromWeb(response.body as any).pipe(res)
  } else {
    res.end()
  }
}).listen(port, () => {
  console.log(`listening on http://localhost:${port}`)
})
