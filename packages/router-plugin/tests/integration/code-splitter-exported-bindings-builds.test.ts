/**
 * Exported bindings a split component renders stay out of the entry chunk in
 * every bundler and chunking configuration (SPEC J2.5, J2.8; R77): the
 * route's chunk carries its own copy, and the extracted module the route
 * module re-exports serves other importers of the route file only, so a
 * bundler drops it when nobody imports it, wherever its chunk assignment
 * would have put it. Learned from tanstack.com, where Vite 8.0.x (Rolldown
 * 1.0.3) and a `manualChunks` group merging TanStack's runtime into the entry
 * placed the extracted module with the entry: an exported layout only the
 * split component rendered loaded eagerly with its icon imports. The shapes
 * that broke there run here in every configuration: an exported helper with
 * icon imports, `import type * as React` next to JSX, and a component with
 * destructured props (a trailing comma) around `<ClientOnly>`. (Rolldown
 * < 1.1.5 itself cannot be pinned here: the repository's Vite resolves
 * Rolldown >= 1.2, and the plugin's Vite-only hooks do not run under plain
 * Rolldown. Its placement is covered by construction, since no chunk
 * imports the extracted module, and by the chunk groups below, which merge
 * the module into the entry on current Rolldown the same way.)
 *
 * Identity: importers of the route file share one instance (two routes'
 * split components import the same `Card`); the route's own chunk renders
 * its copy (two instances by rule, R77). When another module imports a
 * copied export through the route file and the bundler keeps the extracted
 * module with the entry (every bundler when the entry itself imports it;
 * webpack, Rspack and Rsbuild without `"sideEffects": false` for any
 * importer), the build warns once, naming the route file; otherwise it does
 * not.
 */
import { afterAll, describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head } from '../build-harness'
import { tanstackRouter } from '../../src/vite'
import type {
  BuildResult,
  Placement,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Plugin } from 'vite'

const timeout = 120_000

const route = (file: string, body: string) =>
  `${head}${body}`.replaceAll('$PATH', `/${file}`)

/** A plugin setting the app's own chunking options, as a vite.config would. */
const viteChunks = (output: Record<string, unknown>): Plugin => ({
  name: 'test:chunks',
  config: () => ({ build: { rollupOptions: { output } } }),
})

/**
 * The client app: an entry importing the route tree (only `Route` of each
 * route file, like an app), routes marking their page code, a local icon
 * barrel, and two routes whose split components import `Card` from the
 * route file that exports it.
 */
const mountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { Entry } from './routes/entry-imported'
export { routeTree, Entry }
const router = createRouter({ routeTree, history: createMemoryHistory() })
export async function renderEach(paths: Array<string>) {
  const rendered: Record<string, string> = {}
  for (const path of paths) {
    const element = document.createElement('div')
    document.body.append(element)
    try {
      const route = (router.routesByPath as Record<string, any>)[path]
      await route.options.component.preload?.()
      const root = createRoot(element)
      flushSync(() => root.render(createElement(route.options.component)))
      rendered[path] = element.innerHTML
    } catch (error) {
      rendered[path] = 'threw: ' + String(error)
    }
  }
  return rendered
}
/** What each route renders, and whether the two importers got one Card. */
export async function probe(paths: Array<string>) {
  const rendered = await renderEach(paths)
  const cards: Array<unknown> = (globalThis as any).cards ?? []
  return { rendered, importers: cards.length, oneInstance: cards[0] === cards[1] }
}
`

const files = {
  'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'icons/index.ts': `export { ShieldIcon } from './shield'
export { StarIcon } from './star'
`,
  'icons/shield.tsx': `export function ShieldIcon() {
  return <i>MARK_icon_shield_END</i>
}
`,
  'icons/star.tsx': `export function StarIcon() {
  return <i>MARK_icon_star_END</i>
}
`,
  // tanstack.com's admin layout: an exported helper only the split
  // component renders, importing icons through a barrel
  'routes/layout-icons.tsx': route(
    'layout-icons',
    `import { ShieldIcon, StarIcon } from '../icons'
export function Layout({ children }: { children: React.ReactNode }) {
  return <section>MARK_layout_END<ShieldIcon /><StarIcon />{children}</section>
}
export const Route = createFileRoute('$PATH')({
  component: () => <Layout>page</Layout>,
})`,
  ),
  // tanstack.com's typography page: a type-only namespace import of React
  // next to JSX, read in the signature of a component-only helper
  'routes/type-ns-react.tsx': route(
    'type-ns-react',
    `import type * as React from 'react'
