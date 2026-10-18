/**
 * Not part of the compiler test corpus (out of scope: prerendering, user
 * ruling 2026-10-18). Moved from known-bugs-route-options.test.ts: the pages
 * Start's prerender plugin hands to the prerender step, read from the route
 * generator's view of each route file. A missed option key must never skip
 * prerendering a page (user ruling 2026-10-16).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Generator, getConfig } from '@tanstack/router-generator'
import { afterEach, describe, expect, test } from 'vitest'
import { prerenderRoutesPlugin } from '../../src/start-router-plugin/generator-plugins/prerender-routes-plugin'

const routeHead = `import { createFileRoute } from '@tanstack/react-router'
const Page = () => null
`

/** Route options that keep a route a page, with the declarations they read. */
const pageOptions = [
  {
    name: 'a spread',
    head: `const clientOptions = { component: Page }\n`,
    options: `...clientOptions`,
  },
  {
    name: 'a computed key',
    head: `const key = 'component'\n`,
    options: `[key]: Page`,
  },
  { name: 'a method', head: '', options: `component() { return null }` },
]

/** Casts real route files wrap their options in. */
const casts = [
  { name: 'as never', wrap: (options: string) => `(${options} as never)` },
  { name: 'as any', wrap: (options: string) => `(${options} as any)` },
  {
    name: 'satisfies',
    wrap: (options: string) => `(${options} satisfies Record<string, unknown>)`,
  },
]

describe('prerendered pages', () => {
  afterEach(() => {
    globalThis.TSS_PRERENDABLE_PATHS = undefined
  })

  /**
   * Runs the route generator with Start's prerender plugin on an app with a
   * root route and `routes` (route files by path relative to the routes
   * directory). Returns the paths Start prerenders. (This reads the pages the
   * prerender plugin hands to Start's prerender step, without a build;
   * start-build-prerender.test.ts runs the step.)
   */
  async function prerenderedPaths(routes: Record<string, string>) {
    const root = await mkdtemp(path.join(tmpdir(), 'tss-route-options-'))
    try {
      const files: Record<string, string> = {
        '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
        ...routes,
      }
      for (const [file, code] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, 'routes', file)), {
          recursive: true,
        })
        await writeFile(path.join(root, 'routes', file), code)
      }
      const config = getConfig({
        disableLogging: true,
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        // Same filesystem as the app, so the generator can rename its temp
        // files
        tmpDir: path.join(root, '.tanstack/tmp'),
        plugins: [prerenderRoutesPlugin()],
      })
      await new Generator({ config, root }).run()
      return (globalThis.TSS_PRERENDABLE_PATHS ?? []).map((page) => page.path)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /** Whether `/moved` (`routes/moved.tsx` holding `source`) is prerendered. */
  async function prerendered(source: string) {
    return (await prerenderedPaths({ 'moved.tsx': source })).includes('/moved')
  }

  const page = (id: string) =>
    `${routeHead}export const Route = createFileRoute('${id}')({ component: Page })\n`

  // Control for the pins below: Start prerenders the static pages, not the
  // dynamic ones, the layouts or the server-only routes.
  // Source: mutation round 3 start-router E.
  test('the static pages of an app are prerendered', async () => {
    const paths = await prerenderedPaths({
      'index.tsx': page('/'),
      'about.tsx': page('/about'),
      'posts.tsx': page('/posts'),
      'posts.$id.tsx': page('/posts/$id'),
      '_layout.tsx': page('/_layout'),
      '_layout/inside.tsx': page('/_layout/inside'),
      '(group)/grouped.tsx': page('/(group)/grouped'),
      'lazy-only.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/lazy-only')({ component: () => null })
`,
      'api.tsx': `${routeHead}export const Route = createFileRoute('/api')({ server: { handlers: {} } })\n`,
      // Pinned below
      'cast.tsx': `${routeHead}export const Route = createFileRoute('/cast')({ component: Page } as never)\n`,
    })
    expect(paths.filter((path) => path !== '/cast').sort()).toEqual([
      '/',
      '/about',
      '/grouped',
      '/inside',
      '/lazy-only',
      '/posts',
    ])
  })

  // Control for the pins below (same harness).
  test.each([
    {
      options: `{ server: { handlers: {} }, component: Page }`,
      expected: true,
    },
    { options: `{ server: { handlers: {} } }`, expected: false },
  ])(
    'a page with $options is prerendered: $expected',
    async ({ options, expected }) => {
      expect(
        await prerendered(
          `${routeHead}export const Route = createFileRoute('/moved')(${options})`,
        ),
      ).toBe(expected)
    },
  )

  // Bug: same root cause as the server-only routes above: a page whose
  // component comes from a spread, a computed key or a method has no
  // recorded `component` key, and Start's prerender plugin skips it.
  // Impact: the page is not prerendered.
  // Source: gap G11.
  test.fails.each(pageOptions)(
    'a page whose component comes from $name is prerendered',
    async ({ head, options }) => {
      expect(
        await prerendered(
          `${routeHead}${head}export const Route = createFileRoute('/moved')({ ${options} })`,
        ),
      ).toBe(true)
    },
  )

  // Bug: same root cause: the route generator records no option keys of
  // options wrapped in a cast, and Start's prerender plugin skips the page.
  // Impact: the page is not prerendered.
  // Source: lost-cases-campaign item 1 (route options wrapped in casts in
  // real repos).
  test.fails.each(casts)(
    'a page whose options are wrapped in $name is prerendered',
    async ({ wrap }) => {
      expect(
        await prerendered(
          `${routeHead}export const Route = createFileRoute('/moved')(${wrap('{ component: Page }')})`,
        ),
      ).toBe(true)
    },
  )
})
