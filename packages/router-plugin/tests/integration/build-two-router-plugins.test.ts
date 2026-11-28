/**
 * Two `tanstackRouter()` instances in one Vite, webpack, Rspack or Rsbuild
 * build, each with its own routes directory and generated route tree
 * (TanStack/router#7174, #7313): each tree's component is split into a lazy
 * chunk, which the entry reaches only through a dynamic import (the
 * webpack-family loader runs both instances on every module, and each
 * leaves the other's routes as they are). Vite dev:
 * vite-two-router-plugins.test.ts.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { describe, expect, test } from 'vitest'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { build, buildWithRsbuild, head, rootRoute } from '../build-harness'
import { timeout } from '../production-bundle'
import type { RouterPluginOptions } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const page = (mark: string) =>
  `${head}function Page() {\n  return <p>${mark}</p>\n}\nexport const Route = createFileRoute('/')({ component: Page })\n`

const files = {
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': page('MARK_APP'),
  'wroutes/__root.tsx': rootRoute,
  'wroutes/index.tsx': page('MARK_WIDGET'),
  'entry.ts': `export { routeTree } from './routeTree.gen'\nexport { routeTree as widgetTree } from './widgetTree.gen'\n`,
}

/** The widget tree's instance options, next to the app tree's `config`. */
const widgetOptions = (root: string): RouterPluginOptions => ({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: path.join(root, 'wroutes'),
  generatedRouteTree: path.join(root, 'widgetTree.gen.ts'),
  codeSplittingOptions: { addHmr: false },
})

function expectBothSplit(app: BuildResult) {
  expect(app.where('MARK_APP')).toBe('lazy')
  expect(app.where('MARK_WIDGET')).toBe('lazy')
}

describe.each(['vite', 'webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'each instance splits its own tree',
    async () => {
      const { tanstackRouter } = await import(`../../src/${bundler}`)
      const app = await build({
        bundler,
        env: 'client',
        files,
        routerPlugins: (config) => [
          tanstackRouter(config),
          tanstackRouter(widgetOptions(path.dirname(config.routesDirectory!))),
        ],
      })
      expectBothSplit(app)
    },
    timeout,
  )
})

test(
  'rsbuild: each instance splits its own tree',
  async () => {
    const { tanstackRouter } = await import('../../src/rspack')
    const { root } = await closeAtEnd(
      () =>
        createApp({
          dir: harnessDir,
          files,
        }),
      (opened) => opened.dispose(),
    )
    // (the app exists: the second instance's options name its root)
    const app = await buildWithRsbuild({
      root,
      files: {},
      rsbuildConfig: {
        tools: { rspack: { plugins: [tanstackRouter(widgetOptions(root))] } },
      },
    })
    expectBothSplit(app)
  },
  timeout,
)
