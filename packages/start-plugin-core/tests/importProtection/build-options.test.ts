/**
 * Start's `importProtection` options, by their effect on a real Start build
 * (Vite and Rsbuild), as guide/import-protection.md documents them. Without
 * options, a build fails on a violation (build.test.ts).
 * Source: oracle-gaps parts/options.md, importProtection rows (options that
 * were parsed but never exercised for effect).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import { rejection, reportedViolations } from './start-apps'
import type { ImportProtectionOptions } from '../../src/schema'

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

    // What the excluded or ignored importer then gets for the denied file is
    // not documented, so these rows only check that nothing is reported.
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
  })
})
