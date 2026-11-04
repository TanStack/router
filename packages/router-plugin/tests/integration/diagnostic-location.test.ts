/**
 * A router compile error or warning on webpack, Rspack and Rsbuild names its
 * position as the compilation's own location (SPEC G5, §5.7): the bundlers
 * print the module and the location of a compilation error or warning from
 * its stats' `moduleName` and `loc` (webpack `WARNING in ./routes/index.tsx
 * 2:22`, Rsbuild `File: ./routes/index.tsx:2:22` in the terminal and the
 * overlay; `:1:1` without a `loc`). Columns are 1-based, as in the message.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { tanstackRouter as rspackRouter } from '../../src/rspack'
import { tanstackRouter as webpackRouter } from '../../src/webpack'
import { build, rootRoute, routeApp } from '../build-harness'
import type { RsbuildPlugin } from '@rsbuild/core'

const timeout = 60_000

const routers = { rspack: rspackRouter, webpack: webpackRouter } as const

/** The apps live next to the other harness apps, where imports resolve. */
const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

interface Located {
  severity: 'error' | 'warning'
  moduleName?: string
  loc?: string
  message: string
}

interface StatsLike {
  toJson: (options: object) => {
    errors?: Array<{ moduleName?: string; loc?: string; message: string }>
    warnings?: Array<{ moduleName?: string; loc?: string; message: string }>
  }
}

/** A compilation's errors and warnings, as the bundler reads them to print them. */
function readStats(stats: StatsLike | undefined, seen: Array<Located>) {
  const json = stats?.toJson({ all: false, errors: true, warnings: true })
  for (const severity of ['error', 'warning'] as const) {
    for (const entry of json?.[`${severity}s`] ?? []) {
      seen.push({
        severity,
        moduleName: entry.moduleName,
        loc: entry.loc,
        message: entry.message,
      })
    }
  }
}

/** A webpack / Rspack plugin recording every compilation's errors and warnings. */
function recordLocations() {
  const seen: Array<Located> = []
  return {
    seen,
    plugin: {
      apply(compiler: {
        hooks: {
          done: { tap: (name: string, fn: (stats: StatsLike) => void) => void }
        }
      }) {
        compiler.hooks.done.tap('test:diagnostic-locations', (stats) =>
          readStats(stats, seen),
        )
      },
    },
  }
}

/** The locations a bundler would print for the route file's router diagnostics. */
function locationsOf(seen: Array<Located>, severity: Located['severity']) {
  return seen
    .filter(
      (entry) =>
        entry.severity === severity &&
        entry.moduleName?.replace(/^\.\//, '') === 'routes/index.tsx' &&
        /tanstack-router/.test(entry.message),
    )
    .map(({ loc }) => loc)
}

const at = (source: string, needle: string) => {
  const { line, column } = diagnosticPosition(source, needle)
  return `${line}:${column}`
}

// J2.11: a second factory call in the route file is reported at that call
const severalCalls = `import { createFileRoute } from '@tanstack/react-router'
export const Other = createFileRoute('/')({})
export const Route = createFileRoute('/')({ component: () => 'MARK_PAGE' })
`
const severalCallsAt = at(severalCalls, "createFileRoute('/')({})")

// A factory the router does not recognise, with server options to delete:
// the compile fails at the factory
const foreignFactory = `import { createFileRoute } from '../lib/router'
export const Route = createFileRoute('/')({
  component: () => 'MARK_PAGE',
  server: { handlers: { GET: () => 'MARK_SECRET' } },
})
`
const foreignFactoryAt = at(foreignFactory, 'createFileRoute(')
const foreignFactoryFiles = {
  'lib/router.ts': `export { createFileRoute } from '@tanstack/react-router'\n`,
}

describe.each(['webpack', 'rspack'] as const)('%s build', (bundler) => {
  test(
    'a compile warning is located at its position',
    async () => {
      const { plugin, seen } = recordLocations()
      await build({
        bundler,
        env: 'client',
        files: routeApp(severalCalls, { env: 'client' }),
        routerPlugins: (config) => [routers[bundler](config), plugin],
      })
      const located = locationsOf(seen, 'warning')
      expect(located).not.toEqual([])
      expect(located).toEqual(located.map(() => severalCallsAt))
    },
    timeout,
  )

  test(
    'a compile error is located at its position',
    async () => {
      const { plugin, seen } = recordLocations()
      await expect(
        build({
          bundler,
          env: 'client',
          files: routeApp(foreignFactory, {
            env: 'client',
            files: foreignFactoryFiles,
          }),
          pluginOptions: { codeSplittingOptions: { deleteNodes: ['server'] } },
          routerPlugins: (config) => [routers[bundler](config), plugin],
        }),
      ).rejects.toBeInstanceOf(BuildError)
      const located = locationsOf(seen, 'error')
      expect(located).not.toEqual([])
      expect(located).toEqual(located.map(() => foreignFactoryAt))
    },
    timeout,
  )
})

describe('rsbuild dev server', () => {
  test(
    'a compile error and a warning are located at their positions',
    async () => {
      const seen: Array<Located> = []
      const recorder: RsbuildPlugin = {
        name: 'test:diagnostic-locations',
        setup(api) {
          api.onAfterEnvironmentCompile(({ stats }) =>
            readStats(stats as StatsLike | undefined, seen),
          )
        },
      }
      const serve = async (route: string, deleteNodes?: Array<'server'>) => {
        const server = await createRsbuildDevServer({
          dir: appsDir,
          prefix: '.diagnostic-location-rsbuild-',
          registerCleanup: onTestFinished,
          entry: 'main.tsx',
          files: {
            'main.tsx': `import { Route } from './routes/index'\n;(globalThis as any).__route = Route\n`,
            'routes/__root.tsx': rootRoute,
            'routes/index.tsx': route,
            ...foreignFactoryFiles,
          },
          plugins: ({ root }) => [
            pluginReact({ fastRefresh: false }),
            recorder,
            {
              name: 'diagnostic-location-router',
              setup(api) {
                api.modifyRspackConfig((config) => {
                  config.plugins.push(
                    rspackRouter({
                      target: 'react',
                      autoCodeSplitting: true,
                      routesDirectory: path.join(root, 'routes'),
                      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                      codeSplittingOptions: { deleteNodes },
                    }),
                  )
                })
              },
            },
          ],
        })
        await server.settle()
      }
      await serve(severalCalls)
      const warnings = locationsOf(seen, 'warning')
      expect(warnings).not.toEqual([])
      expect(warnings).toEqual(warnings.map(() => severalCallsAt))
      seen.length = 0
      await serve(foreignFactory, ['server'])
      const errors = locationsOf(seen, 'error')
      expect(errors).not.toEqual([])
      expect(errors).toEqual(errors.map(() => foreignFactoryAt))
    },
    timeout,
  )
})
