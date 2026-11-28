/**
 * The route generator in a Start build: once per build, whatever number of
 * environments compiles it. With Vite, whose environments share the app's
 * plugins (`builder.sharedPlugins`): Vite resolves the config at the top and
 * once per environment, and a build whose config file gives Start's plugins
 * generates the route tree once. With Rsbuild, whose environments each have a
 * compiler of their own. A later build in the same process generates the
 * routes added since (the plugins passed inline:
 * `start-build-same-plugins.test.ts`; Vite 6 to 8 and watch mode:
 * router-plugin's `generator-runs-per-vite-build.test.ts`).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { buildStart } from '../build-start'

test('vite: a build whose config file gives the plugins generates the route tree once, and a second build the routes added since', async () => {
  let generations = 0
  const first = await buildStart({
    viteConfigFile: true,
    start: {
      router: {
        plugins: [
          {
            name: 'test:generations',
            onRouteTreeChanged: () => {
              generations++
            },
          },
        ],
      },
    },
    files: { 'entry.ts': `export const entry = 'MARK_ENTRY'\n` },
  })
  expect(generations).toBe(1)
  expect(first.client.where('MARK_ENTRY')).not.toBe('nowhere')
  generations = 0
  const second = await first.rebuild({
    'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({})
`,
  })
  expect(generations).toBe(1)
  const tree = await readFile(
    path.join(second.root, 'src/routeTree.gen.ts'),
    'utf8',
  )
  expect(tree).toContain(`path: '/about'`)
}, 90_000)

test('rsbuild: a build generates the route tree once for both environments, and a second build of the instance the routes added since', async () => {
  let generations = 0
  const first = await buildStart({
    bundler: 'rsbuild',
    samePlugins: true,
    start: {
      router: {
        plugins: [
          {
            name: 'test:generations',
            onRouteTreeChanged: () => {
              generations++
            },
          },
        ],
      },
    },
    files: { 'entry.ts': `export const entry = 'MARK_ENTRY'\n` },
  })
  expect(generations).toBe(1)
  expect(first.client.where('MARK_ENTRY')).not.toBe('nowhere')
  generations = 0
  const second = await first.rebuild({
    'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({})
`,
  })
  expect(generations).toBe(1)
  const tree = await readFile(
    path.join(second.root, 'src/routeTree.gen.ts'),
    'utf8',
  )
  expect(tree).toContain(`path: '/about'`)
}, 90_000)

// A program that drives the compiler itself (`createCompiler().run()`):
// Rsbuild dispatches no `onBeforeBuild`. Source: Astra round 4 (Rsbuild
// host, B3: the build failed with `Can't resolve './routeTree.gen'`, and with
// `Generator instance not initialized` once a tree was there; main builds).
test("rsbuild: a build through the instance's compiler generates the route tree, and a second one the routes added since", async () => {
  const first = await buildStart({
    bundler: 'rsbuild',
    rsbuildCompiler: true,
    files: { 'entry.ts': `export const entry = 'MARK_ENTRY'\n` },
  })
  expect(first.client.where('MARK_ENTRY')).not.toBe('nowhere')
  // the tree the first build generated is there
  const second = await first.rebuild({
    'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({})
`,
  })
  const tree = await readFile(
    path.join(second.root, 'src/routeTree.gen.ts'),
    'utf8',
  )
  expect(tree).toContain(`path: '/about'`)
}, 90_000)
