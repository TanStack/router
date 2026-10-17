import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { compileMatchers } from '../../src/import-protection/matchers'
import { getRsbuildResolvedImportProtectionCheck } from '../../src/rsbuild/import-protection'
import { buildStart } from '../build-harness'
import {
  distinct,
  rejection,
  reportedViolations,
} from '../importProtection/start-apps'
import { runRsbuildClient, startRsbuildDevServer } from '../rsbuild-dev-server'
import type { ViolationInfo } from '../../src/import-protection/trace'
import type { ImportProtectionOptions } from '../../src/schema'

describe('getRsbuildResolvedImportProtectionCheck', () => {
  test('skips file and marker checks for excluded resolved files', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    expect(
      getRsbuildResolvedImportProtectionCheck(
        'node_modules/pkg/marked-server-only.ts',
        matchers,
      ),
    ).toBeUndefined()
  })

  test('classifies non-excluded denied files as file checks', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    const result = getRsbuildResolvedImportProtectionCheck(
      'src/secret.server.ts',
      matchers,
    )

    expect(result?.type).toBe('file')
    if (result?.type !== 'file') {
      throw new Error('Expected file import-protection check')
    }
    expect(result.fileMatch.pattern).toBe('**/*.server.*')
  })

  test('classifies non-excluded non-denied files as marker candidates', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    expect(
      getRsbuildResolvedImportProtectionCheck(
        'src/marked-server-only.ts',
        matchers,
      ),
    ).toEqual({ type: 'marker' })
  })
})

describe('Rsbuild dev: a client module importing a .server file', () => {
  const esm = `import { secret } from './secret.server.js'
export const page = () => secret
`
  const commonJs = `const { secret } = require('./secret.server.js')
exports.page = () => secret
`

  test.each([
    { extension: 'ts', page: esm },
    { extension: 'js', page: esm },
    { extension: 'jsx', page: esm },
    { extension: 'mjs', page: esm },
    { extension: 'cjs', page: commonJs },
    { extension: 'mts', page: esm },
    { extension: 'cts', page: commonJs },
  ])(
    'is reported and mocked when it is a .$extension file',
    async ({ extension, page }) => {
      const violations: Array<ViolationInfo> = []
      const server = await startRsbuildDevServer({
        importProtection: {
          onViolation: (info) => {
            violations.push(info as ViolationInfo)
          },
        },
        files: {
          'src/secret.server.js': `export const secret = 'MARK_SERVER_SECRET'\n`,
          [`src/page.${extension}`]: page,
          'src/entry.ts': `import { page } from './page.${extension}'
console.log(page())
`,
        },
      })

      expect(server.errors).toEqual([])
      expect(
        violations.map((info) => ({
          type: info.type,
          importer: path.relative(server.root, info.importer),
          specifier: info.specifier,
        })),
      ).toEqual([
        {
          type: 'file',
          importer: `src/page.${extension}`,
          specifier: './secret.server.js',
        },
      ])
      expect(Object.values(await server.outputs()).join('\n')).not.toContain(
        'MARK_SERVER_SECRET',
      )
    },
    30_000,
  )
})

