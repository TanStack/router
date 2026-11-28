/**
 * A Start builder the compiler cannot follow fails the module in
 * development too (SPEC J4.12, G5), through the public Start plugin on a
 * real Vite dev server: a use the client analysis cannot follow fails the
 * module at the use.
 */
import { beforeAll, expect, test } from 'vitest'
import {
  diagnosticPosition,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { compileError, createStartHost } from './regression-helpers'
import { expectCompileError } from './diagnostics'
import type { StartHost } from './start-host'

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
})

test('a builder passed to unknown code fails the client module at the use', async () => {
  const source = `import { createServerFn } from '@tanstack/react-start'
const wrap = (b: any) => Object.assign(b, {})
export const fn = wrap(createServerFn()).handler(async () => 'secret')`
  const startCase = await host.case({ 'module.tsx': source })
  expectCompileError(await compileError(startCase), {
    source,
    at: 'createServerFn())',
    column: true,
  })
  expect(await compileError(startCase, 'ssr')).toBeUndefined()
})

test('a parameter only server code reads warns once, at the definition', async () => {
  const code = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`
  const startCase = await host.case({ 'module.tsx': code })
  expect(await compileError(startCase)).toBeUndefined()
  expect(await compileError(startCase, 'ssr')).toBeUndefined()
  expect(await compileError(startCase)).toBeUndefined()
  const warnings = findDiagnostics(startCase.diagnostics(), {
    severity: 'warning',
    file: startCase.file(),
  })
  expect(warnings).toHaveLength(1)
  expect(
    findDiagnostics(warnings, {
      position: diagnosticPosition(code, 'role: string'),
    }),
  ).toHaveLength(1)
})

// Source: review round 3 (R3-G2-2): the join of the two isomorphic fns lost
// what the first one's call returns, so the handler of the server fn it
// returns shipped.
test('a join of isomorphic fns of which one returns a builder fails the client module at the join', async () => {
  const source = `import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
const flag = Math.random() > 0.5
const pick = flag
  ? createIsomorphicFn().client(() => createServerFn({ method: 'POST' }))
  : createIsomorphicFn().client(() => undefined)
export const leak = pick().handler(async () => 'secret')`
  const startCase = await host.case({ 'module.tsx': source })
  expectCompileError(await compileError(startCase), {
    source,
    at: 'createIsomorphicFn().client(() => createServerFn',
    column: true,
  })
})

// Source: review round 3 (R3-G2-3): a `var` redeclaring a function or a
// parameter (JavaScript allows it; TypeScript's checker does not) was valued
// as the function, so the handler of its builder shipped. The first
// declaration with a value is the name's value (SPEC J4.5): after a function
// declaration the declarator is a reassignment; a parameter has no value, so
// the builder is a local of the function, as `const fn = createServerFn()`.
const redeclared = (
  head: string,
) => `import { createServerFn } from '@tanstack/react-start'
${head} = createServerFn()
  return fn.handler(async () => 'MARK_SECRET')
}
`

test.each([
  {
    redeclares: 'a function',
    head: 'export function a() {\n  function fn() {}\n  var fn',
    at: 'createServerFn()\n',
  },
  {
    redeclares: 'a parameter',
    head: 'export function a(fn) {\n  var fn',
    at: 'fn.handler',
  },
])(
  'a builder in a var redeclaring $redeclares fails the client module',
  async ({ head, at }) => {
    const source = redeclared(head)
    const startCase = await host.case({ 'module.js': source })
    expectCompileError(await compileError(startCase, 'client', 'module.js'), {
      source,
      at,
      column: true,
    })
  },
)
