/**
 * What an importer exempted from import protection gets for a denied file:
 * the real module (user ruling 2026-10-17). Exempt means matched by
 * `ignoreImporters` or `exclude`, or outside `include`. Exempting a file
 * does more than silence the report; importers that are not exempt still get
 * the mock and a report. Client environment, mock mode. That nothing is
 * reported for an exempt importer is also checked in build-options.test.ts.
 */
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import { reportedViolations, startProtectedDevServer } from './start-apps'
import type { StartBuild } from '../build-harness'
import type { ImportProtectionOptions } from '../../src/schema'

const timeout = 60_000

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { secretLoaded?: unknown }).secretLoaded
})

/**
 * `src/exempt/a.ts` and `src/app/b.ts` both use the denied file
 * `src/secret.server.ts`, which records that it ran; the entry re-exports
 * both uses.
 */
const files = {
  'src/secret.server.ts': `;(globalThis as any).secretLoaded = 'MARK_SECRET_LOADED'
export const secret = () => 'MARK_SECRET'
`,
  'src/exempt/a.ts': `import { secret } from '../secret.server'
export const exemptRead = () => secret()
`,
  'src/app/b.ts': `import { secret } from '../secret.server'
export const otherRead = () => secret()
`,
  'src/entry.ts': `export { exemptRead } from './exempt/a'
export { otherRead } from './app/b'
`,
}

/**
 * Each way to exempt `src/exempt/a.ts` but not `src/app/b.ts`, and which of
 * the tests below main fails (`.fails`): `exempt` in builds and dev,
 * `control` in builds and dev.
 */
const exemptions: Array<{
  option: string
  importProtection: ImportProtectionOptions
  fails: {
    build: { exempt: boolean; control: boolean }
    dev: { exempt: boolean; control: boolean }
  }
}> = [
  {
    option: 'ignoreImporters',
    importProtection: { ignoreImporters: ['**/exempt/*.ts'] },
    fails: {
      build: { exempt: true, control: false },
      dev: { exempt: true, control: false },
    },
  },
  {
    option: 'exclude',
    importProtection: { exclude: ['src/exempt/**'] },
    fails: {
      build: { exempt: true, control: false },
      dev: { exempt: true, control: false },
    },
  },
  {
    // The denied file is outside `include` too: see the NEW bug below.
    option: 'an importer outside include',
    importProtection: { include: ['src/app/**'] },
    fails: {
      build: { exempt: false, control: true },
      dev: { exempt: true, control: true },
    },
  },
]

/** The files of the reported violations, `<environment> <file>`. */
const reportedFiles = (output: string | Array<string>) =>
  [
    ...new Set(
      reportedViolations(output).map(
        ({ environment, importer }) =>
          `${environment} ${importer.replace(/:\d+:\d+$/, '')}`,
      ),
    ),
  ].sort()

/** What each re-exported use returns, and whether the denied file ran. */
const readScript = `const read = (use) => { try { return String(use()) } catch (error) { return 'throws: ' + error } }
return {
  exempt: read(entry.exemptRead),
  other: read(entry.otherRead),
  loaded: globalThis.secretLoaded ?? null,
}`

type Outcome = {
  exempt: string
  other: string
  loaded: unknown
  reported: Array<string>
}

// Bug: an exempt importer is only left out of the reports: it still gets
// the mock, because the denied file is mocked by its own transform, for
// every importer (vite/import-protection-plugin/plugin.ts:2158 self-denial;
// the Rsbuild adapter behaves the same). User ruling 2026-10-17.
// Impact: code a project exempts on purpose (tests, generated code)
// silently gets a mock instead of the module it imports.
const expectExemptGetsRealModule = (outcome: Outcome) =>
  expect({
    exempt: outcome.exempt,
    loaded: outcome.loaded,
    reported: outcome.reported,
  }).toEqual({
    exempt: 'MARK_SECRET',
    loaded: 'MARK_SECRET_LOADED',
    reported: ['client src/app/b.ts'],
  })

// Control: the importer that is not exempt gets the mock and is reported.
// NEW bug (`include` rows): with `importProtection.include`, a denied file
// outside the patterns is never mocked, because its own transform skips
// files out of scope before the self-denial
// (vite/import-protection-plugin/plugin.ts:2139 `shouldCheckImporter(file)`;
// Rsbuild: same outcome). An included importer is reported, but a mock-mode
// build ships the real server-only module to the client, and in Vite dev the
// importer's rewrite (`import __tss_deny_0 from '/src/secret.server.ts'`)
// reads a default export the real file lacks, so the page fails to load.
// Impact: server-only code in the client bundle in mock mode (the dev
// default, and `behavior: { build: 'mock' }`), or a broken dev page.
const expectOtherGetsMock = (outcome: Outcome) =>
  expect({ other: outcome.other, reported: outcome.reported }).toEqual({
    other: expect.not.stringMatching(/^MARK_SECRET$/),
    reported: expect.arrayContaining(['client src/app/b.ts']),
  })

describe.each(startBundlers)('%s build', (bundler) => {
  describe.each(exemptions)('$option', ({ importProtection, fails }) => {
    // One build for both tests.
    let built: Promise<StartBuild> | undefined
    let dispose: (() => Promise<void>) | undefined
    const app = () =>
      (built ??= buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { ...importProtection, behavior: 'mock' } },
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      }))
    afterAll(() => dispose?.())

    async function outcome(): Promise<Outcome> {
      const { client } = await app()
      const { result } = await client.run(readScript)
      return {
        ...(result as Omit<Outcome, 'reported'>),
        reported: reportedFiles(client.warnings),
      }
    }

    ;(fails.build.control ? test.fails : test)(
      'an importer that is not exempt gets the mock and is reported',
      async () => {
        expectOtherGetsMock(await outcome())
      },
      timeout,
    )
    ;(fails.build.exempt ? test.fails : test)(
      'the exempt importer gets the real module, and is not reported',
      async () => {
        expectExemptGetsRealModule(await outcome())
      },
      timeout,
    )
  })
})

describe.each(exemptions)(
  'vite dev: $option',
  ({ importProtection, fails }) => {
    /** Loads the entry as a browser would; what it reads, and the logs. */
    async function outcome(): Promise<Outcome> {
      const server = await startProtectedDevServer(files, importProtection)
      // The mock reports each use in the browser console.
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const module = await evaluateServed(server, '/src/entry.ts')
      const read = (use: () => unknown) => {
        try {
          return String(use())
        } catch (error) {
          return `throws: ${String(error)}`
        }
      }
      return {
        exempt: read(module.exemptRead),
        other: read(module.otherRead),
        loaded: (globalThis as { secretLoaded?: unknown }).secretLoaded ?? null,
        reported: reportedFiles(server.logs),
      }
    }

    ;(fails.dev.control ? test.fails : test)(
      'an importer that is not exempt gets the mock and is reported',
      async () => {
        expectOtherGetsMock(await outcome())
      },
      timeout,
    )
    ;(fails.dev.exempt ? test.fails : test)(
      'the exempt importer gets the real module, and is not reported',
      async () => {
        expectExemptGetsRealModule(await outcome())
      },
      timeout,
    )
  },
)
