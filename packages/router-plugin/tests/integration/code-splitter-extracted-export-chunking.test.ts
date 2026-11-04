/**
 * Where an exported binding the split chunk imports lands when the app's
 * own chunk configuration groups the routes directory with the entry (SPEC
 * J2.5, J2.8). A class (an object, a call result) an exported binding is
 * exists once: the chunk imports its extracted module
 * (`?tsr-split=export~Name`) instead of carrying a copy, and that module is
 * reachable from the entry (the route module re-exports it) and from the
 * chunk. A `manualChunks` function or a `cacheGroups` entry matching the
 * route files (not the split chunks) puts it in a chunk the entry loads: the
 * class is eager, still one instance, and the build says so once, naming
 * the route file. A function next to it with the same configuration stays
 * lazy and unreported: the chunk carries its copy and nobody imports its
 * module. Learned from
 * tanstack.com on Vite 8.0.x (Rolldown 1.0.3 with a `manualChunks` group),
 * where the same happened without any group over the routes; here a group
 * over the routes reproduces the placement on every bundler.
 */
import { afterAll, describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head, rootRoute } from '../build-harness'
import { tanstackRouter } from '../../src/vite'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'
import type { Plugin } from 'vite'

const timeout = 120_000

const files = {
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': `${head}export class Tag {
  static label = 'MARK_TAG_END'
}
export function Fmt(value: string) {
  return 'MARK_FMT_END' + value
}
function Page() {
  ;(globalThis as any).tagInChunk = Tag
  return <p>{new Tag() instanceof Tag ? Fmt(Tag.label) : 'other'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
  // an importer of the route file outside the routes directory
  'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route, Tag } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
}

const routesDir = /[\\/]routes[\\/]/
/** A split chunk's id (the group leaves the lazy chunks alone). */
const splitChunk = /[?&]tsr-split=(?!export~)/
const groups = (id: string) => routesDir.test(id) && !splitChunk.test(id)
const cacheGroupTest = (module: { resource?: string }) =>
  groups(module.resource ?? '')
const viteChunks = (output: Record<string, unknown>): Plugin => ({
  name: 'test:chunks',
  config: () => ({ build: { rollupOptions: { output } } }),
})

const configs: Array<{ name: string; app: () => Promise<BuildResult> }> = [
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

describe.each(configs)('$name', ({ app: create }) => {
  let built: Promise<BuildResult> | undefined
  const app = () => (built ??= create())
  afterAll(async () => {
    await (await built)?.dispose()
  })

  test(
    'an exported class the chunk imports lands with the entry, one instance, and the build says so once',
    async () => {
      const result = await app()
      expect(result.where('MARK_TAG_END')).toBe('eager')
      const { result: probe } = await result.run(
        `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.tagInChunk === entry.Tag]`,
      )
      expect(probe).toEqual(['<p>MARK_FMT_ENDMARK_TAG_END</p>', true])
      expectDiagnostic(result.warnings, {
        severity: 'warning',
        file: 'routes/index.tsx',
        root: result.root,
        times: 1,
      })
      expect(
        findDiagnostics(result.warnings, {
          severity: 'warning',
          file: 'routes/index.tsx',
          root: result.root,
        })[0]!.text,
      ).toContain('`Tag`')
    },
    timeout,
  )

  test(
    'an exported function next to it stays lazy and unreported: the chunk carries its copy',
    async () => {
      const result = await app()
      expect(result.where('MARK_FMT_END')).toBe('lazy')
      expect(
        findDiagnostics(result.warnings, {
          severity: 'warning',
          file: 'routes/index.tsx',
          root: result.root,
        }).some((d) => d.text.includes('`Fmt`')),
      ).toBe(false)
    },
    timeout,
  )
})

// The warning names what the module exports, not the binding behind it.
describe.each(['vite', 'rspack', 'webpack'] as const)(
  'an export with another name than its binding on %s',
  (bundler) => {
    test(
      'the eager-export warning names the export',
      async () => {
        const app = await build({
          bundler,
          env: 'client',
          files: {
            'routes/__root.tsx': rootRoute,
            'routes/index.tsx': `${head}class Internal {
  static label = 'MARK_ALIASED_END'
}
export { Internal as Public }
export const Route = createFileRoute('/')({
  component: () => <p>{new Internal() instanceof Internal ? Internal.label : ''}</p>,
})
`,
            'entry.ts': `export { Route, Public } from './routes/index'\n`,
          },
        })
        try {
          expect(app.where('MARK_ALIASED_END')).toBe('eager')
          const [warning, ...others] = findDiagnostics(app.warnings, {
            severity: 'warning',
            file: 'routes/index.tsx',
            root: app.root,
          })
          expect(others).toEqual([])
          expect(warning!.text).toContain('`Public`')
          expect(warning!.text).not.toContain('Internal')
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )
  },
)

// Only a query carries the compiler's keys: this file's name has none.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'a module named like an extracted export builds and is no extracted export on %s',
  async (bundler) => {
    const name = 'a&tsr-split=export~%'
    const app = await build({
      bundler,
      env: 'client',
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => <p /> })\n`,
        [`${name}.ts`]: `export const named = 'MARK_NAMED_FILE'\n`,
        'entry.ts': `export { Route } from './routes/index'
export { named } from './${name}'
`,
      },
    })
    try {
      expect(app.where('MARK_NAMED_FILE')).toBe('eager')
      expect(
        findDiagnostics(app.warnings, { severity: 'warning' }).filter(
          ({ text }) => text.includes('loads with the entry chunk'),
        ),
      ).toEqual([])
    } finally {
      await app.dispose()
    }
  },
  timeout,
)

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
