/** Public rule configuration, exercised by real Start builds (J6.1/J6.8). */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  locatedImporters,
  rejection,
  startProtectedDevServer,
  violationReports,
} from '../../importProtection/start-apps'
import { probeMockPrelude, safeMock } from '../../importProtection/mock-helpers'
import { inEnvironment } from '../../importProtection/violation-report'
import { failureOf } from './channels'
import { runViteClient, startBrowserProtectedDevServer } from './client-pages'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000
const packageFiles = (name: string) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: './index.js',
  }),
  [`node_modules/${name}/index.js`]: `export default () => 'REAL_${name}'\n`,
})

const rules: Array<{
  name: string
  specifiers: NonNullable<
    NonNullable<ImportProtectionOptions>['client']
  >['specifiers']
}> = [
  { name: 'an extglob', specifiers: ['@(private-sdk|internal-sdk)'] },
  { name: 'an exact literal', specifiers: ['private-sdk'] },
  {
    name: 'case-sensitive then case-insensitive expressions',
    specifiers: [/^PRIVATE-SDK$/, /^PRIVATE-SDK$/i],
  },
  {
    name: 'case-insensitive then case-sensitive expressions',
    specifiers: [/^PRIVATE-SDK$/i, /^PRIVATE-SDK$/],
  },
]

describe.each(startBundlers)('%s public import rules', (bundler) => {
  test.each(rules)(
    '$name denies the exact client package import',
    async ({ specifiers }) => {
      const files = {
        ...packageFiles('private-sdk'),
        'src/entry.ts': `import read from 'private-sdk'\nexport const live = read()\n`,
      }
      const error = await rejection(
        buildStart({
          bundler,
          entry: 'src/entry.ts',
          files,
          start: { importProtection: { client: { specifiers } } },
        }),
      )
      expect(violationReports(error)).toEqual([
        expect.objectContaining({
          environment: 'client',
          specifier: 'private-sdk',
        }),
      ])
      expect(locatedImporters(error, files)).toEqual(['client src/entry.ts'])
    },
    timeout,
  )

  test.each(['private-sdk-ui', 'private-sdk2'])(
    'a literal permits the near-prefix package %s',
    async (name) => {
      const build = await buildStart({
        bundler,
        entry: 'src/entry.ts',
        files: {
          ...packageFiles(name),
          'src/entry.ts': `import read from '${name}'\nexport const value = read()\n`,
        },
        start: {
          importProtection: { client: { specifiers: ['private-sdk'] } },
        },
      })
      const { client } = build
      expect(violationReports(inEnvironment(build, 'client'))).toEqual([])
      expect((await client.run('return entry.value')).result).toBe(
        `REAL_${name}`,
      )
    },
    timeout,
  )

  test.skipIf(process.platform !== 'linux')(
    'Src is outside the case-sensitive srcDirectory',
    async () => {
      const build = await buildStart({
        bundler,
        entry: 'src/entry.ts',
        files: {
          ...packageFiles('private-sdk'),
          'Src/utility.ts': `import read from 'private-sdk'\nexport const value = read()\n`,
          'src/entry.ts': `export { value } from '../Src/utility'\n`,
        },
        start: {
          srcDirectory: 'src',
          importProtection: { client: { specifiers: ['private-sdk'] } },
        },
      })
      const { client } = build
      expect(violationReports(inEnvironment(build, 'client'))).toEqual([])
      expect((await client.run('return entry.value')).result).toBe(
        'REAL_private-sdk',
      )
    },
    timeout,
  )

  test(
    'inherited member names of a mocked import remain safe to consume',
    async () => {
      const build = await buildStart({
        bundler,
        entry: 'src/entry.ts',
        files: {
          'src/private.server.ts': `export default () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import mock from './private.server'\nexport { mock }\n`,
        },
        start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
      })
      const { client } = build
      expect(violationReports(inEnvironment(build, 'client'))).toHaveLength(1)
      expect(client.where('MARK_SECRET')).toBe('nowhere')
      expect(
        (
          await client.run(`${probeMockPrelude}
const mock = entry.mock
mock.constructor.member()
mock.__proto__.member()
return [probeMock(mock.constructor), probeMock(mock.__proto__)]`)
        ).result,
      ).toEqual([safeMock, safeMock])
    },
    timeout,
  )
})

// A bare side-effect import is reachable user code in dev too (no build
// tree-shaking can remove it before the adapter sees the edge).
test(
  'an extglob denies a bare client import of private-sdk',
  async () => {
    const files = {
      ...packageFiles('private-sdk'),
      'src/entry.ts': `import 'private-sdk'\nexport const live = 1\n`,
    }
    const server = await startProtectedDevServer(files, {
      behavior: 'error',
      client: { specifiers: ['@(private-sdk|internal-sdk)'] },
    })
    const { reported } = await failureOf(server, () =>
      server.load('/src/entry.ts'),
    )
    expect(violationReports(reported)).toEqual([
      expect.objectContaining({
        environment: 'client',
        specifier: 'private-sdk',
      }),
    ])
    // (at the bare import, line 1)
    expect(locatedImporters(reported, files)).toEqual(['client src/entry.ts'])
  },
  timeout,
)

// J6.11: stateful RegExp flags must not make repeated public edges alternate
// between permitted and denied (V4 red-astra/17).
test.each([/^private-sdk$/g, /^private-sdk$/y])(
  'a stateful %s rule denies every client importer',
  async (pattern) => {
    const files = {
      ...packageFiles('private-sdk'),
      ...Object.fromEntries(
        ['a', 'b', 'c'].map((name) => [
          `src/${name}.ts`,
          `import read from 'private-sdk'\nexport const ${name} = () => read()\n`,
        ]),
      ),
      'src/entry.ts': `import { a } from './a'\nimport { b } from './b'\nimport { c } from './c'\nexport const readAll = () => [a(), b(), c()]\n`,
    }
    const server = await startBrowserProtectedDevServer(files, {
      client: { specifiers: [pattern] },
      mockAccess: 'off',
    })
    const { result } = await runViteClient(
      server,
      '/src/entry.ts',
      `${probeMockPrelude}
return entry.readAll().map((value) => probeMock(value, 'REAL_private-sdk'))`,
    )
    expect(result).toEqual([safeMock, safeMock, safeMock])
    expect(locatedImporters(server.logs, files).sort()).toEqual([
      'client src/a.ts',
      'client src/b.ts',
      'client src/c.ts',
    ])
  },
  timeout,
)
