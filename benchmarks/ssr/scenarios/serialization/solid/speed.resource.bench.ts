import { bench } from 'vitest'
import { gzipSync } from 'node:zlib'
import { randomSegment, runRequestLoop } from '../../../bench-utils'
import { serializationBenchOptions } from '../shared-bench'
import type { StartRequestHandler } from '../../../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as { default: StartRequestHandler }

const buildRequest = (id: string) =>
  new Request(`http://localhost/resource/${id}`, {
    headers: { accept: 'text/html' },
  })
for (const mode of ['shell', 'late']) {
  const response = await handler.fetch(buildRequest(`${mode}-sanity`))
  const html = await response.text()
  if (
    response.status !== 200 ||
    !html.includes(`rich-${mode}-sanity`) ||
    !html.includes('$bench/point') ||
    (mode === 'late' && !html.includes('<template id='))
  ) {
    throw new Error(
      'Expected a rendered resource with custom serialization adapters',
    )
  }
  console.info(
    `${mode} resource HTML: ${Buffer.byteLength(html)} bytes, ${gzipSync(html).byteLength} gzip bytes`,
  )

  bench(
    `ssr custom adapter resource ${mode} (solid)`,
    () =>
      runRequestLoop(handler, {
        seed: 0xdecafbad,
        concurrency: 16,
        totalRequests: 32,
        buildRequest: (random, index) =>
          buildRequest(`${mode}-${randomSegment(random)}-${index}`),
      }),
    serializationBenchOptions,
  )
}
