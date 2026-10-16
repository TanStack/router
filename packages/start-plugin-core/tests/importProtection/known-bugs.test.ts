/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import {
  findOriginalUnsafeUsagePos,
  getMockExportNamesBySource,
  getNamedExports,
} from '../../src/import-protection/analysis'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import {
  generateSelfContainedMockModule,
  loadResolvedVirtualModule,
  makeMockEdgeModuleId,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
import { buildStart } from '../build-harness'
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
  expect(Object.keys(exports)).toContain('ns')
  expect(exports.ns).toBeDefined()
})

// Bug: rewriting a denied import to the mock drops the comments that lead
// the import, such as a file's JSX pragma or legal comment.
// Impact: in dev, a JSX plugin that runs after the rewrite (e.g.
// @vitejs/plugin-vue-jsx listed after the Start plugin, which reads `@jsx`
// from any comment) compiles the module with the default JSX runtime, and the
// module loses its license comment.
test.fails.each([
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
])(
  '$name that leads a denied import stays in effect',
  async ({ comment, runtime }) => {
    const rewritten = rewriteDeniedImports(
      `${comment}
import { secret } from 'denied'
export const Page = () => <div>{secret}</div>`,
      '/test/module.tsx',
      new Set(['denied']),
      () => mockModule,
    )
    const { code } = await transformWithOxc(rewritten!.code, 'module.tsx', {
      jsx: { runtime: 'automatic', importSource: 'react' },
    })
    expect([
      rewritten!.code.includes(comment),
      code.match(/from ["']([^"']+\/jsx-runtime)["']/)?.[1],
    ]).toEqual([true, runtime])
  },
)

// Bug: compiler-safe boundaries are recognized by the bare factory name
// (`createServerFn().handler`, `createServerOnlyFn`), so the same calls through
// a namespace import (`Start.createServerFn().handler`) are not safe.
// Impact: import-protection diagnostics point at a usage inside a server fn
// handler, which the compiler removes from the client, instead of the real
// cause.
test.fails.each([
  `Start.createServerFn().handler(() => denied())`,
  `Start.createServerOnlyFn(() => denied())`,
])('client: %s is a safe boundary', (expression) => {
  const code = `import * as Start from '@tanstack/react-start'
import { denied } from 'denied'
export const result = ${expression}`
  expect(findOriginalUnsafeUsagePos(code, 'denied', 'client')).toBeUndefined()
})

// Bug: mock modules declare each mocked name as `export const <name>`, and
// reserved words such as `delete` pass the identifier check.
// Impact: the mock of a denied module that exports a reserved word
// (`export { remove as delete }`) or is used through one (`api.delete()`) is a
// SyntaxError, which fails the build instead of mocking the module.
// Fix: check names with `isValidIdentifier(name) &&
// !isStrictBindOnlyReservedWord(name)` from `yuku-ast`, since
// `isValidIdentifier` alone accepts `eval` and `arguments`.
test.fails.each([
  {
    name: 'a denied file exporting `delete`',
    mock: () =>
      generateSelfContainedMockModule(
        getNamedExports(
          `const remove = () => {}
export { remove as delete }`,
          '/test/api.server.ts',
        ),
      ).code,
  },
  {
    name: 'a denied import used as `api.delete()`',
    mock: () => {
      const names = getMockExportNamesBySource(
        `import * as api from 'denied'
export const result = api.delete()`,
        '/test/module.ts',
      ).get('denied')
      const id = resolveInternalVirtualModuleId(
        makeMockEdgeModuleId(names ?? [], mockModule),
      )
      return loadResolvedVirtualModule(id!)!.code
    },
  },
])('the mock of $name exports `delete`', async ({ mock }) => {
  const mockUrl = `data:text/javascript,${encodeURIComponent(mock())}`
  // Read the mock through a namespace import: the test runner would unwrap
  // its default export, which claims `__esModule` and is thenable.
  const reader = `import * as mock from ${JSON.stringify(mockUrl)}
export const exported = 'delete' in mock
export const mocked = mock.delete === mock.default.delete`
  const { exported, mocked } = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(reader)}`
  )
  expect({ exported, mocked }).toEqual({ exported: true, mocked: true })
})

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
    const { client } = await buildStart({
      files: {
        'corpus.ts': corpusModule,
        'layout.ts': `import { createServerFn } from '@tanstack/react-start'
import { corpus } from './corpus'
export const size = () => corpus()
export const nav = createServerFn().handler(async () => 1)
`,
        'entry.ts': `export { nav } from './layout'\n`,
      },
      plugins: [denyToClient(['**/corpus.ts'])],
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  },
  60_000,
)
