/**
 * Import protection in a real Start build (Vite and Rsbuild): what survives
 * into the client bundle is reported, and invalid markers fail the build.
 * Import protection checks the modules of the source directory (`src`).
 * A mock is told by what it does (`mock-helpers.ts`, `describeValue`:
 * `a safe mock`), and a violation by what `onViolation` receives.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import {
  expectMarkerViolation,
  expectPrinted,
  expectViolationsAt,
  rejection,
  reportedViolations,
  violationsOf,
} from '../../importProtection/start-apps'
import type { StartBuild } from '../../build-harness'
import type { TanStackStartInputConfig } from '../../../src'

const timeout = 60_000

/**
 * Start's import protection options of a build that fails on a violation,
 * denying `files` to the client.
 */
function importProtection(files: Array<string> = []) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

/** A server-only module (denied to the client by `importedAs`). */
const deniedModules = {
  'a denied file': {
    importedAs: './secret.server',
    files: {
      'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    },
  },
  'a server-only-marked module': {
    importedAs: './marked',
    files: {
      'src/marked.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
    },
  },
}
type DeniedModule = keyof typeof deniedModules

/** A client-only module (denied to the server by its marker). */
const clientOnlyMarked = {
  'src/marked.ts': `import '@tanstack/react-start/client-only'
export const secret = () => 'MARK_SECRET'
`,
}

/** An app whose client entry `src/entry.ts` uses `denied`. */
function appUsing(denied: DeniedModule) {
  const { importedAs, files } = deniedModules[denied]
  return {
    ...files,
    'src/entry.ts': `import { secret } from '${importedAs}'
export const read = () => secret()
`,
  }
}

/**
 * What a failed build reported, on every channel (a compiler may print the
 * details to the console and fail the build with a short error, SPEC §5.7):
 * the `StartBuildError`'s diagnostics.
 */
const everyChannel = (error: Error) =>
  (error as Error & { diagnostics?: Array<unknown> }).diagnostics ?? error

/**
 * Builds `files` with `bundler`; what the client gets from `entry.read()`,
 * and what the build reported as a problem on any channel (`warnings`).
 */
async function clientRead(
  bundler: (typeof startBundlers)[number],
  files: Record<string, string>,
  start: TanStackStartInputConfig,
) {
  const build = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start,
  })
  const { client } = build
  const read = (await client.run(`return String(entry.read())`))
    .result as string
  return {
    /** The real module's code is in the client bundle. */
    hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
    /** `entry.read()` ran the real module. */
    ranReal: read === 'MARK_SECRET',
    warnings: problems(build.diagnostics).map(({ text }) => text),
  }
}

/**
 * The one violation of a failed build (`onViolation`), and its rule; the
 * build's error output names its importer and location (SPEC §5.7: file and
 * position).
 */
async function failureReport(build: Promise<StartBuild>) {
  const error = await rejection(build)
  const [report, ...others] = violationsOf(error)
  expect(others).toEqual([])
  expectPrinted(error.diagnostics, error.root, report!, 'error')
  return { ...report!, rule: String(error.violations[0]!.pattern) }
}

describe.each(startBundlers)('%s build', (bundler) => {
  // A denied pure re-export barrel whose export the client uses survives
  // into the client bundle (as the code it re-exports), so it must be
  // reported.
  // Source: issue #8102 (closed without a reproduction: Rolldown may elide
  // the barrel from `chunk.modules`).
  test(
    'a denied re-export barrel the client uses fails the build',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: {
            'src/secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
            'src/barrel.ts': `export { secret } from './secret'\n`,
            'src/entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(['**/barrel.ts']),
        }),
      )
      expect(report.environment).toBe('client')
      expect(report.importer).toMatch(/^src\/entry\.ts/)
    },
    timeout,
  )

  test(
    'a file with both a server-only and a client-only marker fails the build, naming the file',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const value = 1
`,
            'src/entry.ts': `import { value } from './both'\nexport const read = () => value\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(),
        }),
      )
      expectDiagnostic(everyChannel(error), {
        severity: 'error',
        file: 'src/both.ts',
      })
    },
    timeout,
  )
})

