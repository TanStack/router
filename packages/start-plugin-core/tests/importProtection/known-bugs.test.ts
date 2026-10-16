/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import { buildStart } from '../build-harness'
import { evaluateWithMock, isMock, selfMock } from './mock-helpers'
import { locationOf, usageLocation } from './usage-location'
import type { ImportProtectionPluginOptions } from '../../src/vite/import-protection-plugin/types'

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

// Bug: compiler-safe boundaries are recognized by the bare factory name
// (`createServerFn().handler`, `createServerOnlyFn`), so the same calls through
// a namespace import (`Start.createServerFn().handler`) are not safe.
// Impact: import-protection diagnostics point at a usage inside a server fn
// handler, which the compiler removes from the client, instead of the real
// cause.
describe('client: a use through a namespace import of Start', () => {
  const module = (
    expression: string,
  ) => `import * as Start from '@tanstack/react-start'
import { denied } from 'denied'
export const result = ${expression}`

  // Control for the pins below (same harness): a use outside any boundary is
  // reported.
  test('is reported outside a safe boundary', async () => {
    const code = module(`denied()`)
    expect(await usageLocation(code, 'client')).toEqual(
      locationOf(code, 3, 'denied()'),
    )
  })

  test.fails.each([
    `Start.createServerFn().handler(() => denied())`,
    `Start.createServerOnlyFn(() => denied())`,
  ])('is not reported inside %s', async (expression) => {
    expect(await usageLocation(module(expression), 'client')).toBeUndefined()
  })
})

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
 * The import protection plugin of a Start build that denies `files` to the
 * client and fails the build on a violation.
 */
function denyToClient(files: Array<string>) {
  const getConfig = () => ({
    startConfig: { importProtection: { behavior: 'error', client: { files } } },
    resolvedStartConfig: { srcDirectory: '' },
  })
  return importProtectionPlugin({
    getConfig:
      getConfig as unknown as ImportProtectionPluginOptions['getConfig'],
    framework: 'react',
    environments: [
      { name: 'client', type: 'client' },
      { name: 'ssr', type: 'server' },
    ],
    providerEnvName: 'ssr',
  })
}

/** A denied module whose code marks the bundle it is in. */
const corpusModule = `export const corpus = () => 'MARK_CORPUS' + Math.random()\n`

// Control for the pin below (same harness): a denied module whose code the
// client bundle contains fails the build.
test('build: a denied module the client uses fails the build', async () => {
  await expect(
    buildStart({
      files: {
        'corpus.ts': corpusModule,
        'entry.ts': `import { corpus } from './corpus'\nexport const read = () => corpus()\n`,
      },
      plugins: [denyToClient(['**/corpus.ts'])],
    }),
  ).rejects.toThrow(/Import denied in client environment/)
}, 60_000)

/**
 * A client entry re-exporting a server fn of `layout.ts`, which also
 * exports a function using the denied-to-be `corpus.ts` that nothing calls.
 */
const droppedCorpusFiles = {
  'corpus.ts': corpusModule,
  'layout.ts': `import { createServerFn } from '@tanstack/react-start'
import { corpus } from './corpus'
export const size = () => corpus()
export const nav = createServerFn().handler(async () => 1)
`,
  'entry.ts': `export { nav } from './layout'\n`,
}

// Control for the pin below (same files, no import protection): the client
// bundle does not contain the module's code.
test('build: without import protection, the client bundle drops the unused module', async () => {
  const { client } = await buildStart({ files: droppedCorpusFiles })
  expect(client.where('MARK_CORPUS')).toBe('nowhere')
}, 60_000)

// Bug: the build check counts a denied module as surviving when a chunk
// lists it in `modules`, but Rolldown also lists the modules it tree-shook to
// nothing (`renderedLength: 0`).
// Impact: a denied module that a client-reachable module imports, but whose
// code the client bundle does not contain, still fails the build.
// Source: issue #8101 (closed without a reproduction); gap IP6b
// (gaps/start-env.md).
test.fails(
  'build: a denied module the client bundle drops does not fail the build',
  async () => {
    let failure: unknown
    const built = await buildStart({
      files: droppedCorpusFiles,
      plugins: [denyToClient(['**/corpus.ts'])],
    }).catch((error: unknown) => {
      failure = error
      return undefined
    })
    if (
      failure !== undefined &&
      !/Import denied in client environment/.test(String(failure))
    ) {
      // Any other failure is a harness problem, not this bug: pass, so that
      // `.fails` reports it.
      return
    }
    expect(failure).toBeUndefined()
    expect(built!.client.where('MARK_CORPUS')).toBe('nowhere')
  },
  60_000,
)

// A denied pure re-export barrel whose export the client uses survives into
// the client bundle (as the code it re-exports), so it must be reported.
// Source: issue #8102 (closed without a reproduction: Rolldown may elide the
// barrel from `chunk.modules`); gap IP6b (gaps/start-env.md).
test('build: a denied re-export barrel the client uses fails the build', async () => {
  await expect(
    buildStart({
      files: {
        'secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
        'barrel.ts': `export { secret } from './secret'\n`,
        'entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
      },
      plugins: [denyToClient(['**/barrel.ts'])],
    }),
  ).rejects.toThrow(/Import denied in client environment/)
}, 60_000)