export function Block({ children }: { children: React.ReactNode }) {
  const node: React.ReactNode = children
  return <p>MARK_block_END{node}</p>
}
export const Route = createFileRoute('$PATH')({
  component: () => <Block>typed</Block>,
})`,
  ),
  // tanstack.com's navbar: destructured props with a trailing comma, read
  // only inside <ClientOnly>
  'routes/destructured-props.tsx': route(
    'destructured-props',
    `import { ClientOnly } from '@tanstack/react-router'
export function Panel({
  a,
  b,
}: {
  a: string
  b: string
}) {
  return <ClientOnly fallback={null}><div title={b}>MARK_panel_END{a}</div></ClientOnly>
}
export const Route = createFileRoute('$PATH')({
  component: () => <Panel a="a" b="b" />,
})`,
  ),
  // an exported component used as the option value
  'routes/exported-component.tsx': route(
    'exported-component',
    `export function Page() {
  return <p>MARK_page_END</p>
}
export const Route = createFileRoute('$PATH')({ component: Page })`,
  ),
  // an exported component two other routes' split components import
  'routes/exported-shared.tsx': route(
    'exported-shared',
    `export function Card() {
  return <b>MARK_card_END</b>
}
function Page() {
  return <Card />
}
export const Route = createFileRoute('$PATH')({ component: Page })`,
  ),
  'routes/importer-a.tsx': route(
    'importer-a',
    `import { Card } from './exported-shared'
function Page() {
  ;((globalThis as any).cards ??= []).push(Card)
  return <Card />
}
export const Route = createFileRoute('$PATH')({ component: Page })`,
  ),
  'routes/importer-b.tsx': route(
    'importer-b',
    `import { Card } from './exported-shared'
