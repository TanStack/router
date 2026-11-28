/**
 * Start's Rsbuild `build --watch`, the server's Start manifest after a
 * rebuild: it is built again from the client build of the same rebuild, so
 * the page links the files that rebuild emitted (rule 3 of the Rsbuild host:
 * a generated module is as current as the content it was built from).
 * Source: review-hotspot3-merged-gemini.md, finding 3B.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildEntries } from '../route-css-cases'

const timeout = 120_000

describe('rsbuild build --watch: the manifest after a rebuild', () => {
  // Gemini 3B: the server's manifest module is built again from the client
  // build of the same rebuild (the page links the files that rebuild
  // emitted), in a watch build as in a dev server.
  const routes = {
    ...rsbuildEntries,
    'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
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
`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <p>MARK_FIRST</p>,
})
`,
  }
  test(
    'a watch rebuild after an edit: the page links the client files it emitted',
    async () => {
      const watched = await buildStart({
        bundler: 'rsbuild',
        files: routes,
        watchEdits: [
          {
            edits: {
              'src/routes/index.tsx': routes['src/routes/index.tsx'].replace(
                'MARK_FIRST',
                'MARK_EDITED',
              ),
            },
          },
        ],
      })
      const { url } = await watched.preview()
      const html = await (await fetch(url)).text()
      const statuses: Record<string, number> = {}
      for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
        statuses[src!] = (await fetch(new URL(src!, url))).status
      }
      expect(Object.keys(statuses)).not.toEqual([])
      expect(
        Object.entries(statuses).filter(([, status]) => status !== 200),
      ).toEqual([])
    },
    timeout,
  )
})
