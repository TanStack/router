/**
 * The route generator in a Start build with Vite, whose environments share
 * the app's plugins (`builder.sharedPlugins`): Vite resolves the config at
 * the top and once per environment, and a build whose config file gives
 * Start's plugins generates the route tree once. A later build in the same
 * process generates the routes added since (the plugins passed inline:
 * `start-build-same-plugins.test.ts`; Vite 6 to 8 and watch mode:
 * router-plugin's `generator-runs-per-vite-build.test.ts`).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { buildStart } from '../build-harness'

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
