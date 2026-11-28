/**
 * Two router plugin instances in one Vite app, each with its own routes
 * directory and generated route tree (TanStack/router#7174, #7313): a split
 * id of a file of an instance's routes directory that is no route gets that
 * instance's empty module (SPEC J2.13), and each instance splits its own
 * tree in dev. Each tree edited in dev:
 * integration/route-hmr-browser-shared-tree.test.ts; production builds:
 * integration/build-two-router-plugins.test.ts.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { expect, test } from 'vitest'
import { createServer } from 'vite'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { createRouterPluginContext } from '../src/context'
import {
  tanStackRouterCodeSplitter,
  tanstackRouter,
  tanstackRouterGenerator,
} from '../src/vite'
import { head, rootRoute } from './build-harness'
import type { PluginOption } from 'vite'
import type { Config } from '../src/vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const page = (mark: string) =>
  `${head}function Page() {\n  return '${mark}'\n}\nexport const Route = createFileRoute('/')({ component: Page })\n`

const trees = [
  { dir: 'src/routes', tree: 'src/routeTree.gen.ts', mark: 'MARK_APP' },
  { dir: 'src/wroutes', tree: 'src/widgetTree.gen.ts', mark: 'MARK_WIDGET' },
] as const

async function twoTreeApp(extra: Record<string, string> = {}) {
  const { root } = await closeAtEnd(
    () =>
      createApp({
        dir: harnessDir,
        files: {
          'index.html': '<script type="module" src="/src/main.ts"></script>\n',
          'src/main.ts': `import { routeTree } from './routeTree.gen'\nimport { routeTree as widgetTree } from './widgetTree.gen'\nconsole.log(routeTree, widgetTree)\n`,
          ...Object.fromEntries(
            trees.flatMap((t) => [
              [`${t.dir}/__root.tsx`, rootRoute],
              [`${t.dir}/index.tsx`, page(t.mark)],
            ]),
          ),
          ...extra,
        },
      }),
    (opened) => opened.dispose(),
  )
  const options = trees.map((t) => ({
    target: 'react' as const,
    autoCodeSplitting: true,
    routesDirectory: path.join(root, t.dir),
    generatedRouteTree: path.join(root, t.tree),
  }))
  return { root, options }
}

async function devServer(root: string, plugins: Array<PluginOption>) {
  const server = await closeAtEnd(() =>
    createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins,
    }),
  )
  return server.environments.client
}

// main's "keeps multiple code-splitter instances isolated by explicit
// context" (#7313) too. (Edits of each tree: the HMR rows of
// integration/route-hmr-browser-shared-tree.test.ts.)
test.each([
  {
    plugins: 'tanstackRouter() twice',
    of: (options: Partial<Config>): Array<PluginOption> => [
      tanstackRouter(options),
    ],
  },
  {
    plugins: 'a generator and splitter pair per explicit context',
    of: (options: Partial<Config>): Array<PluginOption> => {
      const context = createRouterPluginContext()
      return [
        tanstackRouterGenerator(options, context),
        tanStackRouterCodeSplitter(options, context),
      ]
    },
  },
])(
  '$plugins, dev: each tree serves its route module without its split component',
  async ({ of }) => {
    const { root, options } = await twoTreeApp()
    const client = await devServer(
      root,
      options.flatMap((o) => of(o)),
    )
    for (const t of trees) {
      const reference =
        (await client.transformRequest(`/${t.dir}/index.tsx`))?.code ?? ''
      expect(reference).toContain('createFileRoute')
      expect(reference).not.toContain(t.mark)
    }
  },
)

test('one instance: a split id of a file of its routes directory that is no route serves an empty module', async () => {
  const { root, options } = await twoTreeApp({
    'src/routes/-helper.tsx': `export const Route = { options: { component: () => 'MARK_HELPER' } }\n`,
  })
  const client = await devServer(root, [tanstackRouter(options[0])])
  const served =
    (
      await client.transformRequest(
        '/src/routes/-helper.tsx?tsr-split=component',
      )
    )?.code ?? ''
  expect(served.trim()).toBe('export {};')
})

// The same empty module whatever else holds: with splitting off, in the
// SSR environment; for a file that does not parse; and its map maps nothing
// when a plugin before the router mapped the file's code (an upstream map
// does not reach the empty module). Source: Astra's review of settlement
// step 1, finding 3 (`step1-vite.mjs`).
test('one instance: the empty module of a split id of a file that is no route holds with splitting off, unparseable text and an upstream map', async () => {
  const { root, options } = await twoTreeApp({
    'src/routes/-plain.ts': `export const ORIGINAL = 'MARK_ORIGINAL'\n`,
    'src/routes/-broken.ts': `export const broken = ;\n`,
  })
  const upstream: PluginOption = {
    name: 'test:upstream-map',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('/-plain.ts?')) {
        return {
          code,
          map: {
            version: 3,
            sources: ['upstream-original.ts'],
            sourcesContent: [code],
            names: [],
            mappings: 'AAAA',
          },
        }
      }
      return null
    },
  }
  const server = await closeAtEnd(() =>
    createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [
        upstream,
        tanstackRouter({ ...options[0], autoCodeSplitting: false }),
      ],
    }),
  )
  const served = []
  for (const [env, file] of [
    ['client', '-plain.ts'],
    ['ssr', '-plain.ts'],
    ['client', '-broken.ts'],
  ] as const) {
    const out = await server.environments[env].transformRequest(
      `/src/routes/${file}?tsr-split=component`,
    )
    // (Vite's SSR transform of the empty module is no code at all)
    served.push([
      env,
      file,
      out?.code.trim() === (env === 'ssr' ? '' : 'export {};'),
      out?.map?.mappings ?? null,
    ])
  }
  expect(served).toEqual([
    ['client', '-plain.ts', true, ''],
    ['ssr', '-plain.ts', true, ''],
    ['client', '-broken.ts', true, ''],
  ])
})
