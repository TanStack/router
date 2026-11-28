/**
 * Rsbuild dev with RSC: the server compiler builds two compile environments,
 * `ssr` (its SSR layer) and `rsc` (its RSC layer), and a file both import is
 * a module of each (`rsc-environments-app.ts`). Each module is compiled,
 * resolved, judged by import protection and built again in its own
 * environment:
 * - a dependency only `rsc` resolves (`#where`'s `react-server` file) that
 *   gains a client-only marker makes the importer's `rsc` plan stale, not
 *   its SSR one: the server compiler builds the `rsc` module again, not the
 *   SSR one (the stale set of an environment builds its own module), and
 *   `rsc` reports the import and serves the mock;
 * - `allowImport` is asked once per import and environment, `env` naming
 *   the environment as on Vite (`rsc`, `ssr`; `envType: 'server'` for both);
 * - a denied import of the `rsc` environment is its edge module, a virtual
 *   file of the server compiler: it is written and resolves, and the page
 *   renders with the mock;
 * - each environment resolves with its own conditions: `#where` is the
 *   `react-server` file in `rsc`, the default one in SSR.
 * Source: RSC model v2 §2.5 (rows for A3, A4, A14 and the `allowImport` call
 * count; user decisions 1 and 2, 11-20); the A4 row as the phase 1 reviews
 * gave it (review-rsc-phase1-fable.md §4, Astra's report Part B): 88dded8da0
 * builds `label.ts` in both layers and reports `ssr`.
 */
import { describe, expect } from 'vitest'
import {
  calls,
  environmentsFiles,
  expectPage,
  recorder,
  summary,
} from './rsc-environments-app'
import { test } from './test'

const timeout = 60_000

const secretViolations = [
  'rsc server file label.ts -> ./secret.client',
  'ssr server file label.ts -> ./secret.client',
]

describe('Rsbuild dev with RSC: a file in both compile environments', () => {
  test(
    'a dependency only the rsc environment resolves gains a client-only marker: its importer is built again and mocks it in rsc only',
    async ({ startRscRsbuildDevServer }) => {
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
      // (no event on `label.ts`, which both environments compile: only its
      // `rsc` plan reads `where/server.ts`)
      await server.edit({
        'src/where/server.ts': `import '@tanstack/react-start/client-only'
export const where = () => 'MARK_WHERE_SERVER'
`,
      })
      await expectPage(server.url!, {
        ...real,
        server: 'MARK_SECRET [import-protection mock]',
      })
      expect(summary(violations)).toEqual([
        'rsc server marker label.ts -> #where',
      ])
      // its `rsc` module only: the SSR one is not stale
      expect(
        server.rebuiltBy.ssr?.filter((file) => file === 'src/lib/label.ts'),
      ).toEqual(['src/lib/label.ts'])
    },
    timeout,
  )

  test(
    'allowImport is asked once for each environment of an import a file of both makes',
    async ({ startRscRsbuildDevServer }) => {
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
    async ({ startRscRsbuildDevServer }) => {
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
    async ({ startRscRsbuildDevServer }) => {
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
    async ({ startRscDevServer }) => {
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
