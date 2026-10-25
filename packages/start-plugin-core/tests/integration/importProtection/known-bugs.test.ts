/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed. A mock
 * is told by what it does (`mock-helpers.ts`, `describeValue`: `a safe
 * mock`), and a violation by what `onViolation` receives.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { buildStart, startBundlers } from '../../build-harness'
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
  // Control for the pin below (same harness): a denied module whose code the
  // client bundle contains fails the build.
  test('a denied module the client uses fails the build', async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          'src/corpus.ts': corpusModule,
          'src/entry.ts': `import { corpus } from './corpus'\nexport const read = () => corpus()\n`,
        },
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      }),
    )
    expect(
      reportedViolations(error).map(({ environment }) => environment),
    ).toEqual(['client'])
  }, 60_000)

  // Control for the pin below (same files, no import protection): the client
  // bundle does not contain the module's code.
  test('without import protection, the client bundle drops the unused module', async () => {
    const { client } = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  }, 60_000)

  // Control for the pins below (same harness and files, import protection
  // on): the build succeeds in mock mode, without the module's code.
  test('in mock mode, the client bundle drops the unused module', async () => {
    const { client } = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: mockToClient(['**/corpus.ts']),
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  }, 60_000)

  // Bug: the build check counts a denied module as surviving when the
  // compilation contains it, whether or not the client uses it. Vite: the
  // mock that replaces the module is never tree-shaken, because its exports
  // read members of the mock (`export const corpus = mock.corpus`,
  // import-protection/virtualModules.ts), which the bundler keeps (with
  // side-effect-free exports, a scratch run passes this pin on Vite).
  // Rsbuild: the report step walks every module of the module graph
  // (connections are not filtered by whether they are used,
  // INTERNALS-import-protection.md).
  // Impact: a denied module that a client-reachable module imports, but that
  // the client never uses, still fails the build.
  // Source: issue #8101 (closed without a reproduction).
  ;(bundler === 'rsbuild' ? test : test.fails)(
    'a denied module the client bundle drops does not fail the build',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: droppedCorpusFiles,
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      })
      expect(client.where('MARK_CORPUS')).toBe('nowhere')
    },
    60_000,
  )

  // Bug: same as above, in mock mode: the mock of a denied module the client
  // never uses stays in the client bundle, and the build warns about it.
  // The mock module is marked side-effect free (`@__NO_SIDE_EFFECTS__`,
  // `@__PURE__`), but its exports read members of the mock.
  // Impact: mock-mode builds ship mock code (a Proxy runtime) for unused
  // imports, and report violations the client never reaches.
  // Source: review (the check "returns mock code" of virtualModules.test.ts
  // asserted the purity annotations as text).
  // Judged by what the user sees:
  // no report on any channel, no code or effect of the module in the
  // bundle; not by comparing the bundle's statements with another build's.
  // The live-denial controls show the same harness sees a used mock: its
  // report, its safe value, and the real value without protection.
  ;(bundler === 'rsbuild' ? test : test.fails)(
    'in mock mode, an unused denied module leaves nothing in the client bundle and no warning',
    async () => {
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
    },
    60_000,
  )
})

describe.each(startBundlers)('%s build', (bundler) => {
  // Bug (Rsbuild): a dynamic `import('db-lib')` of a denied specifier is
  // neither reported nor mocked: the Rsbuild loader only rewrites static
  // imports and re-exports (`rewriteDeniedImports`,
  // import-protection/rewrite.ts), and the build reports specifier
  // violations only through the mock modules of rewritten imports
  // (`processAssets` in rsbuild/import-protection.ts). Vite fails the build.
  // Impact: the real module ships to the client in a lazy chunk and runs
  // there, without any error or warning.
  // Source: mutation testing.
  test(
    'a client dynamic import of a denied specifier fails the build, reporting one client violation',
    async () => {
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
    },
    60_000,
  )

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

  // Bug: in mock mode, a denied file that is not JavaScript or TypeScript
  // keeps its content: Vite replaces a denied file with its mock in a
  // transform hook whose filter only lets JS/TS modules through
  // (`/\.[cm]?[tj]sx?($|\?)/`, transform-cache plugin of
  // vite/import-protection-plugin/plugin.ts), and the Rsbuild loader rule
  // only applies to JS/TS modules (`test: /\.[cm]?[tj]sx?$/`,
  // rsbuild/import-protection.ts). Both warn.
  // Impact: a mock-mode build ships the real content of a denied
  // `*.server.json` (e.g. server configuration or credentials) to the client.
  // Source: mutation testing.
  ;(bundler === 'rsbuild' ? test : test.fails)(
    'in mock mode, a denied .server.json file is mocked, with a warning',
    async () => {
      expect(
        await mockModeOutcome(
          'secret.server.json',
          `{ "secret": "MARK_SECRET" }\n`,
          `import data from './secret.server.json'
const secret = data.secret`,
        ),
      ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
    },
    60_000,
  )

  // Bug: in mock mode, a denied CommonJS file (`.server.cjs`) fails the
  // build: the mock that replaces the file is an ES module, which Vite's
  // parser rejects in a `.cjs` file (`export default mock`), and whose named
  // exports are the ES exports of the denied file, which a CommonJS file has
  // none of, so Rspack cannot link the named import (`export 'secret' ...
  // was not found`). With import protection off, both build the named
  // import of the real module.
  // Impact: a mock-mode build of a project with a `*.server.cjs` the client
  // imports fails instead of mocking it.
  // Source: mutation testing.
  ;(bundler === 'rsbuild' ? test : test.fails)(
    'in mock mode, a denied .server.cjs file is mocked, with a warning',
    async () => {
      expect(
        await mockModeOutcome(
          'secret.server.cjs',
          `exports.secret = () => 'MARK_SECRET'\n`,
          `import { secret } from './secret.server.cjs'`,
        ),
      ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
    },
    60_000,
  )
})
