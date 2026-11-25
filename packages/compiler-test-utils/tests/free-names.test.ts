/**
 * Controls of a module's free names (free-names.ts): a read in code that
 * never runs is no read; one in code that may run, however it is wrapped,
 * is.
 */
import { expect, test } from 'vitest'
import { readNames } from '../src/free-names'

test.each([
  ['after a return', 'function f() { return; x() }', false],
  [
    'in a function declared after a return',
    'function f() { return; function g() { return x } }',
    false,
  ],
  [
    'in a function declared after a return and called before it',
    'function f() { return g(); function g() { return x } }',
    true,
  ],
  ['after a throw', 'function f() { throw 1; x }', false],
  ['in the branch of a constant false test', 'if (!1) { x }', false],
  ['in the branch of a constant true test', 'if (!0) { x }', true],
  [
    'after a constant true test that returns',
    'function f() { if (!0) return; x }',
    false,
  ],
  ['after a test that may return', 'function f(a) { if (a) return; x }', true],
  ['on the right of a constant true ||', '!0 || x', false],
  ['on the right of a ||', 'y || x', true],
  ['in a factory of an object of hashed ids', '({ a1b2: (e) => x })', true],
  ['in an async module function', '(async () => { await 0; x })()', true],
])('a read %s counts: %s', (_, code, counts) => {
  expect(readNames(code, 'chunk.js', { keepProbed: true }).free.has('x')).toBe(
    counts,
  )
})
