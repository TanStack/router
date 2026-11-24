/**
 * A server fn handler passed by name whose binding the module assigns
 * anywhere else is a compile error in every compile of the site (SPEC
 * J4.5; decision of 2026-11-24): the assignments are top-level statements,
 * which the client output can keep with what they read (R154), so the
 * server code the binding holds can ship to the client, and run there.
 * The client, SSR with the provider in place, a module awaiting at its top
 * level, and with RSC the client, the SSR caller and the separate provider
 * each refuse it at the argument. A server fn its module does not create
 * once (in a function or a block) keeps its own refusal; one in code an
 * environment erases is not reported there. A `let` nothing assigns again
 * (a Solid callback ref is no assignment), and the rewrite the error
 * suggests (`const h = condition ? a : b`), compile and keep the server code
 * off the client.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  CompileFailure,
  callServerFnThroughCallers,
  compileError,
  expectCompileError,
  serveCase,
  useStartHost,
} from './regression-helpers'
import type { StartCase } from './start-host'

const head = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db'
`
const dbFile = {
  'db.ts': `export const db = { x: () => 'MARK_DB_X', y: () => 'MARK_DB_Y' }\n`,
}

/** The reported shape and the ways a module writes a handler binding. */
const writes: Array<[string, string]> = [
  [
    'a second function',
    `let h = async () => db.y()
h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a wrapper of itself',
    `const withLogging = <T,>(f: T) => f
let h = async () => db.x()
h = withLogging(h)
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a conditional write',
    `let h = async () => db.y()
if (import.meta.env.DEV) h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a logical assignment',
    `let h: undefined | (() => Promise<string>)
h ??= async () => db.x()
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write in a function',
    `let h = async () => db.y()
export function useMock() { h = async () => 'mock' }
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'an exported `let`',
    `export let h = async () => db.y()
h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a cast at the argument',
    `let h = async () => db.y()
h = async () => db.x()
export const fn = createServerFn().handler(h as any)
`,
  ],
  [
    'a server fn in an object',
    `let h = async () => db.y()
h = async () => db.x()
export const api = { fn: createServerFn().handler(h) }
`,
  ],
]

/** The text of the error an environment's failure reports at the line of `at`. */
function errorAt(
  failure: CompileFailure | undefined,
  source: string,
  at: string,
) {
  expect(failure, 'a compile error').toBeInstanceOf(CompileFailure)
  return expectDiagnostic(
    [...diagnosticsOf(failure!.error), ...diagnosticsOf(failure!.reported)],
    { position: { line: diagnosticPosition(source, at).line } },
  ).text
}

/** Each environment refuses the module at the `.handler(…)` call's line. */
async function expectRefused(
  startCase: StartCase,
  source: string,
  environments: ReadonlyArray<'client' | 'ssr' | 'rsc'>,
) {
  for (const environment of environments) {
    expectCompileError(await compileError(startCase, environment), {
      source,
      at: '.handler(',
    })
  }
}

