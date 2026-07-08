import { describe, expect, test } from 'vitest'
import { shouldWalkForServerFns } from '../src/vite/start-compiler-plugin/server-fn-graph-crawl'

// `shouldWalkForServerFns` bounds the server-function discovery walk to the
// application's own source. These cases pin the boundary behavior that the e2e
// tests cannot observe (they pass regardless of which discovery phase resolves
// a function).
describe('shouldWalkForServerFns', () => {
  const root = '/repo/e2e/react-start/server-functions'

  test('walks transformable files beneath the root', () => {
    expect(shouldWalkForServerFns(`${root}/src/routes/index.tsx`, root)).toBe(
      true,
    )
    expect(shouldWalkForServerFns(`${root}/src/functions/fn.ts`, root)).toBe(
      true,
    )
  })

  test('does not walk a sibling directory that shares a name prefix', () => {
    // Without a path boundary, `startsWith(root)` would wrongly match this
    // sibling — which is exactly the layout of the e2e fixture package
    // (`server-functions` vs `server-functions-shared-lib`).
    expect(
      shouldWalkForServerFns(`${root}-shared-lib/src/index.ts`, root),
    ).toBe(false)
  })

  test('ignores query strings when checking the path', () => {
    expect(
      shouldWalkForServerFns(`${root}/src/fn.ts?tss-serverfn-split`, root),
    ).toBe(true)
  })

  test('does not walk node_modules, virtual modules, or non-transformable files', () => {
    expect(
      shouldWalkForServerFns(`${root}/node_modules/pkg/index.js`, root),
    ).toBe(false)
    expect(
      shouldWalkForServerFns(
        '\0virtual:tanstack-start-server-fn-resolver',
        root,
      ),
    ).toBe(false)
    // A NUL-prefixed virtual id that mirrors a real path under the root would
    // pass the root + extension checks once cleaned, so the guard must inspect
    // the raw id.
    expect(shouldWalkForServerFns(`\0${root}/src/virtual.ts`, root)).toBe(false)
    expect(shouldWalkForServerFns(`${root}/src/app.css`, root)).toBe(false)
  })

  test('does not walk files outside the root', () => {
    expect(shouldWalkForServerFns('/repo/some/other/place/fn.ts', root)).toBe(
      false,
    )
  })
})
