/**
 * Rsbuild dev with RSC: the server compiler builds two compile environments,
 * `ssr` (its SSR layer) and `rsc` (its RSC layer), and a file both import is
 * a module of each (`rsc-environments-app.ts`). Each module is compiled,
 * resolved, judged by import protection and built again in its own
 * environment:
 * - a `'use client'` file that gains a client-only marker is stale in SSR
 *   only (its importer's rebuild judges it there; in `rsc` it is a client
 *   reference): SSR reports it and serves the mock, and removing the marker
 *   gives the real component again (the stale set of the environment
 *   builds its own module);
 * - `allowImport` is asked once per import and environment, `env` naming
 *   the environment as on Vite (`rsc`, `ssr`; `envType: 'server'` for both);
 * - a denied import of the `rsc` environment is its edge module, a virtual
 *   file of the server compiler: it is written and resolves, and the page
 *   renders with the mock;
 * - each environment resolves with its own conditions: `#where` is the
 *   `react-server` file in `rsc`, the default one in SSR.
 * Source: RSC model v2 §2.5 (rows for A3, A4, A14 and the `allowImport` call
 * count; user decisions 1 and 2, 11-20).
 */
import { describe, expect, test } from 'vitest'
import { startRscDevServer, startRscRsbuildDevServer } from './rsc-app'
import {
  box,
  calls,
  environmentsFiles,
  expectPage,
  recorder,
  summary,
} from './rsc-environments-app'

const timeout = 60_000

const secretViolations = [
  'rsc server file label.ts -> ./secret.client',
  'ssr server file label.ts -> ./secret.client',
]

describe('Rsbuild dev with RSC: a file in both compile environments', () => {
  test(
    "a 'use client' component that gains a client-only marker is mocked in SSR only, and real again once it loses it",
    async () => {
      const { violations, start } = recorder(
        'mock',
        (info) => info.specifier === './secret.client',
      )
      const server = await startRscRsbuildDevServer({
        browser: true,
        start,
        files: environmentsFiles,
      })
      const real = {
        route: 'MARK_SECRET MARK_WHERE_PLAIN',
        server: 'MARK_SECRET MARK_WHERE_SERVER',
        boxes: 2,
      }
      await expectPage(server.url!, real)
      expect(violations).toEqual([])
      await server.edit({ 'src/lib/Box.tsx': box(true) })
      // (both boxes are SSR's rendering of the component: the route's and
      // the server component's client reference)
      await expectPage(server.url!, { ...real, boxes: 0 })
      // (the import, and the module itself once its SSR module is built
      // again after its importer: none in `rsc`)
      expect(summary(violations)).toEqual([
        'ssr server marker Box.tsx -> src/lib/Box.tsx',
        'ssr server marker shared.tsx -> ./Box',
      ])
      const since = violations.length
      await server.edit({ 'src/lib/Box.tsx': box(false) })
      await expectPage(server.url!, real)
      expect(violations.slice(since)).toEqual([])
    },
    timeout,
  )

  test(
    'allowImport is asked once for each environment of an import a file of both makes',
    async () => {
      const { asked, start } = recorder('error', () => true)
      const server = await startRscRsbuildDevServer({
        browser: true,
        start,
        files: environmentsFiles,
      })
      await expectPage(server.url!, {
        route: 'MARK_SECRET MARK_WHERE_PLAIN',
        server: 'MARK_SECRET MARK_WHERE_SERVER',
        boxes: 2,
      })
      expect(calls(asked).sort()).toEqual(secretViolations)
    },
    timeout,
  )

  test(
    "a denied import of the rsc environment is served its mock, and each environment's is reported",
    async () => {
      const { violations, start } = recorder('mock')
      const server = await startRscRsbuildDevServer({
        browser: true,
        start,
        files: environmentsFiles,
      })
      const html = await expectPage(server.url!, {
        route: expect.stringContaining('MARK_WHERE_PLAIN'),
        server: expect.stringContaining('MARK_WHERE_SERVER'),
        boxes: 2,
      } as never)
      expect(html).not.toContain('MARK_SECRET')
      expect(summary(violations)).toEqual(secretViolations)
    },
    timeout,
  )

  test(
    'each environment judges the file its own conditions resolve',
    async () => {
      const { violations, start } = recorder('mock')
      const server = await startRscRsbuildDevServer({
        browser: true,
        start,
        files: {
          ...environmentsFiles,
          'package.json': JSON.stringify({
            name: 'app',
            private: true,
            type: 'module',
            imports: {
              '#where': {
                'react-server': './src/where/server.client.ts',
                default: './src/where/plain.ts',
              },
            },
          }),
          'src/where/server.client.ts': `export const where = () => 'MARK_WHERE_DENIED'\n`,
          'src/lib/label.ts': `import { where } from '#where'
export const label = () => where()
`,
        },
      })
      const html = await expectPage(server.url!, {
        route: 'MARK_WHERE_PLAIN',
        server: expect.any(String),
        boxes: 2,
      } as never)
      expect(html).not.toContain('MARK_WHERE_DENIED')
      expect(summary(violations)).toEqual([
        'rsc server file label.ts -> #where',
      ])
    },
    timeout,
  )
})

// The same import on Vite, whose provider is an environment of its own: one
// call per environment too.
describe('Vite dev with RSC: a file in both environments', () => {
  test(
    'allowImport is asked once for each environment of an import a file of both makes',
    async () => {
      const { asked, start } = recorder('error', () => true)
      const server = await startRscDevServer({
        listen: true,
        start,
        files: environmentsFiles,
      })
      const page = await server.fetch('/')
      expect(page.status).toBe(200)
      expect(page.body).toContain('MARK_SECRET MARK_WHERE_PLAIN')
      expect(page.body).toContain('MARK_SECRET MARK_WHERE_SERVER')
      expect(calls(asked).sort()).toEqual(secretViolations)
    },
    timeout,
  )
})
