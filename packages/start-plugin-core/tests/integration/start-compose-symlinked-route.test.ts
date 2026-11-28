/**
 * A route file that is a symlink (`src/routes/alpha.tsx` →
 * `src/linked/alpha.tsx`) whose split component imports a stylesheet, built with Start's Vite and
 * Rsbuild plugins and served like a deployed app (start-compose-app.ts):
 * the server-rendered document links the route's stylesheet, as it does for
 * the same route in a plain file (Astra overall #2: the symlinked route's
 * CSS was emitted but not linked, so the first paint had no route styles).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import {
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

// the component's module imports the stylesheet: it loads with the split
// component, and the server's manifest attributes it to the route
const route = `import { createFileRoute } from '@tanstack/react-router'
import { Page } from '../Page'
export const Route = createFileRoute('/alpha')({ component: Page })
`

const files = (linked: boolean) => ({
  ...startPageEntries,
  'src/routes/__root.tsx': rootDocument(['/alpha']),
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_HOME</p> })
`,
  [linked ? 'src/linked/alpha.tsx' : 'src/routes/alpha.tsx']: route,
  'src/Page.tsx': `import './page.css'
export const Page = () => <p className="alpha">MARK_ALPHA</p>
`,
  'src/page.css': `.alpha { color: rgb(1, 2, 3); }\n`,
  'src/router.ts': routerFile,
  ...pageEntries,
})

describe.each(startBundlers)('%s build, served', (bundler) => {
  test.for([false, true])(
    'the document of the route links its stylesheet (route file symlinked: %s)',
    { timeout },
    async (linked: boolean) => {
      const build = await buildStart({
        bundler,
        files: files(linked),
        symlinks: linked
          ? { 'src/routes/alpha.tsx': 'src/linked/alpha.tsx' }
          : {},
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const served = await serveStartBuild(build)
      const html = await (await served.fetch('/alpha')).text()
      expect(html).toContain('MARK_ALPHA')
      const stylesheets = [
        ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g),
      ].flatMap(([tag]) => /href="([^"]+)"/.exec(tag)?.[1] ?? [])
      const texts = await Promise.all(
        stylesheets.map(async (href) => (await served.fetch(href)).text()),
      )
      expect(
        texts.some((text) => /rgb\(1,\s*2,\s*3\)|#010203/.test(text)),
      ).toBe(true)
    },
  )
})
