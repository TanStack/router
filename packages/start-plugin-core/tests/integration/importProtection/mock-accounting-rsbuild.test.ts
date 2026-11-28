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
 * So is the holder itself when it holds the mock directly (a Module
 * Federation container exposing it, a provide-shared module providing it):
 * the mock is imported, outside the app, and the build has no invariant to
 * break, with or without a checked reader's dropped import.
 * Source: the RSC phase 1 re-check 7 (/var/tmp/rsc-p1-recheck7/report.md
 * finding 2, `orphan7.py`, `orphan-public7.py`: 86b46c235e built the
 * dropped-import entries with no report, db260cf3a3 failed them as without
 * the reader); re-check 8 (/var/tmp/rsc-p1-recheck8/report.md, the directly
 * held federation mock, `holders8.py`: 99cc175358 and db260cf3a3 failed
 * with "survived with no importer").
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { describe, expect, test } from 'vitest'
import { StartBuildError } from '../../build-harness'
import { buildStart } from '../../build-start'
import {
  describeValuePrelude,
  probeMockPrelude,
} from '../../importProtection/mock-helpers'

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
  )
})

describe('a mock a file-less holder imports directly', () => {
  /**
   * The provided module's `value`, as the route renders it on the server:
   * read from the default share scope (no import of the held file),
   * described (`describeValue`: a mock by what it does, never by its label).
   */
  const sharedReader = `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
${describeValuePrelude}
const shared = createIsomorphicFn()
  .server(async () => {
    await __webpack_init_sharing__('default')
    const offered = (__webpack_share_scopes__ as any).default.offered
    const held = (await (Object.values(offered)[0] as any).get())()
    // (no secret given: the test reads the real code's bytes instead)
    return describeValue(held.value)
  })
  .client(() => 'client control')
export const Route = createFileRoute('/')({
  loader: () => shared(),
  component: Home,
})
function Home() {
  return <main data-testid="held">{Route.useLoaderData()}</main>
}
`

  /**
   * Whether the module the container `container.cjs` (in `outDir`) exposes
   * as `./d` exports a safe mock as `value`, read in Node as a consumer of
   * the container reads it.
   */
  async function containerValueIsSafeMock(outDir: string) {
    const { stdout } = await runNodeProgram(
      `${probeMockPrelude}
const { createRequire } = await import('node:module')
const require = createRequire(${JSON.stringify(pathToFileURL(path.join(outDir, 'container.cjs')).href)})
const container = require('./container.cjs')
await container.init({})
const held = (await container.get('./d'))()
console.log('IP_HELD:' + JSON.stringify(isSafeMock(held.value, 'ORPHAN_REAL')))
`,
      { cwd: outDir },
    )
    const line = stdout.split('\n').find((l) => l.startsWith('IP_HELD:'))
    if (!line) {
      throw new Error(`The container gave no value: ${stdout}`)
    }
    return JSON.parse(line.slice('IP_HELD:'.length)) as boolean
  }

  /** The server environment's plugin holding `d.client.ts` itself. */
  const holders = {
    container: (rspack: any) =>
      new rspack.container.ContainerPlugin({
        name: 'holder',
        filename: 'container.cjs',
        exposes: { './d': './src/d.client.ts' },
        library: { type: 'commonjs-module' },
      }),
    provide: (rspack: any) =>
      new rspack.sharing.ProvideSharedPlugin({
        shareScope: 'default',
        provides: {
          './src/d.client.ts': {
            shareKey: 'offered',
            version: '1.0.0',
            eager: true,
          },
        },
      }),
  }
  test.each<{ holder: keyof typeof holders; dropped: boolean }>([
    { holder: 'container', dropped: false },
    { holder: 'container', dropped: true },
    { holder: 'provide', dropped: false },
    { holder: 'provide', dropped: true },
  ])(
    'Rsbuild build, held by a $holder, a checked reader with a dropped import $dropped: the build serves the mock',
    async ({ holder, dropped }) => {
      const built = await buildStart({
        bundler: 'rsbuild',
        files: {
          ...app,
          ...(holder === 'provide' && { 'src/routes/index.tsx': sharedReader }),
          ...(dropped && {
            'src/reader.ts': `if (false) import('./d.client')\n;(globalThis as any).reader = 'READER'\n`,
          }),
        },
        entry: 'src/entry.ts',
        rsbuildConfig: {
          environments: {
            ssr: {
              tools: {
                rspack: (config: any, { rspack }: any) => {
                  config.plugins.push(holders[holder](rspack))
                  if (dropped) {
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
      })
      const server = built.ssr.chunks.map(({ code }) => code).join('\n')
      // the holder's consumer gets a safe mock (the container's, in Node;
      // the share scope's, in the route), and no real code ships
      let mock: boolean
      if (holder === 'container') {
        mock = await containerValueIsSafeMock(built.ssr.outDir)
      } else {
        const { url } = await built.preview()
        const html = await (await fetch(new URL('/', url))).text()
        mock = html.includes('data-testid="held">a safe mock<')
      }
      expect({ mock, real: server.includes('ORPHAN_REAL') }).toEqual({
        mock: true,
        real: false,
      })
    },
  )
})
