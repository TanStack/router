/**
 * Start's `importProtection` options, by their effect on a real Start build
 * (Vite and Rsbuild), as guide/import-protection.md documents them. Without
 * options, a build fails on a violation (build.test.ts).
 * Source: oracle-gaps parts/options.md, importProtection rows (options that
 * were parsed but never exercised for effect).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  distinct,
  expectMarkerViolation,
  rejection,
  reportedViolations,
  violationReports,
} from '../../importProtection/start-apps'
import type { ImportProtectionOptions } from '../../../src/schema'

const timeout = 60_000

/** A server-only module, denied to the client by Start's default rules. */
const secretServer = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
}

/** A module at `path` (under `src/`) that uses `secret` of `from`. */
const userOf = (from: string) => `import { secret } from '${from}'
export const read = () => secret()
`

/** A dependency `name` whose entry is `file`, exporting `secret`. */
const dependency = (name: string, file = 'index.js') => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: { '.': `./${file}` },
  }),
  [`node_modules/${name}/${file}`]: `export const secret = () => 'MARK_SECRET'\n`,
})

describe.each(startBundlers)('%s build', (bundler) => {
  /**
   * Builds `files` (client entry `src/entry.ts`, or `entry`) with
   * `importProtection`; the violations reported, as `<environment>
   * <importer>`, or `built` when the build succeeds without any.
   */
  async function outcome(
    files: Record<string, string>,
    importProtection: ImportProtectionOptions,
    entry: string | { client: string; ssr: string } = 'src/entry.ts',
  ): Promise<string | Array<string>> {
    const built = buildStart({
      bundler,
      files,
      entry,
      start: { importProtection },
    })
    const toList = (output: string | Array<string>) =>
      reportedViolations(output).map(
        ({ environment, importer }) =>
          `${environment} ${importer.replace(/:\d+:\d+$/, '')}`,
      )
    try {
      const { client, ssr } = await built
      const warned = toList([...client.warnings, ...ssr.warnings])
      return warned.length ? warned : 'built'
    } catch {
      return toList((await rejection(built)).message)
    }
  }

  describe('behavior', () => {
    const app = { ...secretServer, 'src/entry.ts': userOf('./secret.server') }

    test(
      "{ build: 'mock' }: the build mocks the import and warns",
      async () => {
        const { client } = await buildStart({
          bundler,
          files: app,
          entry: 'src/entry.ts',
          start: {
            importProtection: { behavior: { dev: 'error', build: 'mock' } },
          },
        })
        expect(reportedViolations(client.warnings)).toEqual([
          {
            environment: 'client',
            importer: expect.stringMatching(/^src\/entry\.ts/),
          },
        ])
        expect(client.where('MARK_SECRET')).toBe('nowhere')
      },
      timeout,
    )

    test(
      "{ dev: 'mock' }: the build keeps its default and fails",
      async () => {
        expect(await outcome(app, { behavior: { dev: 'mock' } })).toEqual([
          'client src/entry.ts',
        ])
      },
      timeout,
    )
  })

  // Scope: which importers are checked.
  describe('include, exclude and ignoreImporters', () => {
    test(
      'include: an importer outside the patterns is not checked',
      async () => {
        expect(
          await outcome(
            {
              ...secretServer,
              'src/other/a.ts': userOf('../secret.server'),
              'src/entry.ts': `export { read } from './other/a'\n`,
            },
            { include: ['src/app/**'] },
          ),
        ).toBe('built')
      },
      timeout,
    )

    test(
      'include: an importer matching the patterns is checked',
      async () => {
        expect(
          await outcome(
            {
              ...secretServer,
              'src/app/a.ts': userOf('../secret.server'),
              'src/entry.ts': `export { read } from './app/a'\n`,
            },
            { include: ['src/app/**'] },
          ),
        ).toEqual(['client src/app/a.ts'])
      },
      timeout,
    )

    // These rows check that nothing is reported; what the excluded or
    // ignored importer then gets for the denied file (the real module) is
    // pinned in exemptions.test.ts.
    test.each([
      {
        option: 'exclude',
        importProtection: { exclude: ['src/generated/**'] },
      },
      {
        option: 'ignoreImporters',
        importProtection: { ignoreImporters: ['**/generated/*.ts'] },
      },
    ])(
      '$option: a matching importer is not reported, others are',
      async ({ importProtection }) => {
        expect(
          await outcome(
            {
              ...secretServer,
              'src/generated/a.ts': userOf('../secret.server'),
              'src/entry.ts': `export { read } from './generated/a'\n`,
            },
            importProtection,
          ),
        ).toBe('built')
        expect(
          await outcome(
            {
              ...secretServer,
              'src/generated/a.ts': userOf('../secret.server'),
              'src/b.ts': `import { secret } from './secret.server'
export const other = () => secret()
`,
              'src/entry.ts': `export { read } from './generated/a'
export { other } from './b'
`,
            },
            importProtection,
          ),
        ).toEqual(['client src/b.ts'])
      },
      timeout,
    )
  })

  describe('specifiers', () => {
    test(
      'client.specifiers adds to the defaults: both are denied to the client',
      async () => {
        const importProtection = { client: { specifiers: ['db-lib'] } }
        expect(
          await outcome(
            { ...dependency('db-lib'), 'src/entry.ts': userOf('db-lib') },
            importProtection,
          ),
        ).toEqual(['client src/entry.ts'])
        expect(
          await outcome(
            {
              'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
            },
            importProtection,
          ),
        ).toEqual(['client src/entry.ts'])
      },
      timeout,
    )

    test(
      'server.specifiers are denied to the server build',
      async () => {
        expect(
          await outcome(
            {
              ...dependency('browser-lib'),
              'src/client.ts': `export const read = () => 'client'\n`,
              'src/server.ts': userOf('browser-lib'),
            },
            { server: { specifiers: ['browser-lib'] } },
            { client: 'src/client.ts', ssr: 'src/server.ts' },
          ),
        ).toEqual(['server src/server.ts'])
      },
      timeout,
    )

    // Source: round 4 mutation testing (rsbuild host, the pattern of a
    // specifier violation).
    test(
      'a RegExp pattern is reported as the rule that matched',
      async () => {
        const error = await rejection(
          buildStart({
            bundler,
            files: {
              ...dependency('db-lib'),
              'src/entry.ts': userOf('db-lib'),
            },
            entry: 'src/entry.ts',
            start: {
              importProtection: { client: { specifiers: [/^db-lib$/] } },
            },
          }),
        )
        const reports = violationReports(error.message)
        expect(reports).not.toEqual([])
        for (const report of reports) {
          // (the rule that matched is in the report)
          expect(report.text).toContain('/^db-lib$/')
        }
      },
      timeout,
    )
  })

  // `excludeFiles`: resolved files the file and marker rules skip; a value
  // replaces the default (`**/node_modules/**`).
  describe('excludeFiles', () => {
    /** A dependency whose entry is a `*.server.*` file, used by the client. */
    const serverFileDependency = {
      ...dependency('server-pkg', 'secret.server.js'),
      'src/entry.ts': userOf('server-pkg'),
    }

    test.each<{
      name: string
      importProtection: ImportProtectionOptions
      expected: string | Array<string>
    }>([
      {
        name: 'by default, a *.server.* file of a dependency is not denied',
        importProtection: {},
        expected: 'built',
      },
      {
        name: '[] checks dependencies: their *.server.* files are denied',
        importProtection: { client: { excludeFiles: [] } },
        expected: ['client src/entry.ts'],
      },
      {
        name: 'other patterns replace the default: dependencies are checked',
        importProtection: { client: { excludeFiles: ['**/vendor/**'] } },
        expected: ['client src/entry.ts'],
      },
      {
        name: 'a file matching any one of several patterns is not denied',
        importProtection: {
          client: { excludeFiles: ['**/vendor/**', '**/node_modules/**'] },
        },
        expected: 'built',
      },
    ])(
      '$name',
      async ({ importProtection, expected }) => {
        expect(await outcome(serverFileDependency, importProtection)).toEqual(
          expected,
        )
      },
      timeout,
    )

    test(
      'a file matching the patterns is not denied',
      async () => {
        expect(
          await outcome(
            {
              'src/vendor/secret.server.ts':
                secretServer['src/secret.server.ts'],
              'src/entry.ts': userOf('./vendor/secret.server'),
            },
            { client: { excludeFiles: ['**/vendor/**'] } },
          ),
        ).toBe('built')
      },
      timeout,
    )

    /** A dependency whose entry is marked server-only, used by the client. */
    const markedDependency = {
      ...dependency('db-lib'),
      'node_modules/db-lib/index.js': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
      'src/entry.ts': userOf('db-lib'),
    }

    // Replaces the Rsbuild unit test of getRsbuildResolvedImportProtectionCheck
    // ("skips file and marker checks for excluded resolved files").
    // NEW bug (Vite): the Vite adapter checks a server-only marker when it
    // resolves the marker import, for any importer, and never applies
    // `excludeFiles` to the marked module (vite/import-protection-plugin/
    // plugin.ts, marker handling in `resolveId`), so the build fails with a
    // marker violation of `node_modules/db-lib/index.js`. The docs: "By
    // default, resolved files inside `node_modules` are excluded from
    // resolved-target deny checks (file-pattern and marker checks)"
    // (guide/import-protection.md). Rsbuild follows them.
    // Impact: on Vite, a client import of a dependency that marks itself
    // server-only fails the build although the defaults exclude it (and
    // `excludeFiles` cannot exempt it).
    // Source: audit F (replacement of rsbuild/import-protection.test.ts:16).
    ;(bundler === 'vite' ? test.fails : test)(
      'by default, the server-only marker of a dependency is not checked',
      async () => {
        expect(await outcome(markedDependency, {})).toBe('built')
      },
      timeout,
    )

    // Bug (Rsbuild): with `excludeFiles: []`, the Rsbuild adapter still
    // skips the marker check of files under `node_modules` (the build
    // succeeds without any report); `excludeFiles` is documented as the
    // files the file-pattern and marker checks skip (guide/import-protection.md),
    // and Vite checks them.
    // Impact: on Rsbuild, a project cannot opt in to checking the
    // server-only markers of its dependencies.
    // Source: audit F (build-options.test.ts ran this row on Vite only,
    // awaiting a ruling; the docs decide).
    ;(bundler === 'rsbuild' ? test.fails : test)(
      '[] checks the markers of dependencies: a server-only-marked dependency fails the build',
      async () => {
        const error = await rejection(
          buildStart({
            bundler,
            files: markedDependency,
            entry: 'src/entry.ts',
            start: { importProtection: { client: { excludeFiles: [] } } },
          }),
        )
        const [report, ...others] = violationReports(error.message)
        expect(others).toEqual([])
        expect(report!.environment).toBe('client')
        expectMarkerViolation(report!, {
          marker: 'node_modules/db-lib/index.js:1',
          use: 'src/entry.ts:2:27',
          source: markedDependency['src/entry.ts'],
        })
      },
      timeout,
    )
  })

  describe('onViolation', () => {
    // Only `false` allows an import: a callback that returns nothing (one
    // that logs, say) leaves the import denied.
    test.each<{
      name: string
      files: Record<string, string>
      reported: RegExp
      /** The modules the report names. */
      names?: Array<string>
      type: Violation['type']
    }>([
      {
        name: 'a denied file',
        files: { ...secretServer, 'src/entry.ts': userOf('./secret.server') },
        reported: /^src\/entry\.ts:2:27$/,
        type: 'file',
      },
      {
        name: 'a server-only-marked module',
        files: {
          'src/marked.ts': `export const before = 1
import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
          'src/entry.ts': userOf('./marked'),
        },
        // At the marker import or at the importer's use (audit F ASK-1).
        reported: /^(src\/marked\.ts:2:\d+|src\/entry\.ts:2:27)$/,
        names: ['src/marked.ts', 'src/entry.ts'],
        type: 'marker',
      },
      // Source: round 4 mutation testing (rsbuild host, the type of a
      // specifier violation).
      {
        name: 'a denied specifier',
        files: {
          'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
        },
        reported: /^src\/entry\.ts:2:\d+$/,
        type: 'specifier',
      },
    ])(
      'a callback that returns nothing does not allow $name: the build fails, and the callback gets a $type violation',
      async ({ files, reported, names = [], type }) => {
        const seen: Array<Violation> = []
        const error = await rejection(
          buildStart({
            bundler,
            files,
            entry: 'src/entry.ts',
            start: {
              importProtection: {
                onViolation: (info) => {
                  seen.push(info as Violation)
                },
              },
            },
          }),
        )
        expect(reportedViolations(error.message)).toEqual([
          { environment: 'client', importer: expect.stringMatching(reported) },
        ])
        for (const name of names) {
          expect(error.message).toContain(name)
        }
        expect(distinct(seen.map((info) => info.type))).toEqual([type])
      },
      timeout,
    )

    // Source: mutation run R4 (spc:5137, the `specifier` type of the
    // table above).
    test(
      'the callback gets a specifier violation for an import of a denied specifier',
      async () => {
        const seen: Array<Violation> = []
        await rejection(
          buildStart({
            bundler,
            files: {
              'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
            },
            entry: 'src/entry.ts',
            start: {
              importProtection: {
                onViolation: (info) => {
                  seen.push(info as Violation)
                },
              },
            },
          }),
        )
        expect(
          distinct(seen.map((info) => `${info.type} ${info.specifier}`)),
        ).toEqual(['specifier @tanstack/react-start/server'])
      },
      timeout,
    )

    test(
      'in mock mode, it gets each import of a denied specifier with the file the specifier resolves to; the mocks are safe (and silent with mockAccess off)',
      async () => {
        const seen: Array<Violation> = []
        const { client } = await buildStart({
          bundler,
          files: {
            ...dependency('db-lib'),
            ...dependency('mail-lib'),
            'src/a.ts': `import { secret } from 'db-lib'
import { secret as mail } from 'mail-lib'
import { b } from './b'
export const a = () => [secret(), mail(), b()]
`,
            'src/b.ts': `import { secret } from 'db-lib'
export const b = () => secret()
`,
            'src/entry.ts': `import { a } from './a'
export const read = () => a()
`,
          },
          entry: 'src/entry.ts',
          start: {
            importProtection: {
              behavior: 'mock',
              mockAccess: 'off',
              client: { specifiers: ['db-lib', 'mail-lib'] },
              onViolation: (info) => {
                seen.push(info as Violation)
              },
            },
          },
        })
        const fromRoot = (file: string) =>
          file.replace(/^.*?\/(src|node_modules)\//, '$1/')
        expect(
          distinct(
            seen
              .filter((info) => info.envType === 'client')
              .map(
                (info) =>
                  `${fromRoot(info.importer)} ${info.specifier} -> ${info.resolved ? fromRoot(info.resolved) : 'none'}`,
              ),
          ).sort(),
        ).toEqual([
          'src/a.ts db-lib -> node_modules/db-lib/index.js',
          'src/a.ts mail-lib -> node_modules/mail-lib/index.js',
          'src/b.ts db-lib -> node_modules/db-lib/index.js',
        ])
        expect(
          await client.run(`${describeValuePrelude}
return entry.read().map((value) => describeValue(value, 'MARK_SECRET'))`),
        ).toMatchObject({
          result: ['a safe mock', 'a safe mock', 'a safe mock'],
          logs: [],
        })
      },
      timeout,
    )
  })

  describe('log', () => {
    test(
      "'always' reports each violation of a build once",
      async () => {
        const error = await rejection(
          buildStart({
            bundler,
            files: {
              'src/secret.server.ts': `export const secret = () => 'secret'
export const other = () => 'other'
`,
              'src/marked.ts': `import '@tanstack/react-start/server-only'
export const m = () => 'MARK_SECRET'
`,
              'src/a.ts': `import { m } from './marked'\nexport const a = () => m()\n`,
              'src/b.ts': `import { m } from './marked'\nexport const b = () => m() + m()\n`,
              'src/entry.ts': `import { secret, other } from './secret.server'
export const read = () => secret() + other() + secret()
export { a } from './a'
export { b } from './b'
`,
            },
            entry: 'src/entry.ts',
            start: { importProtection: { log: 'always' } },
          }),
        )
        const reported = reportedViolations(error.message).map(
          ({ importer }) => importer,
        )
        expect(reported).toContain('src/entry.ts:2:27')
        expect(reported).toEqual(distinct(reported))
      },
      timeout,
    )
  })

  describe('maxTraceDepth', () => {
    /** The client imports `src/secret.server.ts` through a chain of modules. */
    const chain = {
      ...secretServer,
      'src/b.ts': userOf('./secret.server'),
      'src/a.ts': `import { read } from './b'\nexport const page = () => read()\n`,
      'src/entry.ts': `export * from './a'\n`,
    }

    /** The modules of the trace of the violation the build reports. */
    async function traceOf(importProtection: ImportProtectionOptions) {
      const error = await rejection(
        buildStart({
          bundler,
          files: chain,
          entry: 'src/entry.ts',
          start: { importProtection },
        }),
      )
      const [report, ...others] = violationReports(error.message)
      expect(others).toEqual([])
      return report!.trace.map(({ at }) => at.replace(/:\d+:\d+$/, ''))
    }

    test(
      'cuts a deeper trace, keeping the importer',
      async () => {
        // (which steps a cut keeps, besides the importer, is not specified)
        const trace = await traceOf({ maxTraceDepth: 1 })
        expect(trace.length).toBeGreaterThan(0)
        expect(trace.length).toBeLessThanOrEqual(1 + 1)
        expect(trace.at(-1)).toBe('src/b.ts')
      },
      timeout,
    )

    test(
      'keeps a trace that is not deeper complete',
      async () => {
        expect((await traceOf({ maxTraceDepth: 3 })).slice(-3)).toEqual([
          'src/entry.ts',
          'src/a.ts',
          'src/b.ts',
        ])
      },
      timeout,
    )
  })
})

/** What `onViolation` gets (guide/import-protection.md). */
interface Violation {
  envType: 'client' | 'server'
  type: 'specifier' | 'file' | 'marker'
  specifier: string
  importer: string
  resolved?: string
  pattern?: string | RegExp
}