// Source: round 4 mutation testing (rsbuild host, `behavior` in dev).
describe('Rsbuild dev: behavior', () => {
  test.each<{
    behavior: ImportProtectionOptions['behavior']
    reportedAs: 'warnings' | 'errors'
    infoBehavior: ViolationInfo['behavior']
  }>([
    { behavior: undefined, reportedAs: 'warnings', infoBehavior: 'mock' },
    {
      behavior: { build: 'mock' },
      reportedAs: 'warnings',
      infoBehavior: 'mock',
    },
    { behavior: { dev: 'error' }, reportedAs: 'errors', infoBehavior: 'error' },
  ])(
    '$behavior: a violation is reported in the compile $reportedAs',
    async ({ behavior, reportedAs, infoBehavior }) => {
      const seen: Array<ViolationInfo> = []
      const server = await startRsbuildDevServer({
        importProtection: {
          behavior,
          onViolation: (info) => {
            seen.push(info as ViolationInfo)
          },
        },
        files: {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import { secret } from './secret.server'
console.log(secret())
`,
        },
      })
      const other = reportedAs === 'errors' ? 'warnings' : 'errors'
      expect(
        reportedViolations(server[reportedAs]).map(
          ({ environment, importer }) => `${environment} ${importer}`,
        ),
      ).toEqual(['client src/entry.ts:2:13'])
      expect(reportedViolations(server[other])).toEqual([])
      expect(seen.map((info) => info.behavior)).toEqual([infoBehavior])
    },
    30_000,
  )
})

describe('Rsbuild dev: reports across rebuilds', () => {
  /** An entry using the denied file `src/secret.server.ts` and `src/other.ts`. */
  const app = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/other.ts': `export const other = 1\n`,
    'src/entry.ts': `import { secret } from './secret.server'
import { other } from './other'
console.log(secret(), other)
`,
  }

  // Source: mutation run R3 ip-rsbuild R3; a control of the harness running
  // an Rsbuild dev rebuild with import protection on (the warnings of each
  // compile).
  test.each([
    { log: 'once' as const, afterRebuild: [] },
    { log: 'always' as const, afterRebuild: ['client src/entry.ts:3:13'] },
  ])(
    "log '$log': a rebuild for an unrelated edit reports $afterRebuild",
    async ({ log, afterRebuild }) => {
      const server = await startRsbuildDevServer({
        importProtection: { log },
        files: app,
      })
      const reported = () =>
        reportedViolations(server.warnings).map(
          ({ environment, importer }) => `${environment} ${importer}`,
        )
      expect(reported()).toEqual(['client src/entry.ts:3:13'])
      await server.edit({ 'src/other.ts': `export const other = 2\n` })
      expect(server.rebuilt).toContain('src/other.ts')
      expect(reported()).toEqual(afterRebuild)
    },
    30_000,
  )

  // Source: round 4 mutation testing (rsbuild host, entries without a
  // module).
  test.each([
    { module: 'the entry module', file: 'src/entry.ts' },
    { module: 'an imported module', file: 'src/other.ts' },
  ])(
    'a compile in which $module is missing reports only that',
    async ({ file }) => {
      const server = await startRsbuildDevServer({
        importProtection: {},
        files: app,
      })
      await server.edit({ [file]: null })
      expect(server.errors).toEqual([
        expect.stringMatching(
          new RegExp(`Module not found.*${path.basename(file, '.ts')}`),
        ),
      ])
    },
    30_000,
  )

  // Source: mutation run R3 ip-rsbuild R4 (the resolve cache of a previous
  // compile).
  test('a denied specifier that an edit makes resolve elsewhere is reported with its new target', async () => {
    const resolved: Array<string | undefined> = []
    const server = await startRsbuildDevServer({
      importProtection: {
        client: { specifiers: [/^\.\/lib$/] },
        onViolation: (info) => {
          // relative to the app root (src/...)
          resolved.push(
            (info as ViolationInfo).resolved?.replace(/^.*\/(?=src\/)/, ''),
          )
        },
      },
      files: {
        'src/lib.ts': `export const lib = 1\n`,
        'src/entry.ts': `import { lib } from './lib'\nconsole.log(lib)\n`,
      },
    })
    expect(resolved).toEqual(['src/lib.ts'])
    await server.edit({
      'src/lib.ts': null,
      'src/lib/index.ts': `export const lib = 2\n`,
      'src/entry.ts': `import { lib } from './lib'\nconsole.log(lib, 2)\n`,
    })
    expect(resolved).toEqual(['src/lib.ts', 'src/lib/index.ts'])
  }, 30_000)
})

// Rsbuild's `source.transformImport` rewrites a library's named imports
// into imports of its submodules (`import { button } from 'ui-lib'` ->
// `import { button } from 'ui-lib/button'`) before import protection sees
// the module.
// Source: round 4 mutation testing (rsbuild host, the location of a
// rewritten import).
describe('Rsbuild build: an import source.transformImport rewrites', () => {
  /** Builds an entry using `button` of `ui-lib`, denying `specifiers`. */
  const build = (specifiers: Array<string | RegExp>) =>
    buildStart({
      bundler: 'rsbuild',
      files: {
        'node_modules/ui-lib/package.json': JSON.stringify({
          name: 'ui-lib',
          type: 'module',
          exports: { '.': './index.js', './*': './*.js' },
        }),
        'node_modules/ui-lib/index.js': `export { button } from './button.js'\n`,
        'node_modules/ui-lib/button.js': `export const button = () => 'MARK_SECRET'\n`,
        'src/entry.ts': `import { button } from 'ui-lib'
export const read = () => button()
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { client: { specifiers } } },
      rsbuildConfig: {
        source: {
          transformImport: [
            {
              libraryName: 'ui-lib',
              customName: 'ui-lib/{{ member }}',
              transformToDefaultImport: false,
            },
          ],
        },
      },
    })
  let rewrittenDenied: Promise<Error> | undefined
  /** The build error when the rewritten specifier is denied, built once. */
  const rewrittenDeniedError = () =>
    (rewrittenDenied ??= rejection(build([/^ui-lib\//])))

  test('denied as rewritten, it is reported on the line of its use', async () => {
    expect(reportedViolations((await rewrittenDeniedError()).message)).toEqual([
      {
        environment: 'client',
        importer: expect.stringMatching(/^src\/entry\.ts:2:\d+$/),
      },
    ])
  }, 60_000)

  // Bug: the report points at `read` (src/entry.ts:2:16), not at the use of
  // the import (`button()`, 2:27), which is what other violations point at.
  // The location is only found in the rewritten code (through the mock
  // module's path), whose positions do not map back to the use (a build
  // without source maps).
  // Source: rsbuild/import-protection.ts resolveImporterLocation
  // (transformedSources lookup).
  // Impact: low; the code frame's caret points at the wrong column.
  test.fails(
    'denied as rewritten, it is reported at its use',
    async () => {
      expect(
        reportedViolations((await rewrittenDeniedError()).message),
      ).toEqual([{ environment: 'client', importer: 'src/entry.ts:2:27' }])
    },
    60_000,
  )

  // Bug: a specifier denied as the user wrote it is not denied once
  // `source.transformImport` rewrote it: the loader matches the specifiers
  // of the code SWC already transformed (`ui-lib/button`), so `'ui-lib'`
  // never matches, and the build ships the library to the client without
  // any error or warning.
  // Source: rsbuild/import-protection-loader.ts transformImportProtection
  // (`matchesAny(source, matchers.specifiers)` on the post-SWC imports).
  // Impact: a client.specifiers rule on a library the app also lists in
  // source.transformImport is silently bypassed.
  test.fails(
    'denied as written, the build fails on it',
    async () => {
      expect(
        reportedViolations((await rejection(build(['ui-lib']))).message),
      ).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/entry\.ts/),
        },
      ])
    },
    60_000,
  )
})

// `rsbuild build --watch`: each build reports the violations it bundles,
// whatever an earlier build reported.
// Source: round 4 mutation testing (rsbuild host, the state of a previous
// build).
test('Rsbuild build --watch: a rebuild for an unrelated edit fails on the violation again', async () => {
  const error = await rejection(
    buildStart({
      bundler: 'rsbuild',
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/other.ts': `export const other = 1\n`,
        'src/entry.ts': `import { secret } from './secret.server'
import { other } from './other'
export const read = () => secret() + other
`,
      },
      entry: 'src/entry.ts',
      watchEdits: { 'src/other.ts': `export const other = 2\n` },
    }),
  )
  // Rspack may compile the client more than once for the edit.
  expect(
    distinct(
      reportedViolations(error.message).map(
        ({ environment, importer }) => `${environment} ${importer}`,
      ),
    ),
  ).toEqual(['client src/entry.ts:3:27'])
}, 60_000)

// Source: mutation run R3 ip-rsbuild R7 and ip-misc P10.
test('Rsbuild dev: the client mock of each denied import reports its own use in the browser console', async () => {
  const server = await startRsbuildDevServer({
    importProtection: { client: { specifiers: ['db-lib'] } },
    files: {
      'node_modules/db-lib/package.json': JSON.stringify({
        name: 'db-lib',
        type: 'module',
        exports: { '.': './index.js' },
      }),
      'node_modules/db-lib/index.js': `export const query = () => 'MARK_LIB'\n`,
      'src/a.server.ts': `export const a = () => 'MARK_A'\n`,
      'src/b.server.ts': `export const b = () => 'MARK_B'\n`,
      'src/entry.ts': `import { a } from './a.server'
import { b } from './b.server'
import { query } from 'db-lib'
console.log(a(), b(), query())
`,
    },
  })
  expect(server.errors).toEqual([])
  const messages = await runRsbuildClient(server)
  expect(messages.filter((message) => message.includes('MARK_'))).toEqual([])
  expect(
    [
      ...new Set(
        messages
          .filter((message) =>
            message.includes('Mocked import used in dev client'),
          )
          .map((message) => /Denied import: "([^"]+)"/.exec(message)?.[1]),
      ),
    ].sort(),
  ).toEqual(['db-lib', 'src/a.server.ts', 'src/b.server.ts'])
}, 30_000)

