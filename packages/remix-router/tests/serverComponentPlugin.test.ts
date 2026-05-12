import { describe, expect, test } from 'vitest'
import { remixServerComponents } from '../src/vite/serverComponents'

interface PluginShape {
  transform: (
    code: string,
    id: string,
    opts?: { ssr?: boolean },
  ) => null | { code: string; map: null }
}

function transform(code: string, opts?: { ssr?: boolean }) {
  const plugin = remixServerComponents() as unknown as PluginShape
  return plugin.transform(code, '/src/foo.tsx', opts)
}

describe('remixServerComponents transform', () => {
  test('wraps a simple call in import.meta.env.SSR', () => {
    const code = `
      import { serverComponent } from '@tanstack/remix-router'
      export const C = serverComponent('@/c', function (h) {
        return () => null
      })
    `
    const out = transform(code)!
    expect(out.code).toContain(
      "serverComponent('@/c', /* SC */ import.meta.env.SSR ? (function (h) {",
    )
    expect(out.code).toContain(') : null)')
  })

  test('handles arrow factories', () => {
    const code = `serverComponent('a', (h) => (p) => null)`
    const out = transform(code)!
    expect(out.code).toContain(
      `serverComponent('a', /* SC */ import.meta.env.SSR ? ((h) => (p) => null) : null)`,
    )
  })

  test('balances parens in nested calls', () => {
    const code = `
      const f = serverComponent('nested', function (h) {
        return (props) => something(other(thing()))
      })
    `
    const out = transform(code)!
    // The whole factory body must be retained between the SSR wrappers.
    expect(out.code).toContain(
      "import.meta.env.SSR ? (function (h) {",
    )
    expect(out.code).toContain('something(other(thing()))')
    expect(out.code.match(/\) : null\)/g)?.length).toBe(1)
  })

  test('handles multiple calls in one file', () => {
    const code = `
      const A = serverComponent('a', () => () => null)
      const B = serverComponent('b', () => () => 1)
    `
    const out = transform(code)!
    expect(out.code.match(/import\.meta\.env\.SSR \? /g)?.length).toBe(2)
    expect(out.code.match(/ : null\)/g)?.length).toBe(2)
  })

  test('skips files in node_modules', () => {
    const plugin = remixServerComponents() as unknown as PluginShape
    const out = plugin.transform(
      "serverComponent('a', () => () => null)",
      '/repo/node_modules/foo/index.js',
    )
    expect(out).toBeNull()
  })

  test('skips the SSR build', () => {
    const out = transform("serverComponent('a', () => () => null)", {
      ssr: true,
    })
    expect(out).toBeNull()
  })

  test('no-op when serverComponent is not referenced', () => {
    const out = transform(`export const x = 1`)
    expect(out).toBeNull()
  })

  test('skips matches inside JSDoc comments', () => {
    const code = `
      /**
       * @example
       * serverComponent('@/example', () => () => null)
       */
      const A = serverComponent('@/real', () => () => null)
    `
    const out = transform(code)!
    // Only the real call should get the wrapper; the JSDoc one stays.
    expect(out.code.match(/import\.meta\.env\.SSR \? /g)?.length).toBe(1)
    // The JSDoc text should still contain the original call.
    expect(out.code).toContain(
      "* serverComponent('@/example', () => () => null)",
    )
  })

  test('skips matches inside line comments', () => {
    const code = `
      // serverComponent('@/c', () => () => null)
      const A = serverComponent('@/real', () => () => null)
    `
    const out = transform(code)!
    expect(out.code.match(/import\.meta\.env\.SSR \? /g)?.length).toBe(1)
  })

  test('skips matches inside string literals', () => {
    const code = `
      const code = "serverComponent('@/c', () => null)"
      const A = serverComponent('@/real', () => () => null)
    `
    const out = transform(code)!
    expect(out.code.match(/import\.meta\.env\.SSR \? /g)?.length).toBe(1)
  })

  test('elides a trailing comma in the factory arg', () => {
    const code = `
      const A = serverComponent(
        '@/c',
        function (h) {
          return () => null
        },
      )
    `
    const out = transform(code)!
    // The wrapped result must be syntactically valid — no `(…,) : null`.
    expect(out.code).not.toMatch(/,\s*\) : null/)
    expect(out.code).toMatch(/}\s*\) : null\s*\n?\s*\)/)
  })

  test('elides a trailing comma in the factory arg', () => {
    const code = `
      const A = serverComponent(
        '@/c',
        function (h) {
          return () => null
        },
      )
    `
    const out = transform(code)!
    // The wrapped result must be syntactically valid — no `(…,) : null`.
    expect(out.code).not.toMatch(/,\s*\)\s*:\s*null/)
  })

  test('respects strings containing parens', () => {
    const code = `
      const A = serverComponent('paren-id', function (h) {
        return () => 'string with (parens) inside'
      })
    `
    const out = transform(code)!
    // The factory should be cleanly closed; the string parens shouldn't
    // mess with our depth tracking.
    expect(out.code).toContain('string with (parens) inside')
    expect(out.code.match(/\) : null\)/g)?.length).toBe(1)
  })
})
