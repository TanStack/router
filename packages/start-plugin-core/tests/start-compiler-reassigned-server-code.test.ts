/**
 * Server code passed by name whose binding the module assigns elsewhere is
 * a compile error in every compile (SPEC J4.5; decisions of 2026-11-24):
 * the assignments are statements, which the client output can keep with
 * what they read (R154), so the server code the binding holds can ship to
 * the client, and run there. Every position that takes server code by name
 * is one: a server fn's `.handler()` and `.validator()`, a middleware's
 * `.server()` and `.validator()`, an isomorphic fn's `.server()`,
 * `createServerOnlyFn()`, and a route's `server` and `headers` options. The
 * client, SSR, and with RSC the separate provider each refuse it at the
 * argument.
 *
 * Not refused: a binding the client reads anyway (code other than server
 * code and the statements assigning it reads it, or the module exports it:
 * the client keeps it whatever the compiler does), one only server code
 * assigns (the assignments leave the client with it), a `let` nothing
 * assigns again (a Solid callback ref is no assignment), and the rewrite the
 * error suggests (one `const`). A server fn its module does not create once
 * (in a function or a block) keeps its own refusal; one in code an
 * environment erases is not reported there.
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

const head = `import { createIsomorphicFn, createMiddleware, createServerFn, createServerOnlyFn } from '@tanstack/react-start'
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
    'a write the binding decides',
    `let h: undefined | (() => Promise<string>)
if (!h) h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write two guards hold, the outer reading the binding',
    `let h: undefined | (() => Promise<string>)
if (!h) {
  if (import.meta.env.DEV) {
    h = async () => db.x()
  }
}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write a loop on the binding holds',
    `let h: undefined | (() => Promise<string>)
while (!h) {
  h = async () => db.x()
}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write a switch on the binding holds',
    `let h = async () => db.y()
switch (typeof h) {
  case 'function':
    h = async () => db.x()
}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write a block guarded by the binding holds',
    `let h: undefined | (() => Promise<string>)
if (!h) {
  h = async () => db.x()
}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a wrapper of itself in a function',
    `const withLogging = <T,>(f: T) => f
let h = async () => db.x()
export function instrument() { h = withLogging(h) }
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

/**
 * Every other position that takes server code, with the binding assigned
 * again (`refused`), the same chosen by one `const` (`rewritten`), and the
 * argument's text (`at`).
 */
