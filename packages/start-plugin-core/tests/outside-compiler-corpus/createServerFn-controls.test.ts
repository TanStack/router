/**
 * Outside the compiler corpus: controls of the missing-handler diagnostic
 * matcher, on synthetic errors (no compiler runs), moved unchanged from
 * createServerFn/createServerFn.test.ts:43, :53 (S4: B-impl, matcher
 * controls). They check the legacy matcher (`causes` word list); the corpus
 * judges the real diagnostics with `explains` in
 * createServerFn/createServerFn.test.ts ("reports the location of a
 * diagnostic ...", "server fns need a handler"), and the shared oracle's own
 * controls cover `explains` (compiler-test-utils tests/diagnostics.test.ts).
 */
import { expect, test } from 'vitest'
import { expectCompileError, missingHandler } from './legacy/regression-helpers'

// API alternatives are semantic: a diagnosis may name either the builder
// or the handler call, with an actionable missing-handler cause; the quoted
// source cannot provide it (the shared `missingHandler` expectation).
function expectMissingHandler(error: unknown, source: string, column = false) {
  expectCompileError(error, {
    source,
    at: 'createServerFn()',
    column,
    ...missingHandler,
  })
}

// Internal matcher controls: varied actionable prose remains valid, while an
// internal crash cannot borrow the handler API from its quoted source.
test.each([
  'handler() expects a function',
  'createServerFn needs a handler implementation',
])('missing-handler diagnostics accept %s', (message) => {
  const source = `import { createServerFn } from '@tanstack/react-start'\nexport const fn = createServerFn().handler()`
  const error = Object.assign(new Error(`${message} (2:19)`), {
    loc: { file: 'module.tsx', line: 2, column: 18 },
  })
  expect(() => expectMissingHandler(error, source)).not.toThrow()
})
test('missing-handler diagnostics reject a positioned internal crash', () => {
  const source = `import { createServerFn } from '@tanstack/react-start'\nexport const fn = createServerFn().handler()`
  const error = Object.assign(
    new Error(
      `createServerFn internal compiler error (2:19)\n> 2 | ${source.split('\n')[1]}`,
    ),
    { loc: { file: 'module.tsx', line: 2, column: 18 } },
  )
  expect(() => expectMissingHandler(error, source)).toThrow()
})
