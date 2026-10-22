/**
 * A Start build through Start's public plugin, with each bundler: a server
 * fn is Start's RPC on the client and runs on the server, directly and by
 * the id the client calls (SPEC J4.1, J4.4); the router generator and code
 * splitter run, so the route tree links a route whose component loads on
 * demand (J1.4, J2.2, J2.6). The harness itself is checked by its controls
 * (`outside-compiler-corpus/build-harness.test.ts`).
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { probeRoutePath } from '../request-probe'

const timeout = 60_000

describe.each(startBundlers)('%s', (bundler) => {
  test(
    "a server fn is Start's RPC on the client: calling it fetches its URL, which carries its id; the SSR build runs the handler, directly and for a request of that id, and rejects an unknown id",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hello')
`,
          'src/client-entry.ts': `export { greet } from './fns'\n`,
          'src/ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      // The client run has no server: `requestsOf` records the requests
      // the call sends.
      const clientRpc = (
        await client.run(`${requestsOfPrelude}
return {
  url: entry.greet.url,
  requests: await requestsOf(entry.greet),
}`)
      ).result as {
        url: string
        requests: Array<{ url: string; method: string }>
      }
      expect(clientRpc).toEqual({
        url: expect.stringMatching(/^\/_serverFn\/./),
        requests: [{ url: clientRpc.url, method: 'GET' }],
      })
      const { result } = await ssr.run(`${callByIdPrelude}
const settle = async (run) => {
  try {
    return { value: await run() }
  } catch (error) {
    return { rejected: true }
  }
}
const id = serverFnId(${JSON.stringify(clientRpc.url)})
return {
  sameId: serverFnId(entry.greet) === id,
  called: await settle(() => entry.greet()),
  byId: await settle(() => callById(id)),
  unknown: await settle(() => callById('unknown-id')),
}`)
      // (what the server entry says about an unknown id is free; that it is
      // rejected, not answered, is not)
      expect(result).toEqual({
        sameId: true,
        called: { value: 'hello' },
        byId: { value: 'hello' },
        unknown: { rejected: true },
      })
    },
    timeout,
  )

  test(
    'the route generator and code splitter run: the route tree links a route whose component loads on demand',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => 'MARK_COMPONENT',
})
`,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
        },
        entry: 'src/entry.ts',
      })
      expect(client.where('MARK_COMPONENT')).toBe('lazy')
      // The real router over the generated tree renders the page at `/`
      // (loading the route's component chunk). (The harness's probe route,
      // which serves the requests SSR scripts run in, is left out.)
      const { result } = await ssr.run(`const { routeTree } = entry.getRouter()
return {
  ids: Object.values(routeTree.children)
    .map((route) => route.options.id)
    .filter((id) => id !== ${JSON.stringify(probeRoutePath)}),
  rendered: await entry.renderPath(routeTree, '/'),
}`)
      expect(result).toEqual({
        ids: ['/'],
        rendered: expect.stringContaining('MARK_COMPONENT'),
      })
    },
    timeout,
  )
})
