/**
 * Rsbuild builds (RSC off) with a denied file as a server entry of its own:
 * its mock ships, and no import reports it, so the build accounts for it
 * with the compiler's invariant (a warning in users' builds; our test runs
 * fail the build with it). A checked file that names it in an import the
 * bundler drops (`if (false) import()`, an unused static import) is no
 * importer of it in the build's graph: the invariant holds as without that
 * file. A module a file-less holder holds that imports it is an importer,
 * outside the app: nothing reports it, as in dev
 * (`settlement-each-compilation-rsbuild.test.ts`, the provide-shared rows).
 * Source: the RSC phase 1 re-check 7 (/var/tmp/rsc-p1-recheck7/report.md
 * finding 2, `orphan7.py`, `orphan-public7.py`: 86b46c235e built the
 * dropped-import entries with no report, db260cf3a3 failed them as without
 * the reader).
 */
import { describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../../build-harness'

const timeout = 120_000

const app = {
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <main>home</main> })
`,
  'src/entry.ts': `export {}\n`,
  'src/d.client.ts': `export const value = () => 'ORPHAN_REAL'\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}

describe('a mock nothing imports in the build graph', () => {
  test.each<{ reader: string; source: string | null }>([
    { reader: 'none', source: null },
    {
      reader: 'a dropped dynamic import',
      source: `if (false) import('./d.client')\n;(globalThis as any).reader = 'READER'\n`,
    },
    {
      reader: 'an unused static import',
      source: `import { value } from './d.client'\n;(globalThis as any).reader = 'READER'\n`,
    },
  ])(
    'Rsbuild build, a checked reader with $reader: the build accounts for the mock',
    async ({ source }) => {
      const error = await buildStart({
        bundler: 'rsbuild',
        files: { ...app, ...(source !== null && { 'src/reader.ts': source }) },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          environments: {
            ssr: {
              tools: {
                rspack: (config: any) => {
                  config.entry.orphan = { import: ['./src/d.client.ts'] }
                  if (source !== null) {
                    config.entry.reader = { import: ['./src/reader.ts'] }
                  }
                },
              },
            },
          },
        } as never,
        start: {
          importProtection: { behavior: 'mock', mockAccess: 'off' },
        } as never,
      }).catch((e: unknown) => e)
      expect(error, 'the build fails').toBeInstanceOf(StartBuildError)
      expect(
        (error as StartBuildError).errors.some((text) =>
          text.includes('src/d.client.ts'),
        ),
      ).toBe(true)
    },
    timeout,
  )
})
