import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { compileMatchers } from '../../src/import-protection/matchers'
import { getRsbuildResolvedImportProtectionCheck } from '../../src/rsbuild/import-protection'
import { startRsbuildDevServer } from '../rsbuild-dev-server'
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
