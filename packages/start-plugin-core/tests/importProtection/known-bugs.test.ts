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
import {
  generateSelfContainedMockModule,
  loadResolvedVirtualModule,
  makeMockEdgeModuleId,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'

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
