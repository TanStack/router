import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { compileMatchers } from '../../src/import-protection/matchers'
import { getRsbuildResolvedImportProtectionCheck } from '../../src/rsbuild/import-protection'
import { reportedViolations } from '../importProtection/start-apps'
import { runRsbuildClient, startRsbuildDevServer } from '../rsbuild-dev-server'
import type { ViolationInfo } from '../../src/import-protection/trace'

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