describe('Vite: every compile refuses a reassigned handler binding', () => {
  const host = useStartHost()

  test.each(writes)('%s', async (_, body) => {
    const source = head + body
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  // the provider keeps handlers in place in a module awaiting at its top level
  test('a module awaiting at its top level', async () => {
    const source = `${head}${writes[0]![1]}export const ready = await Promise.resolve(true)\n`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  // what the user reads: the binding, and the two rewrites
  test('the error names the binding and the rewrites that work', async () => {
    const source = head + writes[0]![1]
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    const text = errorAt(await compileError(startCase), source, '.handler(')
    expect(text).toContain('`h` is assigned elsewhere in this module')
    expect(text).toContain('`.handler(async () => …)`')
    expect(text).toContain('`const h = wrap(async () => …)`')
    expect(text).toContain('`const h = condition ? a : b`')
  })

  // a local of the function or block around the site: the server fn is not
  // created once (R162), which every compile reports as such
  test.each([
    [
      'in a function',
      `export function make(replica: boolean) {
  let h = async () => db.y()
  if (replica) { h = async () => db.x() }
  return createServerFn().handler(h)
}
`,
    ],
    [
      'in a block',
      `{
  let h = async () => db.y()
  h = async () => db.x()
  const fn = createServerFn().handler(h)
  void fn
}
`,
    ],
  ])(
    'a server fn %s on a reassigned local is refused for where it is created',
    async (_, body) => {
      const source = head + body
      const startCase = await (
        await host()
      ).case({ ...dbFile, 'module.tsx': source })
      for (const environment of ['client', 'ssr'] as const) {
        const text = errorAt(
          await compileError(startCase, environment),
          source,
          '.handler(',
        )
        expect(text).toContain('top level')
        expect(text).not.toContain('assigned elsewhere')
      }
    },
  )

  // the client erases the outer handler, and the server fn with it
  test('a server fn inside another handler, on a reassigned local, compiles on the client', async () => {
    const source = `${head}export const outer = createServerFn().handler(async () => {
  let h = async () => db.y()
  h = async () => db.x()
  const inner = createServerFn().handler(h)
  return inner()
})
`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    expect(await compileError(startCase, 'client')).toBeUndefined()
    const text = errorAt(
      await compileError(startCase, 'ssr'),
      source,
      'createServerFn().handler(h)',
    )
    expect(text).not.toContain('assigned elsewhere')
  })

  test('a `let` nothing assigns again compiles and stays off the client', async () => {
    const served = await serveCase(await host(), {
      ...dbFile,
      'module.tsx': `${head}let h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
    })
    expectNotLoaded(await served.loads(), ['./db'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'MARK_DB_X',
    )
  })

  // the rewrite the error suggests
  test('one `const` choosing the implementation compiles and stays off the client', async () => {
    const served = await serveCase(await host(), {
      ...dbFile,
      'module.tsx': `${head}const h = import.meta.env.DEV ? async () => db.x() : async () => db.y()
export const fn = createServerFn().handler(h)
`,
    })
    expectNotLoaded(await served.loads(), ['./db'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'MARK_DB_X',
    )
  })
})

describe('Vite with RSC: every compile refuses a reassigned handler binding', () => {
  const host = useStartHost({ rsc: true })

  // the client, the SSR caller and the provider the rsc environment derives
  test('a second function', async () => {
    const source = head + writes[0]![1]
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr', 'rsc'])
  })
})

/**
 * Solid: `ref={h}` on a `let` is no assignment the module writes (Solid sets
 * it when the element renders): a `let` used as a ref and as the handler,
 * whatever its initialiser, compiles; an explicit write is refused.
 */
describe('Solid: a callback ref is no reassignment', () => {
  const host = useStartHost({ framework: 'solid' })
  const solidHead = `import { createServerFn } from '@tanstack/solid-start'
import { db } from './db'
`
  const page = `export function Page() {
  return <div ref={apply}>page</div>
}
`

  test.each([
    [
      'a known function',
      `const noop = async () => db.x()
let apply = noop
`,
    ],
    [
      'a choice between two functions',
      `const a = async () => db.x()
const b = async () => db.y()
let apply = import.meta.env.DEV ? a : b
`,
    ],
  ])(
    'a `let` initialised with %s, used as a ref and as the handler, compiles',
    async (_, decl) => {
      const startCase = await (
        await host()
      ).case({
        ...dbFile,
        'module.tsx': `${solidHead}${decl}export const fn = createServerFn().handler(apply)
${page}`,
      })
      expect(await compileError(startCase, 'client')).toBeUndefined()
      expect(await compileError(startCase, 'ssr')).toBeUndefined()
    },
  )

  test('the same with an explicit write is refused', async () => {
    const source = `${solidHead}let apply = async () => db.y()
apply = async () => db.x()
export const fn = createServerFn().handler(apply)
${page}`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })
})
