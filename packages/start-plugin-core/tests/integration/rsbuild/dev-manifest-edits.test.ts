/**
 * Rsbuild dev, the Start manifest after edits: Start computes the client
 * manifest (route preloads, stylesheets) from each client compilation. After
 * an edit that changes nothing structural, adds an import of a module in a
 * chunk of its own, adds a CSS import, or adds a route, the pages the server
 * renders link what a dev server started on the edited app links; so do the
 * pages of a server restarted from Rspack's persistent cache after an edit
 * made while it was down.
 * Source: perf pass of #8817, item 3 (main too since #8889: the manifest is
 * written into a virtual module under `node_modules/.virtual/`, which
 * Rspack's watcher ignores, and no later server compilation built it again).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { reactApp } from '../hydrate-dev-edits'
import { rsbuildEntries } from '../route-css-cases'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const root = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <Scripts />
      </body>
    </html>
  )
}
`

const route = (path: string, body: string, imports = '') =>
  `import { createFileRoute } from '@tanstack/react-router'
${imports}export const Route = createFileRoute('${path}')({
  component: () => <p>${body}</p>,
})
`

const files = {
  ...rsbuildEntries,
  'src/router.ts': reactApp['src/router.ts'],
  'src/routes/__root.tsx': root,
  'src/routes/index.tsx': route('/', 'home'),
  'src/routes/a.tsx': route('/a', 'MARK_A_V1'),
  'src/lib/format.ts': `export const format = (value: string) => '[' + value + ']'\n`,
  'src/routes/a.css': `.a { color: rgb(1, 2, 3); }\n`,
  'src/routes/b.css': `.b { color: rgb(4, 5, 6); }\n`,
}

/** `src/lib/` modules go to a chunk of their own, as an app's chunk splitting may put them. */
const config = {
  // Start serves the pages, not an HTML template
  tools: { htmlPlugin: false },
  splitChunks: {
    cacheGroups: {
      lib: {
        name: 'lib',
        test: /[\\/]src[\\/]lib[\\/]/,
        chunks: 'async',
        enforce: true,
      },
    },
  },
} as const

/** The `<link>` tags of the page the server renders at `path`, in order. */
async function linksAt(server: RsbuildDevServer, path: string) {
  const response = await fetch(new URL(path, server.url).href)
  const html = await response.text()
  return {
    status: response.status,
    links: [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => tag),
  }
}

async function linksOf(server: RsbuildDevServer) {
  const links: Record<string, Awaited<ReturnType<typeof linksAt>>> = {}
  for (const path of ['/', '/a', '/b']) {
    links[path] = await linksAt(server, path)
  }
  return links
}

const start = (app: Record<string, string>, extraConfig = {}) =>
  startRsbuildStartDevServer({
    browser: true,
    hmr: true,
    config: { ...config, ...extraConfig },
    files: app,
  })

/** Route `/a` importing the `lib` chunk's module and a stylesheet. */
const aWithImports = route(
  '/a',
  '{format("MARK_A_V2")}',
  `import { format } from '../lib/format'\nimport './a.css'\n`,
)

describe('Rsbuild dev: the Start manifest after edits', () => {
  test('pages link what a dev server started on the edited app links', async () => {
    const server = await start(files)
    const app: Record<string, string> = { ...files }
    const edit = async (changes: Record<string, string>) => {
      Object.assign(app, changes)
      await server.edit(changes)
    }
    const before = await linksAt(server, '/a')
    expect(before.status).toBe(200)

    // nothing structural
    await edit({ 'src/routes/a.tsx': route('/a', 'MARK_A_V2') })
    expect(await linksAt(server, '/a')).toEqual(before)

    // an import of a module in a chunk of its own
    await edit({
      'src/routes/a.tsx': route(
        '/a',
        '{format("MARK_A_V3")}',
        `import { format } from '../lib/format'\n`,
      ),
    })
    expect((await linksAt(server, '/a')).links).toContainEqual(
      expect.stringContaining('/lib.js'),
    )

    // a CSS import
    await edit({
      'src/routes/a.tsx': route(
        '/a',
        '{format("MARK_A_V4")}',
        `import { format } from '../lib/format'\nimport './a.css'\n`,
      ),
    })
    expect((await linksAt(server, '/a')).links).toContainEqual(
      expect.stringMatching(/rel="stylesheet"/),
    )

    // a new route, with a CSS import
    await edit({
      'src/routes/b.tsx': route('/b', 'MARK_B', `import './b.css'\n`),
    })
    await server.settle()
    const edited = await linksOf(server)
    expect(edited['/b']!.status).toBe(200)

    await server.close()
    const fresh = await start(app)
    expect(edited).toEqual(await linksOf(fresh))
  })

  test('pages of a server restarted from the persistent cache link the edit made while it was down', async () => {
    const buildCache = { performance: { buildCache: true } }
    const first = await start(files, buildCache)
    expect((await linksAt(first, '/a')).links).not.toContainEqual(
      expect.stringContaining('/lib.js'),
    )
    await first.stop()
    await writeFile(path.join(first.root, 'src/routes/a.tsx'), aWithImports)
    const server = await first.restart()
    const links = await linksOf(server)
    expect(links['/a']!.links).toContainEqual(
      expect.stringContaining('/lib.js'),
    )
    expect(links['/a']!.links).toContainEqual(
      expect.stringMatching(/rel="stylesheet"/),
    )

    const fresh = await start({ ...files, 'src/routes/a.tsx': aWithImports })
    expect(links).toEqual(await linksOf(fresh))
  })
})
