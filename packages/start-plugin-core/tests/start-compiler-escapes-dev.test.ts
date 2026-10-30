/**
 * A Start builder the compiler cannot follow fails the module in
 * development too (SPEC J4.12, G5), through the public Start plugin on a
 * real Vite dev server: a use the client analysis cannot follow fails the
 * module at the use, and a module exporting a builder fails once a module
 * loading it with `import()` is in the dev server's graph (a production build
 * checks every importer; a dev server serves the importer first).
 */
import { expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { compileError, useStartHost } from './regression-helpers'
import { expectCompileError } from './diagnostics'

const host = useStartHost()

test('a builder passed to unknown code fails the client module at the use', async () => {
  const source = `import { createServerFn } from '@tanstack/react-start'
const wrap = (b: any) => Object.assign(b, {})
export const fn = wrap(createServerFn()).handler(async () => 'secret')`
  const startCase = await (await host()).case({ 'module.tsx': source })
  expectCompileError(await compileError(startCase), {
    source,
    at: 'createServerFn())',
    column: true,
  })
  expect(await compileError(startCase, 'ssr')).toBeUndefined()
})

test('a module exporting a builder fails once a module loading it with import() is served', async () => {
  const startCase = await (
    await host()
  ).case({
    'module.tsx': `export const load = () =>
  import('./b').then((m) => m.base.handler(async () => 'secret'))
`,
    'b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
  })
  expect(await compileError(startCase)).toBeUndefined()
  const error = await compileError(startCase, 'client', 'b.ts')
  expect(error, 'a compile error').toBeInstanceOf(Error)
  // (the message names both modules relative to the app root)
  const file = startCase.file('module.tsx')
  const root = file.slice(0, file.lastIndexOf('/src/'))
  for (const name of ['module.tsx', 'b.ts']) {
    expectDiagnostic(
      [{ severity: 'error', text: String((error as Error).message) }],
      { severity: 'error', file: startCase.file(name), root },
    )
  }
})

test('a parameter only server code reads warns once, at the definition', async () => {
  const startCase = await (
    await host()
  ).case({
    'module.tsx': `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`,
  })
  expect(await compileError(startCase)).toBeUndefined()
  expect(await compileError(startCase, 'ssr')).toBeUndefined()
  expect(await compileError(startCase)).toBeUndefined()
  const warnings = findDiagnostics(startCase.diagnostics(), {
    file: startCase.file(),
  }).filter((d) => d.severity === 'warning')
  expect(warnings.map((d) => d.text)).toEqual([
    expect.stringContaining('`role` is read only by server-only code'),
  ])
})