// Start's default import protection (no options): the defaults deny
// `*.server.*` files, `@tanstack/<framework>-start/server` and modules marked
// server-only to the client, and a build fails on a violation.
// Source: review (the default rules were never built in error mode: every
// build test replaced `client.files`).
describe.each(startBundlers)('%s build, default rules', (bundler) => {
  // Each violation carries the rule that matched (the file pattern, or the
  // denied specifier; SPEC J6.5).
  test.each<{
    name: string
    files: Record<string, string>
    reported: string
    rule: string
  }>([
    {
      name: 'a client import of a *.server.* file',
      files: appUsing('a denied file'),
      reported: 'src/entry.ts:2:27',
      rule: '**/*.server.*',
    },
    {
      name: 'a client import of a *.server.* file in a dot directory',
      files: {
        'src/.private/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/entry.ts': `import { secret } from './.private/db.server'
export const read = () => secret()
`,
      },
      reported: 'src/entry.ts:2:27',
      rule: '**/*.server.*',
    },
    {
      name: 'a client import of @tanstack/react-start/server',
      files: {
        'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
      },
      reported: 'src/entry.ts:2:27',
      rule: '@tanstack/react-start/server',
    },
  ])(
    '$name fails the build, naming the importer at the use or the import, and the rule',
    async ({ files, reported, rule }) => {
      const build = buildStart({ bundler, files, entry: 'src/entry.ts' })
      const report = await failureReport(build)
      expectViolationsAt(await rejection(build), [
        { environment: 'client', use: reported, also: ['src/entry.ts:1'] },
      ])
      expect(report.rule).toContain(rule)
    },
    timeout,
  )

  test(
    'a server import of a *.client.* file fails the build, naming the importer at the use or the import, and the rule',
    async () => {
      const server = `import { widget } from './widget.client'
export const read = () => widget()
`
      const build = buildStart({
        bundler,
        files: {
          'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
          'src/server.ts': server,
          'src/client.ts': `export const read = () => 'client'\n`,
        },
        entry: { client: 'src/client.ts', ssr: 'src/server.ts' },
      })
      const report = await failureReport(build)
      expectViolationsAt(await rejection(build), [
        {
          environment: 'server',
          use: 'src/server.ts:2:27',
          also: ['src/server.ts:1'],
        },
      ])
      expect(report.rule).toContain('**/*.client.*')
    },
    timeout,
  )

  test(
    'a client import of a server-only-marked module fails the build, naming the module and its importer',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: appUsing('a server-only-marked module'),
          entry: 'src/entry.ts',
        }),
      )
      expect(report.environment).toBe('client')
      expectMarkerViolation(report, {
        marker: 'src/marked.ts:1',
        use: 'src/entry.ts:2:27',
        imports: ['src/entry.ts:1'],
      })
    },
    timeout,
  )

  test(
    'a server import of a client-only-marked module fails the build, naming the module and its importer',
    async () => {
      const serverImportsMarked = `import { secret } from './marked'
export const read = () => secret()
`
      const report = await failureReport(
        buildStart({
          bundler,
          files: {
            ...clientOnlyMarked,
            'src/server.ts': serverImportsMarked,
            'src/client.ts': `export const read = () => 'client'\n`,
          },
          entry: { client: 'src/client.ts', ssr: 'src/server.ts' },
        }),
      )
      expect(report.environment).toBe('server')
      expectMarkerViolation(report, {
        marker: 'src/marked.ts:1',
        use: 'src/server.ts:2:27',
        imports: ['src/server.ts:1'],
      })
    },
    timeout,
  )

  // Several modules import the marked module (directly and through a
  // re-export), so the marker check sees it imported after it has seen its
  // marker.
  test.each([
    { env: 'ssr', marker: 'server-only', build: 'server' },
    { env: 'client', marker: 'client-only', build: 'client' },
  ] as const)(
    'the $build build may import a $marker-marked module from several modules, without any import-protection output',
    async ({ env, marker }) => {
      const built = await buildStart({
        bundler,
        files: {
          'src/marked.ts': `import '@tanstack/react-start/${marker}'
export const secret = () => 'MARK_SECRET'
`,
          'src/d.ts': `import { secret } from './marked'
export const d = () => secret()
`,
          'src/c.ts': `export { d } from './d'\n`,
          'src/user.ts': `import { secret } from './marked'
import { d } from './c'
export const read = () => secret() + '|' + d()
`,
          'src/other.ts': `export const read = () => 'other'\n`,
        },
        entry:
          env === 'ssr'
            ? { client: 'src/other.ts', ssr: 'src/user.ts' }
            : { client: 'src/user.ts', ssr: 'src/other.ts' },
      })
      expect((await built[env].run(`return entry.read()`)).result).toBe(
        'MARK_SECRET|MARK_SECRET',
      )
      expect(reportedViolations(built)).toEqual([])
    },
    timeout,
  )

  test(
    'enabled: false checks nothing: the client gets the real module',
    async () => {
      expect(
        await clientRead(bundler, appUsing('a denied file'), {
          importProtection: { enabled: false },
        }),
      ).toEqual({ hasRealCode: true, ranReal: true, warnings: [] })
    },
    timeout,
  )
})

// A build reports the denied imports that survive tree-shaking: "If an import
// is eliminated from the final bundle, no violation is reported"
// (guide/import-protection.md, "False Positives: Dev vs Build"; its example is a marked file
// re-exported through a mixed barrel that the client never uses).
// Source: mutation testing (generateBundle's survival check).
describe.each(startBundlers)('%s build, tree-shaken imports', (bundler) => {
  // Bug (Rsbuild): same as the pins "a denied module the client bundle drops
  // does not fail the build" (known-bugs.test.ts): the Rsbuild report step
  // walks every module of the module graph, used or not, so the marked
  // module the client bundle drops still fails the build.
  // Impact: on Rsbuild, a mixed barrel re-exporting a server-only-marked
  // module fails the build even when the client only uses its other exports.
  const barrelTest = bundler === 'rsbuild' ? test.fails : test
  barrelTest(
    'a server-only-marked module re-exported by a barrel the client uses other exports of builds without any report',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...deniedModules['a server-only-marked module'].files,
          'src/barrel.ts': `export { secret } from './marked'
export const label = () => 'client'
`,
          'src/entry.ts': `import { label } from './barrel'
export const read = () => label()
`,
        },
        entry: 'src/entry.ts',
      })
      const { client } = build
      expect({
        reported: reportedViolations(build),
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (await client.run(`return entry.read()`)).result,
      }).toEqual({ reported: [], hasRealCode: false, read: 'client' })
    },
    timeout,
  )
})