const positions: Array<{
  name: string
  refused: string
  rewritten: string
  at: string
}> = [
  {
    name: 'createServerOnlyFn(…)',
    refused: `let impl = () => db.y()
impl = () => db.x()
export const fn = createServerOnlyFn(impl)
`,
    rewritten: `const impl = import.meta.env.DEV ? () => db.x() : () => db.y()
export const fn = createServerOnlyFn(impl)
`,
    at: 'createServerOnlyFn(impl)',
  },
  {
    name: "an isomorphic fn's .server(…)",
    refused: `let impl = () => db.y()
impl = () => db.x()
export const fn = createIsomorphicFn().server(impl).client(() => 'client')
`,
    rewritten: `const impl = import.meta.env.DEV ? () => db.x() : () => db.y()
export const fn = createIsomorphicFn().server(impl).client(() => 'client')
`,
    at: '.server(impl)',
  },
  {
    name: "a middleware's .server(…)",
    refused: `let impl = ({ next }: any) => next({ context: { db: db.y() } })
impl = ({ next }: any) => next({ context: { db: db.x() } })
export const mw = createMiddleware().server(impl)
`,
    rewritten: `const impl = import.meta.env.DEV
  ? ({ next }: any) => next({ context: { db: db.x() } })
  : ({ next }: any) => next({ context: { db: db.y() } })
export const mw = createMiddleware().server(impl)
`,
    at: '.server(impl)',
  },
  {
    name: "a server fn's .validator(…)",
    refused: `let schema = (data: unknown) => (db.y(), String(data))
schema = (data: unknown) => (db.x(), String(data))
export const fn = createServerFn().validator(schema).handler(async () => 'ok')
`,
    rewritten: `const schema = import.meta.env.DEV
  ? (data: unknown) => (db.x(), String(data))
  : (data: unknown) => (db.y(), String(data))
export const fn = createServerFn().validator(schema).handler(async () => 'ok')
`,
    at: '.validator(schema)',
  },
  {
    name: "a middleware's .validator(…)",
    refused: `let schema = (data: unknown) => (db.y(), String(data))
schema = (data: unknown) => (db.x(), String(data))
export const mw = createMiddleware({ type: 'function' }).validator(schema)
`,
    rewritten: `const schema = import.meta.env.DEV
  ? (data: unknown) => (db.x(), String(data))
  : (data: unknown) => (db.y(), String(data))
export const mw = createMiddleware({ type: 'function' }).validator(schema)
`,
    at: '.validator(schema)',
  },
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

/** Each environment refuses the module at the line of `at`. */
async function expectRefused(
  startCase: StartCase,
  source: string,
  environments: ReadonlyArray<'client' | 'ssr' | 'rsc'>,
  at = '.handler(',
) {
  for (const environment of environments) {
    expectCompileError(await compileError(startCase, environment), {
      source,
      at,
    })
  }
}

/** Each environment compiles the module. */
async function expectCompiles(
  startCase: StartCase,
  environments: ReadonlyArray<'client' | 'ssr' | 'rsc'>,
) {
  for (const environment of environments) {
    expect(
      await compileError(startCase, environment),
      `the ${environment} compile`,
    ).toBeUndefined()
  }
}

describe('Vite: every compile refuses server code passed by a name the module assigns', () => {
  const host = useStartHost()

  test.each(writes)('a handler: %s', async (_, body) => {
    const source = head + body
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  test.each(positions)('$name', async ({ refused, at }) => {
    const source = head + refused
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'], at)
  })

  // the provider keeps handlers in place in a module awaiting at its top level
  test('a module awaiting at its top level', async () => {
    const source = `${head}${writes[0]![1]}export const ready = await Promise.resolve(true)\n`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  // what the user reads: the binding, the position's API, and the two rewrites
  test.each([
    {
      at: '.handler(',
      source: head + writes[0]![1],
      name: 'h',
      inPlace: '.handler(async () => …)',
      value: 'async () => …',
    },
    {
      at: 'createServerOnlyFn(impl)',
      source: head + positions[0]!.refused,
      name: 'impl',
      inPlace: 'createServerOnlyFn(() => …)',
      value: '() => …',
    },
    {
      at: '.validator(schema)',
      source: head + positions[3]!.refused,
      name: 'schema',
      inPlace: '.validator((data) => …)',
      value: '(data) => …',
    },
  ])(
    'the error at $inPlace names the binding, the API and the rewrites that work',
    async ({ at, source, name, inPlace, value }) => {
      const startCase = await (
        await host()
      ).case({ ...dbFile, 'module.tsx': source })
      const text = errorAt(await compileError(startCase), source, at)
      expect(text).toContain(`\`${name}\` is assigned elsewhere in this module`)
      expect(text).toContain(`\`${inPlace}\``)
      expect(text).toContain(`\`const ${name} = wrap(${value})\``)
      expect(text).toContain(`\`const ${name} = condition ? a : b\``)
    },
  )

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

  // a local of a function the client keeps: its assignments stay with it
  test('createServerOnlyFn(…) in a function, on a reassigned local', async () => {
    const source = `${head}export function make(replica: boolean) {
  let impl = () => db.y()
  if (replica) { impl = () => db.x() }
  return createServerOnlyFn(impl)
}
`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(
      startCase,
      source,
      ['client', 'ssr'],
      'createServerOnlyFn(impl)',
    )
  })

  // the local reads itself in its own declarator only
  // a function's parameter, assigned and read by the client: SSR compiles it
  // whether the function is declared or an arrow (the client refuses the
  // parameter: `start-escape:server-param`)
  test.each([
    [
      'a function declaration',
      `export function make(impl?: () => unknown) {
  impl = impl ?? (() => db.x())
  const read = createServerOnlyFn(impl)
  return { read, also: () => impl!() }
}
`,
    ],
    [
      'an arrow function',
      `export const make = (impl?: () => unknown) => {
  impl = impl ?? (() => db.x())
  const read = createServerOnlyFn(impl)
  return { read, also: () => impl!() }
}
`,
    ],
  ])('a parameter of %s the client reads compiles on SSR', async (_, body) => {
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': head + body })
    await expectCompiles(startCase, ['ssr'])
  })

  test('createServerOnlyFn(…) on a local that reads itself in its declarator', async () => {
    const source = `${head}export function make(replica: boolean) {
  let impl = (): unknown => impl
  if (replica) { impl = () => db.x() }
  return createServerOnlyFn(impl)
}
`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(
      startCase,
      source,
      ['client', 'ssr'],
      'createServerOnlyFn(impl)',
    )
  })

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

  // the client erases the assignment with the code around it
  test('a binding only server code assigns compiles, and stays off the client', async () => {
    const served = await serveCase(await host(), {
      ...dbFile,
      'module.tsx': `${head}let h = async () => db.x()
export const reset = createServerFn().handler(async () => {
  h = async () => db.y()
  return 'reset'
})
export const fn = createServerFn().handler(h)
`,
    })
    expectNotLoaded(await served.loads(), ['./db'])
  })

  // the client reads the binding anyway: it keeps it, and its assignments,
  // whatever the compiler does with the server fn
  test.each([
    [
      'a validator a component reads too',
      `let schema = (data: unknown) => String(data)
if (import.meta.env.DEV) schema = (data: unknown) => String(data).trim()
export const fn = createServerFn().validator(schema).handler(async () => 'ok')
export function Form() {
  return <p>{schema('form')}</p>
}
`,
    ],
    [
      "a validator a classic `for` loop's initialiser picks and its body calls",
      `type Validator = (input: string) => string
let validate: Validator = (s) => s
export function preview(input: string, validators: Array<Validator>) {
  let i = 0
  const result: Array<string> = []
  for (validate = validators[0] ?? validate; i < validators.length; i++) {
    result.push(validate(input))
  }
  return result
}
export const fn = createServerFn().validator(validate).handler(async () => 'ok')
`,
    ],
    [
      'a validator a `while` condition picks and its body calls',
      `type Validator = (input: string) => string
let validate: Validator = (s) => s
export function preview(input: string, validators: Array<Validator>) {
  let i = 0
  const result: Array<string> = []
  while (i < validators.length && (validate = validators[i++]!)) {
    result.push(validate(input))
  }
  return result
}
export const fn = createServerFn().validator(validate).handler(async () => 'ok')
`,
    ],
    [
      'a binding a default export assigns and a function reads',
      `let h = () => db.y()
export const read = () => h()
export const so = createServerOnlyFn(h)
export default (h = () => db.x())
`,
    ],
    [
      'a validator a function updates and reads',
      `let schema = (data: unknown) => String(data)
export function preview(mode: string, input: unknown) {
  if (mode === 'strict') schema = (data: unknown) => String(data).trim()
  return schema(input)
}
export const fn = createServerFn().validator(schema).handler(async () => 'ok')
`,
    ],
    [
      "a component's formatter it updates and renders",
      `export function Page({ strict }: { strict: boolean }) {
  let format = (v: string) => v
  if (strict) format = (v: string) => v.trim()
  const read = createServerOnlyFn(format)
  void read
  return <p>{format('page')}</p>
}
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
      'a binding exported by name',
      `let impl = () => db.y()
impl = () => db.x()
export const fn = createServerOnlyFn(impl)
export { impl }
`,
    ],
  ])('%s compiles', async (_, body) => {
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': head + body })
    await expectCompiles(startCase, ['client', 'ssr'])
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
  test('one `const` choosing the handler compiles and stays off the client', async () => {
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

  test.each(positions)(
    '$name: one `const` compiles and stays off the client',
    async ({ rewritten }) => {
      const served = await serveCase(await host(), {
        ...dbFile,
        'module.tsx': head + rewritten,
      })
      expectNotLoaded(await served.loads(), ['./db'])
    },
  )
})

describe('Vite with RSC: every compile refuses server code passed by a name the module assigns', () => {
  const host = useStartHost({ rsc: true })

  // the client, the SSR caller and the provider the rsc environment derives
  test('a handler: a second function', async () => {
    const source = head + writes[0]![1]
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr', 'rsc'])
  })

  test.each(positions)('$name', async ({ refused, at }) => {
    const source = head + refused
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr', 'rsc'], at)
  })
})

/**
 * A route's server options by name: a `server.handlers` method and
 * `headers`. Each route is a file of the app (the route generator lists
 * it); the refused ones have a host of their own, so no page run of the
 * accepted ones loads them.
 */
const routeHead = `import { createFileRoute } from '@tanstack/react-router'
import { db } from '../route-db'
`
const routeDb = {
  'src/route-db.ts': `export const db = { x: () => 'MARK_DB_X', y: () => 'MARK_DB_Y' }\n`,
}
const refusedRoutes: Record<string, { source: string; at: string }> = {
  'src/routes/reassigned-get.tsx': {
    source: `${routeHead}let get = async () => new Response(db.y())
get = async () => new Response(db.x())
export const Route = createFileRoute('/reassigned-get')({
  server: { handlers: { GET: get } },
  component: () => <p>page</p>,
})
`,
    at: 'GET: get',
  },
  'src/routes/reassigned-headers.tsx': {
    source: `${routeHead}let pickHeaders = () => ({ 'x-db': db.y() })
pickHeaders = () => ({ 'x-db': db.x() })
export const Route = createFileRoute('/reassigned-headers')({
  headers: pickHeaders,
  component: () => <p>page</p>,
})
`,
    at: 'headers: pickHeaders',
  },
  'src/routes/reassigned-quoted-handlers.tsx': {
    source: `${routeHead}let get = async () => new Response(db.y())
get = async () => new Response(db.x())
export const Route = createFileRoute('/reassigned-quoted-handlers')({
  server: { 'handlers': ({ createHandlers }) => createHandlers({ GET: get }) },
  component: () => <p>page</p>,
})
`,
    at: 'GET: get',
  },
  'src/routes/reassigned-create-handlers.tsx': {
    source: `${routeHead}let get = async () => new Response(db.y())
get = async () => new Response(db.x())
export const Route = createFileRoute('/reassigned-create-handlers')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({ GET: { middleware: [], handler: get } }),
  },
  component: () => <p>page</p>,
})
`,
    at: 'handler: get',
  },
  'src/routes/reassigned-spread.tsx': {
    source: `${routeHead}let more: Record<string, () => Response> = { GET: () => new Response(db.y()) }
more = { GET: () => new Response(db.x()) }
export const Route = createFileRoute('/reassigned-spread')({
  server: { handlers: { ...more, POST: () => new Response('post') } },
  component: () => <p>page</p>,
})
`,
    at: '...more',
  },
  'src/routes/reassigned-middleware.tsx': {
    source: `${routeHead}import { createMiddleware } from '@tanstack/react-start'
const guard = (rule: string) => createMiddleware().server(({ next }) => next({ context: { rule } }))
let auth = guard(db.y())
auth = guard(db.x())
export const Route = createFileRoute('/reassigned-middleware')({
  server: { middleware: [auth], handlers: { GET: () => new Response('get') } },
  component: () => <p>page</p>,
})
`,
    at: 'middleware: [auth]',
  },
  'src/routes/reassigned-ssr-function.tsx': {
    source: `${routeHead}let decide = () => true
decide = () => db.x() === 'MARK_DB_X'
export const Route = createFileRoute('/reassigned-ssr-function')({
  ssr: decide,
  component: () => <p>page</p>,
})
`,
    at: 'ssr: decide',
  },
  // the other planner's server code reads the binding: no client read (one
  // view of the module's server-only text), in both directions
  'src/routes/reassigned-read-by-server-only-fn.tsx': {
    source: `${routeHead}import { createServerOnlyFn } from '@tanstack/react-start'
let pickHeaders = () => ({ 'x-db': db.y() })
pickHeaders = () => ({ 'x-db': db.x() })
export const readHeaders = createServerOnlyFn(() => pickHeaders())
export const Route = createFileRoute('/reassigned-read-by-server-only-fn')({
  headers: pickHeaders,
  component: () => <p>page</p>,
})
`,
    at: 'headers: pickHeaders',
  },
  'src/routes/reassigned-read-by-route-handler.tsx': {
    source: `${routeHead}import { createServerOnlyFn } from '@tanstack/react-start'
let format = (v: string) => db.y() + v
format = (v: string) => db.x() + v
export const read = createServerOnlyFn(format)
export const Route = createFileRoute('/reassigned-read-by-route-handler')({
  server: { handlers: { GET: () => new Response(format('get')) } },
  component: () => <p>page</p>,
})
`,
    at: 'createServerOnlyFn(format)',
  },
}

describe("Vite: a route's server options by a name the module assigns", () => {
  const host = useStartHost({
    files: {
      ...routeDb,
      ...Object.fromEntries(
        Object.entries(refusedRoutes).map(([file, { source }]) => [
          file,
          source,
        ]),
      ),
    },
  })

  // what the user reads in a `createHandlers(…)` object: the argument, with
  // the callback and its middleware kept
  test('the error in a createHandlers object keeps the factory', async () => {
    const { host: dev } = await host()
    const error = await dev
      .transform('/src/routes/reassigned-create-handlers.tsx', 'client')
      .then(
        () => undefined,
        (e: unknown) => e,
      )
    const text = diagnosticsOf(error)
      .map((d) => d.text)
      .join('\n')
    expect(text).toContain('`handler: …`')
    expect(text).toContain(
      'keeping the `createHandlers` callback and its middleware',
    )
  })

  test.each(Object.keys(refusedRoutes))(
    '%s is refused in every compile',
    async (file) => {
      const { source, at } = refusedRoutes[file]!
      const { host: dev } = await host()
      for (const environment of ['client', 'ssr'] as const) {
        const error = await dev.transform(`/${file}`, environment).then(
          () => undefined,
          (e: unknown) => e,
        )
        expect(error, `the ${environment} compile fails`).toBeDefined()
        expectDiagnostic(diagnosticsOf(error), {
          position: { line: diagnosticPosition(source, at).line },
        })
      }
    },
  )
})

describe("Vite: a route's server options by one `const`", () => {
  const host = useStartHost({
    files: {
      ...routeDb,
      'src/routes/const-get.tsx': `${routeHead}const get = import.meta.env.DEV
  ? async () => new Response(db.x())
  : async () => new Response(db.y())
const pickHeaders = () => ({ 'x-db': db.x() })
export const Route = createFileRoute('/const-get')({
  server: { handlers: { GET: get } },
  headers: pickHeaders,
  component: () => <p>page</p>,
})
`,
      'src/routes/written-by-handler.tsx': `${routeHead}import { createServerOnlyFn } from '@tanstack/react-start'
let format = (v: string) => v
export const read = createServerOnlyFn(format)
export const Route = createFileRoute('/written-by-handler')({
  server: {
    handlers: {
      POST: () => {
        format = (v: string) => db.x() + v
        return new Response('ok')
      },
    },
  },
  component: () => <p>page</p>,
})
`,
      'src/routes/ssr-flag.tsx': `import { createFileRoute } from '@tanstack/react-router'
let ssr = true
if (import.meta.env.DEV) ssr = false
export const Route = createFileRoute('/ssr-flag')({
  ssr,
  component: () => <p>page</p>,
})
`,
      'src/routes/const-create-handlers.tsx': `${routeHead}const get = import.meta.env.DEV
  ? async () => new Response(db.x())
  : async () => new Response(db.y())
export const Route = createFileRoute('/const-create-handlers')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({ GET: { middleware: [], handler: get } }),
  },
  component: () => <p>page</p>,
})
`,
    },
  })

  // only server code assigns it, or it holds no server code
  test.each([
    'src/routes/written-by-handler.tsx',
    'src/routes/ssr-flag.tsx',
    'src/routes/const-create-handlers.tsx',
  ])('%s compiles in every environment', async (file) => {
    const { host: dev } = await host()
    for (const environment of ['client', 'ssr'] as const) {
      await dev.transform(`/${file}`, environment)
    }
  })

  test('compiles, and the client loads no server code', async () => {
    const run = await (
      await host()
    ).run<string>(
      `(async () => {
  const route = await import('/src/routes/const-get.tsx')
  return typeof route.Route.options.component
})()`,
      // (a new document: nothing it requests was loaded before)
      { fresh: true },
    )
    expect(run.errors).toEqual([])
    expect(run.result).toBe('function')
    expect(run.requests.filter((path) => path.includes('route-db'))).toEqual([])
  })
})

/**
 * Solid: `ref={h}` on a `let` is no assignment the module writes (Solid sets
 * it when the element renders), and the element reads the binding: a `let`
 * used as a ref and as the handler compiles, whatever its initialiser and
 * even beside an explicit write (the page keeps it anyway); an explicit
 * write with no other read is refused.
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
    [
      'a function assigned again',
      `let apply = async () => db.y()
apply = async () => db.x()
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
      await expectCompiles(startCase, ['client', 'ssr'])
    },
  )

  test('an explicit write, with no other read, is refused', async () => {
    const source = `${solidHead}let apply = async () => db.y()
apply = async () => db.x()
export const fn = createServerFn().handler(apply)
`
    const startCase = await (
      await host()
    ).case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })
})
