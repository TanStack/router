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
  [
    'in a function declared after a return, called by another one called before it',
    'function f() { return g(); function g() { return h() } function h() { return x } }',
    true,
  ],
  [
    'in functions declared after a return that only call each other',
    'function f() { return; function g() { return h() } function h() { return g() + x } }',
    false,
  ],
  [
    'in a function declared in a case after its return, called from another case',
    'function f(k) { switch (k) { case 1: return 0; function g() { return x } default: return g() } }',
    true,
  ],
  [
    'in a case test whose consequent breaks',
    'switch (0) { case x: break; void 0 }',
    true,
  ],
  [
    'after a try that returns, with an empty finally',
    'function f() { try { return 1 } finally {} return x }',
    false,
  ],
  [
    'after a try that returns, with a catch that does not',
    'function f() { try { return 1 } catch {} return x }',
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
