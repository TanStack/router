/**
 * Rsbuild dev, the Start manifest after edits: Start computes the client
 * manifest (route preloads, stylesheets) from each client compilation. After
 * an edit that changes nothing structural, adds an import of a module in a
 * chunk of its own, adds a CSS import, or adds a route, the pages the server
 * renders link what a dev server started on the edited app links.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { reactApp } from '../hydrate-dev-edits'
import { rsbuildEntries } from '../route-css-cases'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

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

const start = (app: Record<string, string>) =>
  startRsbuildStartDevServer({
    browser: true,
    hmr: true,
    registerCleanup: onTestFinished,
    config,
    files: app,
  })

describe('Rsbuild dev: the Start manifest after edits', () => {
  // Fails on main too (#8889, 3f226869e0): the client compilation writes the
  // manifest into the server environment's virtual module
  // (`node_modules/.virtual/`, `VirtualModulesPlugin.writeModule`), whose
  // change event goes through Rspack's watcher, which ignores `node_modules`
  // (`watchOptions.ignored`'s default): no server compilation after the
  // first builds the module again, and every page links what the first
  // client compilation emitted. Before #8889 the server read a global of the
  // build process, current after each client compilation.
  test.fails(
    'pages link what a dev server started on the edited app links',
    async () => {
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
    },
    timeout,
  )
})
