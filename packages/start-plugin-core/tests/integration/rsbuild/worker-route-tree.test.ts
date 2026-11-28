/**
 * Start's Rsbuild build, a worker (a child compiler of the client
 * compilation) that imports the route tree: it gets the client's tree, with
 * the pages and without the routes only the server handles. A pin of the
 * left-out piece "the route tree's transform inside Start's loader" (hotspot
 * 3 decision 6: green on the integration head).
 * Source: design-hotspot3-merged.md, review round 1, decision 6.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildEntries } from '../route-css-cases'
import { workerPlugin } from './worker-plugin'

const timeout = 180_000

const root = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`
const index = (
  mark: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { label } from '../label'
export const Route = createFileRoute('/')({
  component: () => <p>{label}${mark}</p>,
})
`
const label = `export const label = 'MARK_LABEL'\n`

describe('rsbuild build: a worker that imports the route tree', () => {
  // Piece 2. The worker is built by a child compiler of the client
  // compilation; the tree it gets is the client's (the pages, without the
  // routes only the server handles).
  test(
    "the worker's tree has the page and not the server-only route",
    async () => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/label.ts': label,
          'src/routes/index.tsx': index('MARK_ONE'),
          'src/routes/public-page.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/public-page')({ component: () => <p>MARK_PUBLIC</p> })
`,
          'src/routes/handler-only.ts': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/handler-only')({
  server: { handlers: { GET: () => new Response('MARK_HANDLER') } },
})
`,
          'src/worker.ts': `import { routeTree } from './routeTree.gen'
self.onmessage = () => self.postMessage(String(routeTree))
`,
        },
        rsbuildConfig: {
          environments: {
            client: { tools: { rspack: { plugins: [workerPlugin] } } },
          },
        },
      })
      const worker = fs.readFileSync(
        path.join(build.client.outDir, 'worker.js'),
        'utf8',
      )
      expect(worker).toContain('/public-page')
      expect(worker).not.toContain('/handler-only')
    },
    timeout,
  )
})
