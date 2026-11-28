/**
 * Start's Rsbuild host, one Rsbuild instance that builds, fails a build and
 * builds again: the last build's page links the client files that build
 * emitted (the client build the server publishes is the current run's), with
 * and without RSC, and with the persistent cache. A pin of the left-out piece "the client build publication
 * on the session" (hotspot 3 decision 6: green on the integration head).
 * Source: design-hotspot3-merged.md, review round 1, decision 6.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'
import { rsbuildEntries } from '../route-css-cases'
import type { StartPluginOptions } from '../../start-plugins'

/** Two or three builds of an app on one Rsbuild instance. */
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
const brokenLabel = `import { missing } from './does-not-exist'\nexport const label = missing\n`

/** The page at `/`: its status, its text, and the status of each script it names. */
async function page(url: string) {
  const response = await fetch(url)
  const html = await response.text()
  const scripts: Record<string, number> = {}
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    scripts[src!] = (await fetch(new URL(src!, url))).status
  }
  return { status: response.status, html, scripts }
}

describe('rsbuild: the client build the server publishes, on one Rsbuild instance', () => {
  // Piece 1. A build, a build that fails (an import that does not resolve),
  // a repaired build: the last one's page links the files it emitted, and
  // shows its own content.
  test(
    'a failed build between two builds: the next build serves its own client files',
    async () => {
      const first = await buildStart({
        bundler: 'rsbuild',
        samePlugins: true,
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/label.ts': label,
          'src/routes/index.tsx': index('MARK_ONE'),
        },
      })
      await expect(
        first.rebuild({ 'src/label.ts': brokenLabel }),
      ).rejects.toThrow()
      const third = await first.rebuild({
        'src/label.ts': label,
        'src/routes/index.tsx': index('MARK_THREE'),
        'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: () => <p>MARK_ABOUT</p> })
`,
      })
      const { url } = await third.preview()
      const served = await page(url)
      expect(served.status).toBe(200)
      expect(served.html).toContain('MARK_THREE')
      expect(Object.keys(served.scripts)).not.toEqual([])
      expect(
        Object.entries(served.scripts).filter(([, status]) => status !== 200),
      ).toEqual([])
      expect((await fetch(new URL('/about', url))).status).toBe(200)
    },
    timeout,
  )

  // With the persistent cache: the server's Start manifest module is
  // restored with the first build's manifest; it is built again from the
  // second build's, as any module Start generates (rule 3 of the Rsbuild
  // host). Upstream cause: web-infra-dev/rspack#16785 (a virtual-module
  // write the persistent cache does not see).
  // Source: re-check 6 finding 1.
  test(
    'with the persistent cache, an edited route built again: the page links the files that build emitted',
    async () => {
      const first = await buildStart({
        bundler: 'rsbuild',
        samePlugins: true,
        rsbuildConfig: { performance: { buildCache: true } },
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/label.ts': label,
          'src/routes/index.tsx': index('MARK_ONE'),
        },
      })
      const second = await first.rebuild({
        'src/routes/index.tsx': index('MARK_TWO'),
      })
      const { url } = await second.preview()
      const served = await page(url)
      expect(served.status).toBe(200)
      expect(served.html).toContain('MARK_TWO')
      expect(Object.keys(served.scripts)).not.toEqual([])
      expect(
        Object.entries(served.scripts).filter(([, status]) => status !== 200),
      ).toEqual([])
    },
    timeout,
  )

  // The same with RSC, whose client and server compilations run beside each
  // other (Astra's open case: what the server publishes of a client build
  // that failed).
  test(
    'with RSC, a failed build between two builds: the next build serves its own client files',
    async () => {
      const rscEnabled: StartPluginOptions = { rsc: { enabled: true } }
      const first = await buildStart({
        bundler: 'rsbuild',
        samePlugins: true,
        entry: 'src/entry.ts',
        symlinks: rsbuildRscLinks(),
        start: rscEnabled,
        files: {
          'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
          'src/routes/__root.tsx': root,
          'src/label.ts': label,
          'src/routes/index.tsx': index('MARK_ONE'),
          'src/entry.ts': `export {}\n`,
        },
      })
      await expect(
        first.rebuild({ 'src/label.ts': brokenLabel }),
      ).rejects.toThrow()
      const third = await first.rebuild({
        'src/label.ts': label,
        'src/routes/index.tsx': index('MARK_THREE'),
      })
      const { url } = await third.preview()
      const served = await page(url)
      expect(served.status).toBe(200)
      expect(served.html.replace(/<!-- -->/g, '')).toContain(
        'MARK_LABELMARK_THREE',
      )
      expect(Object.keys(served.scripts)).not.toEqual([])
      expect(
        Object.entries(served.scripts).filter(([, status]) => status !== 200),
      ).toEqual([])
    },
    timeout,
  )
})
