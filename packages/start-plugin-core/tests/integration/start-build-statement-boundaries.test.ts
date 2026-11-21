/**
 * A removal inside a function keeps the statement boundary the source had:
 * with the declaration only removed code read gone (SPEC J4.12, the core's
 * orphan cleanup), the statement after it must not continue the one before
 * it when that one has no `;` and the next starts with a token that could
 * continue it (`(`, `[`, a template, `+`, `-`, a regular expression).
 * `let y = foo`, `const local = 1;`, `(mk)()` must not become `foo(mk)()`.
 * Real client and SSR builds whose output runs (SPEC G3: the server keeps
 * every statement); the source's values are the expectation.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

/** The statement after the removed declaration, and what running it records. */
const next: Record<string, { statement: string; seen: Array<unknown> }> = {
  parenthesis: { statement: '(mk)()', seen: ['mk'] },
  bracket: { statement: '[1].forEach((n) => note(n))', seen: [1] },
  template: { statement: '`${note(1)}`', seen: [1] },
  plus: { statement: '+note(1)', seen: [1] },
  minus: { statement: '-note(1)', seen: [1] },
  regex: { statement: '/x/.test(String(note(1)))', seen: [1] },
  'comment before it': { statement: '/* c */ (mk)()', seen: ['mk'] },
}

/** How the declaration only the removed code reads is written. */
const removals: Record<string, (statement: string) => string> = {
  'a declaration': (s) => `const local = 1;
  ${s}
  const s = createServerOnlyFn(() => local)`,
  'a declaration with a line comment': (
    s,
  ) => `const local = 1; // only the server reads it
  ${s}
  const s = createServerOnlyFn(() => local)`,
  'two declarators': (s) => `const a = 1, b = 2;
  ${s}
  const s = createServerOnlyFn(() => a + b)`,
  'two declarations': (s) => `const a = 1;
  const b = 2;
  ${s}
  const s = createServerOnlyFn(() => a + b)`,
  'a destructuring': (s) => `const { a } = { a: 1 };
  ${s}
  const s = createServerOnlyFn(() => a)`,
}

const cases = Object.entries(removals).flatMap(([removal, write], r) =>
  Object.entries(next).map(([kind, { statement, seen }], n) => ({
    name: `${removal}, then ${kind}`,
    fn: `case${r}_${n}`,
    source: `export function case${r}_${n}() {
  seen.length = 0
  let y = foo
  ${write(statement)}
  return { y, seen: [...seen], s: typeof s }
}
`,
    seen,
  })),
)

const shapes = `import { createServerOnlyFn } from '@tanstack/react-start'
const foo = 'foo'
const seen: Array<unknown> = []
const mk = () => {
  seen.push('mk')
}
const note = (x: unknown) => {
  seen.push(x)
  return x
}
${cases.map((c) => c.source).join('')}
// in a switch case
export function inCase(k: number) {
  switch (k) {
    case 1:
      seen.length = 0
      let y = foo
      const local = 1;
      (mk)()
      return { y, seen: [...seen], s: typeof createServerOnlyFn(() => local) }
  }
  return null
}
`

const script = `const out = {}
for (const [name, fn] of Object.entries(entry.shapes)) {
  try {
    out[name] = name === 'inCase' ? fn(1) : fn()
  } catch (error) {
    out[name] = { thrown: String(error) }
  }
}
return out`

const expected = {
  ...Object.fromEntries(
    cases.map((c) => [c.fn, { y: 'foo', seen: c.seen, s: 'function' }]),
  ),
  inCase: { y: 'foo', seen: ['mk'], s: 'function' },
}

describe.each(startBundlers)('%s build', (bundler) => {
  test('the statement after a removed declaration starts a statement of its own', async () => {
    const { client, ssr } = await buildStart({
      bundler,
      files: {
        'src/shapes.ts': shapes,
        'entry.ts': `export * as shapes from './src/shapes'\n`,
      },
    })
    expect((await client.run(script)).result).toEqual(expected)
    expect((await ssr.run(script)).result).toEqual(expected)
  }, 120_000)
})
