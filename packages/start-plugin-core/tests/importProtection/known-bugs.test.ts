/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { findOriginalUnsafeUsagePos } from '../../src/import-protection/analysis'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'

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
