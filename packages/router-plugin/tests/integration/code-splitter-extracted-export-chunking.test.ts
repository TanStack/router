/**
 * Where an exported function the split component calls lands when the
 * app's own chunk configuration groups the route files with the entry (SPEC
 * J2.5): a `manualChunks` function or a `cacheGroups` entry matching the
 * route files themselves (not the modules the router plugin derives from
 * them, whose ids carry a query). The chunk carries its copy of the
 * function, so it stays lazy, and nothing is reported. Learned from
 * tanstack.com on Vite 8.0.x (Rolldown 1.0.3 with a `manualChunks` group);
 * here a group over the routes reproduces the placement on every bundler.
 */
import { afterAll, describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head, rootRoute } from '../build-harness'
import { tanstackRouter } from '../../src/vite'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'
import type { Plugin } from 'vite'

const timeout = 120_000

const files = {
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': `${head}export function Fmt(value: string) {
  return 'MARK_FMT_END' + value
}
function Page() {
  return <p>{Fmt('!')}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
  // an importer of the route file outside the routes directory
  'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
}

const routesDir = /[\\/]routes[\\/]/
/** The route files themselves: modules derived from them carry a query. */
const groups = (id: string) => routesDir.test(id) && !id.includes('?')
const cacheGroupTest = (module: { resource?: string }) =>
  groups(module.resource ?? '')
const viteChunks = (output: Record<string, unknown>): Plugin => ({
  name: 'test:chunks',
  config: () => ({ build: { rollupOptions: { output } } }),
})

const configsFor = (
  files: Record<string, string>,
): Array<{ name: string; app: () => Promise<BuildResult> }> => [
  {
    name: 'vite with a manualChunks group of the routes directory',
    app: () =>
      build({
        bundler: 'vite',
        env: 'client',
        files,
        routerPlugins: (config) => [
          tanstackRouter(config),
          viteChunks({
            manualChunks: (id: string) => (groups(id) ? 'routes' : undefined),
          }),
        ],
      }),
  },
  ...(['rspack', 'webpack'] as const).map((bundler) => ({
    name: `${bundler} with a splitChunks cacheGroup of the routes directory`,
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
                routes: {
                  test: cacheGroupTest,
                  name: 'routes',
                  chunks: 'all',
                  enforce: true,
                },
              },
            },
          }
        },
      }),
  })),
  {
    name: 'rsbuild with a chunkSplit cacheGroup of the routes directory',
    app: () =>
      buildWithRsbuild({
        files,
        registerCleanup: () => {},
        rsbuildConfig: {
          performance: {
            chunkSplit: {
              strategy: 'custom',
              override: {
                cacheGroups: {
                  routes: {
                    test: cacheGroupTest as never,
                    name: 'routes',
                    chunks: 'all',
                    enforce: true,
                  },
                },
              },
            },
          },
        },
      }),
  },
]

describe.each(configsFor(files))('$name', ({ app: create }) => {
  let built: Promise<BuildResult> | undefined
  const app = () => (built ??= create())
  afterAll(async () => {
    await (await built)?.dispose()
  })

  test(
    'an exported function the split component calls stays lazy and unreported: the chunk carries its copy',
    async () => {
      const result = await app()
      expect(result.where('MARK_FMT_END')).toBe('lazy')
      expect(
        findDiagnostics(result.warnings, {
          severity: 'warning',
          file: 'routes/index.tsx',
          root: result.root,
        }),
      ).toEqual([])
    },
    timeout,
  )
})

// A hand-written owned key with a bad escape is no output of ours.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'an owned query key with a bad escape on an asset builds on %s',
  async (bundler) => {
    const app = await build({
      bundler,
      env: 'client',
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => <p /> })\n`,
        'a.png': 'png',
        'entry.ts': `export { Route } from './routes/index'
import './a.png?tsr-split=%'
`,
      },
      configure:
        bundler === 'vite'
          ? undefined
          : (options) => {
              ;(options.module as any).rules.push({
                test: /\.png$/,
                type: 'asset/resource',
              })
            },
    })
    await app.dispose()
  },
  timeout,
)