// Source: round 4 mutation testing (rsbuild host, `mockAccess`).
describe('Rsbuild dev: mockAccess', () => {
  test.each<{
    mockAccess: ImportProtectionOptions['mockAccess']
    reports: Array<string>
  }>([
    { mockAccess: undefined, reports: ['error'] },
    { mockAccess: 'error', reports: ['error'] },
    { mockAccess: 'warn', reports: ['warn'] },
    { mockAccess: 'off', reports: [] },
  ])(
    '$mockAccess: the use of a mocked import is reported with console $reports',
    async ({ mockAccess, reports }) => {
      const server = await startRsbuildDevServer({
        importProtection: {
          mockAccess,
          client: { specifiers: ['db-lib'] },
        },
        files: {
          'node_modules/db-lib/package.json': JSON.stringify({
            name: 'db-lib',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/db-lib/index.js': `export const query = () => 'MARK_LIB'\n`,
          'src/a.server.ts': `export const a = () => 'MARK_A'\n`,
          'src/entry.ts': `import { a } from './a.server'
import { query } from 'db-lib'
console.log(a(), query())
`,
        },
      })
      expect(server.errors).toEqual([])
      const messages = await runRsbuildClient(server, { levels: true })
      expect(messages.filter((message) => message.includes('MARK_'))).toEqual(
        [],
      )
      // Each denied import (the file and the specifier), by console method.
      expect(
        [
          ...new Set(
            messages
              .filter((message) =>
                message.includes('Mocked import used in dev client'),
              )
              .map(
                (message) =>
                  `${message.slice(0, message.indexOf(':'))} ${/Denied import: "([^"]+)"/.exec(message)?.[1]}`,
              ),
          ),
        ].sort(),
      ).toEqual(
        reports.flatMap((level) => [
          `${level} db-lib`,
          `${level} src/a.server.ts`,
        ]),
      )
    },
    30_000,
  )
})
