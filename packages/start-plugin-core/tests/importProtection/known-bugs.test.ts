/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import { buildStart, startBundlers } from '../build-harness'
import { evaluateWithMock, isMock, selfMock } from './mock-helpers'

const mockModule = `data:text/javascript,${encodeURIComponent(
  `export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? 'mock:' + key : undefined })`,
)}`

async function evaluateRewritten(code: string, denied: Array<string>) {
  const rewritten = rewriteDeniedImports(
    code,
    '/test/module.ts',
    new Set(denied),
    () => mockModule,
  )
  expect(rewritten).toBeDefined()
  const { code: javascript } = await transformWithOxc(
    rewritten!.code,
    'module.ts',
  )
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(javascript)}`
  )) as Record<string, unknown>
}

// Control for the namespace re-export pin below (same harness).
test('a denied named import evaluates to the mock', async () => {
  const exports = await evaluateRewritten(
    `import { secret } from 'denied'
export const seen = secret`,
    ['denied'],
  )
  expect({ ...exports }).toEqual({ seen: 'mock:secret' })
})

// Bug: rewriting a denied `export * as ns from 'denied'` drops the `ns`
// export.
// Impact: importers of `ns` get `undefined` (or a missing export error)
// instead of the mock, unlike every other denied import form.
test.fails('a denied namespace re-export keeps its exported name', async () => {
  const exports = await evaluateRewritten(
    `export * as ns from 'denied'
export const keep = 1`,
    ['denied'],
  )
  expect(exports.keep).toBe(1)
  expect((exports.ns as Record<string, unknown> | undefined)?.secret).toBe(
    'mock:secret',
  )
})

/**
 * Rewrites the denied import of a module with JSX that `prologue` (comments,
 * directives) leads, and compiles its JSX with React's automatic runtime
 * unless a pragma says otherwise. Returns whether the rewritten module keeps
 * `comment`, and the JSX runtime the compiled module imports.
 */
async function rewriteWithPrologue(prologue: string, comment: string) {
  const rewritten = rewriteDeniedImports(
    `${prologue}
import { secret } from 'denied'
export const Page = () => <div>{secret}</div>`,
    '/test/module.tsx',
    new Set(['denied']),
    () => mockModule,
  )
  const { code } = await transformWithOxc(rewritten!.code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return [
    rewritten!.code.includes(comment),
    code.match(/from ["']([^"']+\/jsx-runtime)["']/)?.[1],
  ]
}

const leadingComments = [
  {
    name: 'a JSX pragma',
    comment: '/** @jsxImportSource preact */',
    runtime: 'preact/jsx-runtime',
  },
  {
    name: 'a legal comment',
    comment: '/*! @license MIT */',
    runtime: 'react/jsx-runtime',
  },
]

// Control for the pin below (same harness): after a directive, the comment
// stays in effect. Guards a regression of the Yuku migration (PR #8504,
// rewrite.test.ts "keeps a JSX pragma that follows a directive in effect").
test.each(leadingComments)(
  '$name that follows a directive before a denied import stays in effect',
  async ({ comment, runtime }) => {
    expect(
      await rewriteWithPrologue(`'use client'\n${comment}`, comment),
    ).toEqual([true, runtime])
  },
)

// Bug: rewriting a denied import to the mock drops the comments that lead
// the import, such as a file's JSX pragma or legal comment.
// Impact: in dev, a JSX plugin that runs after the rewrite (e.g.
// @vitejs/plugin-vue-jsx listed after the Start plugin, which reads `@jsx`
// from any comment) compiles the module with the default JSX runtime, and the
// module loses its license comment.
test.fails.each(leadingComments)(
  '$name that leads a denied import stays in effect',
  async ({ comment, runtime }) => {
    expect(await rewriteWithPrologue(comment, comment)).toEqual([true, runtime])
  },
)

// Bug: mock modules declare each mocked name as `export const <name>`, and
// reserved words such as `delete` pass the identifier check.
// Impact: the mock of a denied module that exports a reserved word
// (`export { remove as delete }`) or is used through one (`api.delete()`) is a
// SyntaxError, which fails the build instead of mocking the module.
test.fails(
  'the mock of a denied file exporting `delete` exports it',
  async () => {
    const mock = await selfMock(
      `const remove = () => {}
export { remove as delete }`,
      '/test/api.server.ts',
    )
    expect('delete' in mock && mock.delete !== undefined).toBe(true)
  },
)

test.fails(
  'a denied import used as `api.delete()` evaluates to a mock',
  async () => {
    const module = await evaluateWithMock(
      `import * as api from 'denied'
export const result = api.delete()`,
      'denied',
    )
    expect(isMock(module.result)).toBe(true)
  },
)

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
const corpusModule = `export const corpus = () => 'MARK_CORPUS' + Math.random()\n`

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
    await expect(
      buildStart({
        bundler,
        files: {
          'src/corpus.ts': corpusModule,
          'src/entry.ts': `import { corpus } from './corpus'\nexport const read = () => corpus()\n`,
        },
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      }),
    ).rejects.toThrow(/Import denied in client environment/)
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
  // Source: issue #8101 (closed without a reproduction); gap IP6b
  // (gaps/start-env.md).
  test.fails(
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
  // Source: weak check virtualModules.test.ts "returns mock code" (asserted
  // the purity annotations as text), oracle-gaps REPORT.md "Weak checks".
  test.fails(
    'in mock mode, an unused denied module leaves no mock in the client bundle and no warning',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: droppedCorpusFiles,
        entry: 'src/entry.ts',
        start: mockToClient(['**/corpus.ts']),
      })
      expect({
        mock: client.where('[import-protection mock]'),
        warnings: client.warnings.filter((warning) =>
          warning.includes('[import-protection]'),
        ),
      }).toEqual({ mock: 'nowhere', warnings: [] })
    },
    60_000,
  )
})