function Page() {
  ;((globalThis as any).cards ??= []).push(Card)
  return <Card />
}
export const Route = createFileRoute('$PATH')({ component: Page })`,
  ),
  // an exported component the entry itself imports through the route file
  'routes/entry-imported.tsx': route(
    'entry-imported',
    `export function Entry() {
  return <b>MARK_entry_END</b>
}
function Page() {
  return <Entry />
}
export const Route = createFileRoute('$PATH')({ component: Page })`,
  ),
  'entry.ts': mountEntry,
}

const paths = [
  '/layout-icons',
  '/type-ns-react',
  '/destructured-props',
  '/exported-component',
  '/exported-shared',
  '/importer-a',
  '/importer-b',
  '/entry-imported',
]

const tanstackGroup = /node_modules[\\/]@tanstack[\\/]/

type Config = {
  name: string
  /** Whether the bundler bypasses the route module's re-export for a lazy importer. */
  lazyImporterStaysLazy: boolean
  app: () => Promise<BuildResult>
}

const configs: Array<Config> = [
  {
    name: 'vite',
    lazyImporterStaysLazy: true,
    app: () => build({ bundler: 'vite', env: 'client', files }),
  },
  {
    // tanstack.com's vite.config: a Rollup-style manualChunks function
    // grouping TanStack's runtime, which Rolldown merges into the entry
    name: 'vite with a manualChunks group of the TanStack packages',
    lazyImporterStaysLazy: true,
    app: () =>
      build({
        bundler: 'vite',
        env: 'client',
        files,
        routerPlugins: (config) => [
          tanstackRouter(config),
          viteChunks({
            manualChunks: (id: string) =>
              tanstackGroup.test(id) ? 'tanstack' : undefined,
          }),
        ],
      }),
  },
  {
    name: 'vite with an advancedChunks group',
    lazyImporterStaysLazy: true,
    app: () =>
      build({
        bundler: 'vite',
        env: 'client',
        files,
        routerPlugins: (config) => [
          tanstackRouter(config),
          viteChunks({
            advancedChunks: {
              groups: [{ name: 'tanstack', test: tanstackGroup }],
            },
          }),
        ],
      }),
  },
  ...(['rspack', 'webpack'] as const).flatMap((bundler) => [
    {
      name: `${bundler} without a sideEffects field`,
      lazyImporterStaysLazy: false,
      app: () => build({ bundler, env: 'client', files }),
    },
    {
      name: `${bundler} with "sideEffects": false`,
      lazyImporterStaysLazy: true,
      app: () => build({ bundler, env: 'client', files, sideEffects: false }),
    },
    {
      name: `${bundler} with splitChunks cacheGroups`,
      lazyImporterStaysLazy: false,
      app: () =>
        build({
          bundler,
          env: 'client',
          files,
          configure: (options) => {
            options.optimization = {
              ...(options.optimization as object),
              splitChunks: {
                chunks: 'all',
                cacheGroups: {
                  tanstack: { test: tanstackGroup, name: 'tanstack' },
                },
              },
            }
          },
        }),
    },
  ]),
  {
    name: 'rsbuild',
    lazyImporterStaysLazy: false,
    app: () => buildWithRsbuild({ files, registerCleanup: () => {} }),
  },
  {
    name: 'rsbuild with "sideEffects": false and splitChunks cacheGroups',
    lazyImporterStaysLazy: true,
    app: () =>
      buildWithRsbuild({
        files,
        sideEffects: false,
        registerCleanup: () => {},
        rsbuildConfig: {
          performance: {
            chunkSplit: {
              strategy: 'custom',
              override: {
                cacheGroups: {
                  tanstack: {
                    test: tanstackGroup,
                    name: 'tanstack',
                    chunks: 'all',
                  },
                },
              },
            },
          },
        },
      }),
  },
]

describe.each(configs)('$name', ({ lazyImporterStaysLazy, app: create }) => {
  let built: Promise<BuildResult> | undefined
  const app = () => (built ??= create())
  afterAll(async () => {
    await (await built)?.dispose()
  })
  type Probe = {
    rendered: Record<string, string>
    importers: number
    oneInstance: boolean
  }
  let probed: Promise<Probe> | undefined
  const probe = () =>
    (probed ??= app().then(
      async (result) =>
        (await result.run(`return await entry.probe(${JSON.stringify(paths)})`))
          .result as Probe,
    ))
  const page = async (path: string) => (await probe()).rendered[path]

  test.each([
    ['/layout-icons', 'MARK_layout_END'],
    ['/type-ns-react', 'MARK_block_END'],
    ['/destructured-props', 'MARK_panel_END'],
    ['/exported-component', 'MARK_page_END'],
  ])(
    'the exported page code of %s loads with its chunk and renders',
    async (path, marker) => {
      expect((await app()).where(marker)).toBe('lazy')
      expect(await page(path)).toContain(marker)
    },
    timeout,
  )

  test(
    'what an exported helper imports loads with its chunk',
    async () => {
      const result = await app()
      expect(result.where('MARK_icon_shield_END')).toBe('lazy')
      expect(result.where('MARK_icon_star_END')).toBe('lazy')
      expect(await page('/layout-icons')).toContain('MARK_icon_star_END')
    },
    timeout,
  )

  test(
    'an exported component other routes import is one instance for them, and the route renders its own',
    async () => {
      const result = await app()
      expect(await page('/exported-shared')).toContain('MARK_card_END')
      expect(await page('/importer-a')).toContain('MARK_card_END')
      expect(await page('/importer-b')).toContain('MARK_card_END')
      expect(await probe()).toMatchObject({ importers: 2, oneInstance: true })
      const expected: Placement = lazyImporterStaysLazy ? 'lazy' : 'eager+lazy'
      expect(result.where('MARK_card_END')).toBe(expected)
      const warned = findDiagnostics(result.warnings, {
        severity: 'warning',
        file: 'routes/exported-shared.tsx',
        root: result.root,
      })
      expect(warned.length > 0).toBe(!lazyImporterStaysLazy)
    },
    timeout,
  )

  test(
    'an exported component the entry imports through the route file loads with the entry, and the build says so',
    async () => {
      const result = await app()
      expect(result.where('MARK_entry_END')).toBe('eager+lazy')
      expect(await page('/entry-imported')).toContain('MARK_entry_END')
      expectDiagnostic(result.warnings, {
        severity: 'warning',
        file: 'routes/entry-imported.tsx',
        root: result.root,
        times: 1,
      })
    },
    timeout,
  )

  test(
    'exports nobody imports through the route file are not reported',
    async () => {
      const result = await app()
      for (const file of [
        'routes/layout-icons.tsx',
        'routes/type-ns-react.tsx',
        'routes/destructured-props.tsx',
        'routes/exported-component.tsx',
      ]) {
        expect(
          findDiagnostics([...result.warnings, ...result.consoleMessages], {
            file,
            root: result.root,
          }),
        ).toEqual([])
      }
    },
    timeout,
  )
})
