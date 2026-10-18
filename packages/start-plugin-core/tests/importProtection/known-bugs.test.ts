/**
 * Known import-protection bugs of the rewrite of a denied import, in
 * process. Each test asserts correct behaviour for a bug on main and is
 * marked .fails; remove .fails when the bug is fixed. The bugs of the mock
 * modules are pinned on real apps (integration/importProtection/
 * known-bugs.test.ts, "app-level twins of the mock pins").
 */

import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'

/** A sentinel mock injected to observe the rewrite's wiring alone. */
const mockModule = `data:text/javascript,${encodeURIComponent(
  `export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? 'mock:' + key : undefined })`,
)}`

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
