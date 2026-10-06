/**
 * Known import-protection bugs, pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * rewrite does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
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

// Bug: rewriting a denied `export * as ns from 'denied'` drops the `ns`
// export (main imports the mock without re-exporting it; the Yuku PR removes
// the statement). Impact: importers of `ns` get `undefined` (or a missing
// export error) instead of the mock, unlike every other denied import form.
// Remove `.fails` once fixed.
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
