import { bench, describe } from 'vitest'
import { runRequestLoop } from '../bench-utils'
import type { StartRequestHandler } from '../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as { default: StartRequestHandler }

describe.each([
  { name: 'GET', methods: ['GET'] },
  { name: 'HEAD', methods: ['HEAD'] },
  { name: 'POST', methods: ['POST'] },
  { name: 'mixed', methods: ['GET', 'POST'] },
])('canonical request methods ($name)', ({ methods }) => {
  bench(
    '10 document requests',
    () =>
      runRequestLoop(handler, {
        seed: 0xdecafbad,
        concurrency: 1,
        totalRequests: 10,
        buildRequest: (_, index) => {
          const method = methods[index % methods.length]!
          return new Request('http://localhost/a/b/c/d?q=value', {
            method,
            headers: { accept: 'text/html' },
            body: method === 'POST' ? 'request body' : undefined,
          })
        },
      }),
    { warmupTime: 500, time: 3000, throws: true },
  )
})
