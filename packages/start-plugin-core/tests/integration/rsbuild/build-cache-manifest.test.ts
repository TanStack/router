/**
 * Rsbuild's persistent cache (`performance.buildCache`): a build after a
 * source edit emits a new client entry, and the server-rendered page links
 * the files that build emitted, not the ones of the build the cache came
 * from.
 * Source: final gates of #8817 (the server-functions e2e app, built warm
 * after another build of it, linked the previous client entry: a 404, and
 * no page hydrated).
 */
import { expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildEntries } from '../route-css-cases'

const files = {
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

/** The status of each script the page at `/` names. */
async function scriptStatuses(url: string): Promise<Record<string, number>> {
  const html = await (await fetch(url)).text()
  const statuses: Record<string, number> = {}
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    statuses[src!] = (await fetch(new URL(src!, url))).status
  }
  return statuses
}

test('a build from the cache after an edit links the client entry it emitted', async () => {
  const cold = await buildStart({
    bundler: 'rsbuild',
    rsbuildConfig: { performance: { buildCache: true } },
    files,
  })
  const warm = await cold.rebuild({
    'src/routes/index.tsx': files['src/routes/index.tsx'].replace(
      'MARK_FIRST',
      'MARK_EDITED',
    ),
  })
  const { url } = await warm.preview()
  const statuses = await scriptStatuses(url)
  expect(Object.keys(statuses)).not.toEqual([])
  expect(
    Object.entries(statuses).filter(([, status]) => status !== 200),
  ).toEqual([])
})
