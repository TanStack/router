/**
 * Import-protection cases main gets wrong. Each test asserts the correct behaviour for a
 * bug main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md). A mock is told by what it does (`mock-helpers.ts`,
 * `describeValue`: `a safe mock`), and a violation by what `onViolation`
 * receives.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  inEnvironment,
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'

/**
 * Start's import protection options of a build that denies `files` to the
 * client and fails on a violation.
 */
function denyToClient(files: Array<string>) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

/** Same as `denyToClient`, mocking the denied modules instead. */
function mockToClient(files: Array<string>) {
  return { importProtection: { behavior: 'mock', client: { files } } } as const
}

/** A denied module whose code marks the bundle it is in. */
const corpusModule = `function initialize() {
  ;(globalThis as Record<string, unknown>).corpusInitialized = true
  return () => 'MARK_CORPUS' + Math.random()
}
export const corpus = /*#__PURE__*/ initialize()
`

/**
 * A client entry re-exporting a server fn of `layout.ts`, which also
 * exports a function using the denied-to-be `corpus.ts` that nothing calls.
 * Import protection checks the modules of the source directory (`src`).
 */
const droppedCorpusFiles = {
  'src/corpus.ts': corpusModule,
  'src/layout.ts': `import { createServerFn } from '@tanstack/react-start'
import { corpus } from './corpus'
export const size = () => corpus()
export const nav = createServerFn().handler(async () => 1)
`,
  'src/entry.ts': `export { nav } from './layout'\n`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  // On main, a denied module that a client-reachable module imports, but that
  // the client never uses, still fails the build.
  // Source: issue #8101 (closed without a reproduction).
  test('a denied module the client bundle drops does not fail the build', async () => {
    const { client } = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: denyToClient(['**/corpus.ts']),
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  })

  // On main, mock-mode builds ship mock code (a Proxy runtime) for unused
  // imports, and report violations the client never reaches.
  // Source: review (the check "returns mock code" of virtualModules.test.ts
  // asserted the purity annotations as text).
  // Judged by what the user sees: no report on any channel, no code or effect
  // of the module in the bundle; not by comparing the bundle's statements with
  // another build's. The live-denial controls show the same harness sees a used
  // mock: its report, its safe value, and the real value without protection.
  test('in mock mode, an unused denied module leaves nothing in the client bundle and no warning', async () => {
    // (one build at a time: a Vite build runs in its app's directory)
    const mocked = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: mockToClient(['**/corpus.ts']),
    })
    const usedFiles = {
      ...droppedCorpusFiles,
      'src/entry.ts': `export { size } from './layout'\n`,
    }
    const used = await buildStart({
      bundler,
      files: usedFiles,
      entry: 'src/entry.ts',
      start: mockToClient(['**/corpus.ts']),
    })
    const usedDisabled = await buildStart({
      bundler,
      files: usedFiles,
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
    })
    expect(reportedViolations(inEnvironment(used, 'client'))).toHaveLength(1)
    expect(
      (
        await used.client.run(
          `${describeValuePrelude}\nreturn describeValue(entry.size(), 'MARK_CORPUS')`,
        )
      ).result,
    ).toBe('a safe mock')
    expect(
      (await usedDisabled.client.run('return entry.size()')).result,
    ).toContain('MARK_CORPUS')
    // Nothing reported, on any channel
    expect(reportedViolations(mocked)).toEqual([])
    expect(problems(mocked.diagnostics).map(({ text }) => text)).toEqual([])
    expect(mocked.client.where('MARK_CORPUS')).toBe('nowhere')
    expect(
      (await mocked.client.run('return globalThis.corpusInitialized ?? null'))
        .result,
    ).toBe(null)
  })
})

describe.each(startBundlers)('%s build', (bundler) => {
  // On main, the real module ships to the client in a lazy chunk and runs
  // there, without any error or warning.
  // Source: mutation testing.
  test('a client dynamic import of a denied specifier fails the build, reporting one client violation', async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          'node_modules/db-lib/package.json': JSON.stringify({
            name: 'db-lib',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/db-lib/index.js': `export const secret = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `export const read = () => import('db-lib').then((m) => m.secret())\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { client: { specifiers: ['db-lib'] } } },
      }),
    )
    expect(
      reportedViolations(error).map(({ environment }) => environment),
    ).toEqual(['client'])
  })

  /**
   * What the client gets in a mock-mode build of an entry that imports
   * `secret` from the denied `file` (control: the mock-mode rows of
   * build.test.ts, same harness).
   */
  async function mockModeOutcome(
    file: string,
    code: string,
    importStatement: string,
  ) {
    const build = await buildStart({
      bundler,
      files: {
        [`src/${file}`]: code,
        'src/entry.ts': `${importStatement}
export const read = () => secret
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
    })
    const { client } = build
    return {
      warned: reportedViolations(inEnvironment(build, 'client')).length > 0,
      hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
      read: (
        await client.run(`${describeValuePrelude}
return describeValue(entry.read(), 'MARK_SECRET')`)
      ).result,
    }
  }

  // On main, a mock-mode build ships the real content of a denied
  // `*.server.json` (e.g. server configuration or credentials) to the client.
  // Source: mutation testing.
  test('in mock mode, a denied .server.json file is mocked, with a warning', async () => {
    expect(
      await mockModeOutcome(
        'secret.server.json',
        `{ "secret": "MARK_SECRET" }\n`,
        `import data from './secret.server.json'
const secret = data.secret`,
      ),
    ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
  })

  // On main, a mock-mode build of a project with a `*.server.cjs` the client
  // imports fails instead of mocking it.
  // Source: mutation testing.
  test('in mock mode, a denied .server.cjs file is mocked, with a warning', async () => {
    expect(
      await mockModeOutcome(
        'secret.server.cjs',
        `exports.secret = () => 'MARK_SECRET'\n`,
        `import { secret } from './secret.server.cjs'`,
      ),
    ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
  })
})
