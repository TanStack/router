/**
 * Import protection in a real Start build (Vite and Rsbuild): what survives
 * into the client bundle is reported, and invalid markers fail the build.
 * Import protection checks the modules of the source directory (`src`).
 * A mock is told by what it does (`mock-helpers.ts`, `describeValue`:
 * `a safe mock`), and a violation by what `onViolation` receives.
 */
import { afterAll, describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import {
  buildStart,
  buildStartShared,
  startBundlers,
} from '../../build-harness'
import {
  expectMarkerViolation,
  expectPrinted,
  expectViolationsAt,
  rejection,
  reportedViolations,
  violationsOf,
} from '../../importProtection/start-apps'
import type { StartBuild, StartBuildError } from '../../build-harness'
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

  // Import protection's `include` may reach a dependency: it is judged like
  // a module of the app, though its text names no Start API.
  test(
    'a dependency import protection includes fails the build with the denied import it uses',
    async () => {
      const report = await failureReport(
        buildStart({
          bundler,
          files: {
            'node_modules/lib/package.json': JSON.stringify({
              name: 'lib',
              type: 'module',
              exports: './index.js',
            }),
            'node_modules/lib/index.js': `import { secret } from './secret.js'\nexport const read = () => secret()\n`,
            'node_modules/lib/secret.js': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
            'src/entry.ts': `export { read } from 'lib'\n`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: {
              behavior: 'error',
              include: ['src/**', 'node_modules/lib/**'],
              client: { files: ['**/lib/secret.js'], excludeFiles: [] },
            },
          },
        }),
      )
      expect(report.environment).toBe('client')
      expect(report.importer).toMatch(/^node_modules\/lib\/index\.js/)
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
  /**
   * The violations of the default rules, each case in a directory of its
   * own of one failing build per environment (a build stops at the first
   * environment that fails): `cases/<name>/` holds the denied module and its
   * importer (the client's `entry.ts`, the server's `server.ts`), which the
   * environment's entry re-exports. Each row reads its own case's report.
   */
  const failing = {
    file: {
      environment: 'client',
      files: {
        'secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'entry.ts': `import { secret } from './secret.server'
export const read = () => secret()
`,
      },
    },
    dotFile: {
      environment: 'client',
      files: {
        '.private/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'entry.ts': `import { secret } from './.private/db.server'
export const read = () => secret()
`,
      },
    },
    specifier: {
      environment: 'client',
      files: {
        'entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
      },
    },
    marked: {
      environment: 'client',
      files: {
        'marked.ts':
          deniedModules['a server-only-marked module'].files['src/marked.ts'],
        'entry.ts': `import { secret } from './marked'
export const read = () => secret()
`,
      },
    },
    clientFile: {
      environment: 'server',
      files: {
        'widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
        'server.ts': `import { widget } from './widget.client'
export const read = () => widget()
`,
      },
    },
    clientMarked: {
      environment: 'server',
      files: {
        'marked.ts': clientOnlyMarked['src/marked.ts'],
        'server.ts': `import { secret } from './marked'
export const read = () => secret()
`,
      },
    },
  } as const
  type Case = keyof typeof failing
  const names = Object.keys(failing) as Array<Case>
  const reexporting = (environment: 'client' | 'server', file: string) =>
    names
      .filter((name) => failing[name].environment === environment)
      .map((name) => `export * as ${name} from './cases/${name}/${file}'\n`)
      .join('')
  const failed: Partial<Record<'client' | 'server', Promise<StartBuildError>>> =
    {}
  /** The failed build of the cases of `environment`. */
  const failedApp = (environment: 'client' | 'server') =>
    (failed[environment] ??= rejection(
      buildStart({
        bundler,
        files: {
          ...Object.fromEntries(
            names
              .filter((n) => failing[n].environment === environment)
              .flatMap((n) =>
                Object.entries(failing[n].files).map(([file, code]) => [
                  `src/cases/${n}/${file}`,
                  code,
                ]),
              ),
          ),
          ...(environment === 'client'
            ? { 'src/entry.ts': reexporting('client', 'entry') }
            : {
                'src/client.ts': `export const read = () => 'client'\n`,
                'src/server.ts': reexporting('server', 'server'),
              }),
        },
        entry:
          environment === 'client'
            ? 'src/entry.ts'
            : { client: 'src/client.ts', ssr: 'src/server.ts' },
      }),
    ))
  /** The failed build's violations of case `name` (and its error output). */
  async function failureOf(name: Case) {
    const error = await failedApp(failing[name].environment)
    const own = error.violations.filter((v) =>
      v.importer.includes(`/src/cases/${name}/`),
    )
    const recorded = { root: error.root, violations: own }
    const [report, ...others] = violationsOf(recorded)
    expect(report, `the violation of ${name}`).toBeDefined()
    expect(others).toEqual([])
    expectPrinted(error.diagnostics, error.root, report!, 'error')
    return { recorded, report: report!, rule: String(own[0]!.pattern) }
  }
  const at = (name: Case, file: string, position = '') =>
    `src/cases/${name}/${file}${position}`

  // (the rows read their own case's violation; the app as a whole fails
  // with one violation per case, of its environment, and no other)
  test.each(['client', 'server'] as const)(
    'the failing %s app reports one violation per case, and nothing else',
    async (environment) => {
      const error = await failedApp(environment)
      expect(
        violationsOf(error)
          .map(
            ({ environment: env, importer }) =>
              `${env} ${/^src\/cases\/([^/]+)\//.exec(importer)?.[1] ?? importer}`,
          )
          .sort(),
      ).toEqual(
        names
          .filter((name) => failing[name].environment === environment)
          .map((name) => `${environment} ${name}`)
          .sort(),
      )
    },
    timeout,
  )

  // Each violation carries the rule that matched (the file pattern, or the
  // denied specifier; SPEC J6.5).
  test.each<{ name: string; case: Case; rule: string }>([
    {
      name: 'a client import of a *.server.* file',
      case: 'file',
      rule: '**/*.server.*',
    },
    {
      name: 'a client import of a *.server.* file in a dot directory',
      case: 'dotFile',
      rule: '**/*.server.*',
    },
    {
      name: 'a client import of @tanstack/react-start/server',
      case: 'specifier',
      rule: '@tanstack/react-start/server',
    },
  ])(
    '$name fails the build, naming the importer at the use or the import, and the rule',
    async ({ case: name, rule }) => {
      const { recorded, rule: matched } = await failureOf(name)
      expectViolationsAt(recorded, [
        {
          environment: 'client',
          use: at(name, 'entry.ts', ':2:27'),
          also: [at(name, 'entry.ts', ':1')],
        },
      ])
      expect(matched).toContain(rule)
    },
    timeout,
  )

  test(
    'a server import of a *.client.* file fails the build, naming the importer at the use or the import, and the rule',
    async () => {
      const { recorded, rule } = await failureOf('clientFile')
      expectViolationsAt(recorded, [
        {
          environment: 'server',
          use: at('clientFile', 'server.ts', ':2:27'),
          also: [at('clientFile', 'server.ts', ':1')],
        },
      ])
      expect(rule).toContain('**/*.client.*')
    },
    timeout,
  )

  test(
    'a client import of a server-only-marked module fails the build, naming the module and its importer',
    async () => {
      const { report } = await failureOf('marked')
      expect(report.environment).toBe('client')
      expectMarkerViolation(report, {
        marker: at('marked', 'marked.ts', ':1'),
        use: at('marked', 'entry.ts', ':2:27'),
        imports: [at('marked', 'entry.ts', ':1')],
      })
    },
    timeout,
  )

  test(
    'a server import of a client-only-marked module fails the build, naming the module and its importer',
    async () => {
      const { report } = await failureOf('clientMarked')
      expect(report.environment).toBe('server')
      expectMarkerViolation(report, {
        marker: at('clientMarked', 'marked.ts', ':1'),
        use: at('clientMarked', 'server.ts', ':2:27'),
        imports: [at('clientMarked', 'server.ts', ':1')],
      })
    },
    timeout,
  )

  // Several modules import the marked module (directly and through a
  // re-export), so the marker check sees it imported after it has seen its
  // marker; one build, each environment with its own marked module.
  const severalImporters = (marker: 'server-only' | 'client-only') => ({
    [`src/${marker}/marked.ts`]: `import '@tanstack/react-start/${marker}'
export const secret = () => 'MARK_SECRET'
`,
    [`src/${marker}/d.ts`]: `import { secret } from './marked'
export const d = () => secret()
`,
    [`src/${marker}/c.ts`]: `export { d } from './d'\n`,
    [`src/${marker}/user.ts`]: `import { secret } from './marked'
import { d } from './c'
export const read = () => secret() + '|' + d()
`,
  })
  // (shared by both rows: closed after the file)
  let several: Promise<StartBuild> | undefined
  afterAll(() =>
    several?.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  test.each([
    { env: 'ssr', marker: 'server-only', build: 'server' },
    { env: 'client', marker: 'client-only', build: 'client' },
  ] as const)(
    'the $build build may import a $marker-marked module from several modules, without any import-protection output',
    async ({ env }) => {
      const built = await (several ??= buildStartShared({
        bundler,
        files: {
          ...severalImporters('server-only'),
          ...severalImporters('client-only'),
        },
        entry: {
          client: 'src/client-only/user.ts',
          ssr: 'src/server-only/user.ts',
        },
      }))
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
  test(
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
