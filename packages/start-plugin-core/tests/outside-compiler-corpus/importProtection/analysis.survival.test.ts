/**
 * Internal control (SPEC §8): not part of the compiler test corpus. It
 * compiles each case with today's Start compiler (`compileFor` of
 * `outside-compiler-corpus/legacy/regression-helpers.ts`) and reads whether the output still imports the
 * denied source; a correct compiler may keep a dead import that the
 * bundler or import protection drops. The outcome (only surviving edges are
 * reported, SPEC J6.4) is decided on dev servers with Start's whole plugin:
 * `integration/importProtection/boundary-edges.test.ts` (each of these
 * boundary shapes, Vite and Rsbuild) and
 * `integration/importProtection/reported-location.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { compileFor, importSources } from '../legacy/regression-helpers'

// Whether the Start compiler keeps a module's import of a denied source in
// the output of an environment: an import used only inside code the compiler
// removes from the environment (a safe boundary) does not survive, so there
// is no edge for import protection to report (SPEC J6.4); a use the
// compiler keeps does. Where a surviving use is reported is read from real
// apps: integration/importProtection/reported-location.test.ts.
describe('a denied import after the Start compiler', () => {
  const imports = `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
import { denied } from 'denied'
`

  /** Whether the output of `output` for `code` still imports `denied`. */
  async function survives(code: string, output: 'client' | 'ssr' | 'provider') {
    const compiled = await compileFor(output, code, {
      id: '/test/src/module.tsx',
    })
    return importSources(compiled.code ?? code).includes('denied')
  }

  test.each([
    {
      name: 'createServerFn().handler',
      output: 'client',
      body: `export const fn = createServerFn().handler(async () => denied())`,
    },
    {
      name: 'a parenthesized createServerFn().handler argument',
      output: 'client',
      body: `export const fn = createServerFn().handler((() => denied()))`,
    },
    {
      name: 'a wrapped createServerFn().handler argument',
      output: 'client',
      body: `const withAuth = <T,>(fn: T) => fn
export const fn = createServerFn().handler(withAuth(async () => denied()))`,
    },
    {
      name: 'a createServerFn().handler argument with a type assertion',
      output: 'client',
      body: `export const fn = createServerFn().handler((async () => denied()) as any)`,
    },
    {
      name: 'createServerFn().handler through a namespace import',
      output: 'client',
      body: `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerFn().handler(() => denied())`,
    },
    {
      name: 'createServerOnlyFn through a namespace import',
      output: 'client',
      body: `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerOnlyFn(() => denied())`,
    },
    {
      name: 'a handler after a validator',
      output: 'client',
      body: `export const fn = createServerFn({ method: 'GET' }).validator((d: unknown) => d).handler(() => denied())`,
    },
    {
      name: 'createServerOnlyFn',
      output: 'client',
      body: `export const fn = createServerOnlyFn(() => denied())`,
    },
    {
      name: 'createMiddleware().server',
      output: 'client',
      body: `export const middleware = createMiddleware({ type: 'function' }).server(({ next }) => {
  const secret = denied()
  return next({ context: { secret } })
})`,
    },
    {
      name: 'createIsomorphicFn().server',
      output: 'client',
      body: `export const fn = createIsomorphicFn().server(() => denied())`,
    },
    {
      name: 'createClientOnlyFn',
      output: 'ssr',
      body: `export const fn = createClientOnlyFn(() => denied())`,
    },
    {
      name: 'a createClientOnlyFn argument with a satisfies clause',
      output: 'ssr',
      body: `export const fn = createClientOnlyFn((() => denied()) satisfies () => unknown)`,
    },
    {
      name: 'a parenthesized createIsomorphicFn().client argument',
      output: 'ssr',
      body: `export const fn = createIsomorphicFn().client((() => denied()))`,
    },
  ] as const)(
    '$output: an import used only inside $name does not survive',
    async ({ output, body }) => {
      expect(await survives(imports + body, output)).toBe(false)
    },
  )

  test.each([
    {
      name: 'a server fn handler in the provider',
      output: 'provider',
      body: `export const fn = createServerFn().handler(async () => denied())`,
    },
    {
      name: 'a function after a server fn handler, in the client',
      output: 'client',
      body: `export const fn = createServerFn().handler(async () => {
  return denied()
})
export function leakyReference() {
  return denied()
}`,
    },
  ] as const)(
    '$output: an import used inside $name survives',
    async ({ output, body }) => {
      expect(await survives(imports + body, output)).toBe(true)
    },
  )
})
