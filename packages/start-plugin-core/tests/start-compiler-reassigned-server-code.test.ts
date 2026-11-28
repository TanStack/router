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
 * argument. So is a route's `ssr` name.
 *
 * No read, guard or export of the binding withdraws it (user decision,
 * 2026-11-26). Not refused: a binding only server code assigns (the
 * assignments leave the client with it), a `let` nothing assigns again (a
 * Solid callback ref is no assignment), and the rewrite the error suggests
 * (one `const`). A server fn its module does not create once
 * (in a function or a block) keeps its own refusal; one in code an
 * environment erases is not reported there.
 */
import { beforeAll, describe, expect, test } from 'vitest'
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
  createStartHost,
  expectCompileError,
  serveCase,
} from './regression-helpers'
import type { StartCase, StartHost } from './start-host'

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
    'a write a `for` update holds, its test reading the binding',
    `let h: undefined | (() => Promise<string>)
for (; !h; h = async () => db.x()) {}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write a parenthesised type check holds',
    `let h: undefined | (() => Promise<string>)
if ((typeof h) === 'undefined') {
  h = async () => db.x()
}
export const fn = createServerFn().handler(h)
`,
  ],
  [
    'a write a switch on the parenthesised type holds',
    `let h: undefined | (() => Promise<string>)
switch ((typeof h)) {
  case 'undefined':
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
 * No read, guard or export of the binding withdraws the refusal (user
 * decision, 2026-11-26; cases 2, 3, 4 and 8 of the comparison with main,
 * which ships the server code in each): a guard that is not a presence check
 * of the binding, a guard through a helper, a guard through `Boolean`, and a
 * binding the client reads itself. The fix is one `const`.
 */
const exemptionsGone: Array<{ name: string; source: string; at: string }> = [
  {
    name: 'a handler a write guarded by `instanceof` assigns',
    source: `let h: any
if (!(h instanceof Function)) h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
    at: '.handler(',
  },
  {
    name: 'a handler a write guarded through a helper assigns',
    source: `const isFn = (v: unknown) => typeof v === 'function'
let h: any
if (!isFn(h)) h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
    at: '.handler(',
  },
  {
    name: 'a handler a write guarded by `Boolean` assigns',
    source: `let h: any
if (!Boolean(h)) h = async () => db.x()
export const fn = createServerFn().handler(h)
`,
    at: '.handler(',
  },
  {
    name: 'a handler the client reads too',
    source: `async function a() { return 'a' }
async function b() { return db.x() }
let h = a
if ((globalThis as any).flip) h = b
export const name = () => h.name
export const fn = createServerFn().handler(h)
`,
    at: '.handler(',
  },
  {
    name: 'createServerOnlyFn(…) on a binding a write guarded through a helper assigns',
    source: `const isFn = (v: unknown) => typeof v === 'function'
let impl: any
if (!isFn(impl)) impl = () => db.x()
export const so = createServerOnlyFn(impl)
`,
    at: 'createServerOnlyFn(impl)',
  },
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

/** The 1-based `line:column` of the write starting a line of `source` with `write`, as the error names it. */
function writeAt(source: string, write: string) {
  const { line, column } = diagnosticPosition(
    source,
    source.indexOf(`\n${write}`) + 1,
  )
  return `${line}:${column}`
}

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
  let host: StartHost
  beforeAll(async () => {
    host = await createStartHost()
    return () => host.close()
  })

  test.each(writes)('a handler: %s', async (_, body) => {
    const source = head + body
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  test.each(positions)('$name', async ({ refused, at }) => {
    const source = head + refused
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'], at)
  })

  test.each(exemptionsGone)(
    '$name is refused',
    async ({ source: body, at }) => {
      const source = head + body
      const startCase = await host.case({ ...dbFile, 'module.tsx': source })
      await expectRefused(startCase, source, ['client', 'ssr'], at)
    },
  )

  // the provider keeps handlers in place in a module awaiting at its top level
  test('a module awaiting at its top level', async () => {
    const source = `${head}${writes[0]![1]}export const ready = await Promise.resolve(true)\n`
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })

  // what the user reads: the binding, the position's API, and the two rewrites
  test.each([
    {
      at: '.handler(',
      source: head + writes[0]![1],
      name: 'h',
      write: 'h = ',
      inPlace: '.handler(async () => …)',
      value: 'async () => …',
    },
    {
      at: 'createServerOnlyFn(impl)',
      source: head + positions[0]!.refused,
      name: 'impl',
      write: 'impl = ',
      inPlace: 'createServerOnlyFn(() => …)',
      value: '() => …',
    },
    {
      at: '.validator(schema)',
      source: head + positions[3]!.refused,
      name: 'schema',
      write: 'schema = ',
      inPlace: '.validator((data) => …)',
      value: '(data) => …',
    },
  ])(
    'the error at $inPlace names the binding, its write, the API and the rewrites that work',
    async ({ at, source, name, write, inPlace, value }) => {
      const startCase = await host.case({ ...dbFile, 'module.tsx': source })
      const text = errorAt(await compileError(startCase), source, at)
      expect(text).toContain(
        `\`${name}\` is assigned elsewhere in this module (at ${writeAt(source, write)})`,
      )
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
      const startCase = await host.case({ ...dbFile, 'module.tsx': source })
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
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(
      startCase,
      source,
      ['client', 'ssr'],
      'createServerOnlyFn(impl)',
    )
  })

  // the local reads itself in its own declarator only
  test('createServerOnlyFn(…) on a local that reads itself in its declarator', async () => {
    const source = `${head}export function make(replica: boolean) {
  let impl = (): unknown => impl
  if (replica) { impl = () => db.x() }
  return createServerOnlyFn(impl)
}
`
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
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
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
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
    const served = await serveCase(host, {
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

  test('a `let` nothing assigns again compiles and stays off the client', async () => {
    const served = await serveCase(host, {
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
    const served = await serveCase(host, {
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
      const served = await serveCase(host, {
        ...dbFile,
        'module.tsx': head + rewritten,
      })
      expectNotLoaded(await served.loads(), ['./db'])
    },
  )
})

describe('Vite with RSC: every compile refuses server code passed by a name the module assigns', () => {
  let host: StartHost
  beforeAll(async () => {
    host = await createStartHost({ rsc: true })
    return () => host.close()
  })

  // the client, the SSR caller and the provider the rsc environment derives
  test('a handler: a second function', async () => {
    const source = head + writes[0]![1]
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr', 'rsc'])
  })

  test.each(positions)('$name', async ({ refused, at }) => {
    const source = head + refused
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
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
  // (no guard or client read withdraws the refusal: cases 4, 8 and 2 of the
  // comparison with main)
  'src/routes/reassigned-headers-boolean-guard.tsx': {
    source: `${routeHead}let pickHeaders: any
if (!Boolean(pickHeaders)) pickHeaders = () => ({ 'x-db': db.x() })
export const Route = createFileRoute('/reassigned-headers-boolean-guard')({
  headers: pickHeaders,
  component: () => <p>page</p>,
})
`,
    at: 'headers: pickHeaders',
  },
  'src/routes/reassigned-get-client-read.tsx': {
    source: `${routeHead}async function a() { return new Response('a') }
async function b() { return new Response(db.x()) }
let post = a
if ((globalThis as any).flip) post = b
export const Route = createFileRoute('/reassigned-get-client-read')({
  server: { handlers: { POST: post } },
  component: () => <p>{post.name}</p>,
})
`,
    at: 'POST: post',
  },
  'src/routes/reassigned-ssr-instanceof-guard.tsx': {
    source: `${routeHead}let decide: any
if (!(decide instanceof Function)) decide = () => (db.x(), true)
export const Route = createFileRoute('/reassigned-ssr-instanceof-guard')({
  ssr: decide,
  component: () => <p>page</p>,
})
`,
    at: 'ssr: decide',
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
  'src/routes/reassigned-create-handlers-spread.tsx': {
    source: `${routeHead}let more: Record<string, () => Response> = { GET: () => new Response(db.y()) }
more = { GET: () => new Response(db.x()) }
export const Route = createFileRoute('/reassigned-create-handlers-spread')({
  server: {
    handlers: ({ createHandlers }) => createHandlers({ ...more }),
  },
  component: () => <p>page</p>,
})
`,
    at: '...more',
  },
  'src/routes/reassigned-create-handlers-name.tsx': {
    source: `${routeHead}let more: Record<string, () => Response> = { GET: () => new Response(db.y()) }
more = { GET: () => new Response(db.x()) }
export const Route = createFileRoute('/reassigned-create-handlers-name')({
  server: {
    handlers: ({ createHandlers }) => createHandlers(more),
  },
  component: () => <p>page</p>,
})
`,
    at: 'createHandlers(more)',
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
  let host: StartHost
  beforeAll(async () => {
    host = await createStartHost({
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
    return () => host.close()
  })

  // what the user reads in a `createHandlers(…)` object: the argument, with
  // the callback and its middleware kept
  test('the error in a createHandlers object keeps the factory', async () => {
    const { host: dev } = host
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
    // (the write it names: the module's first outside server code)
    expect(text).toContain(
      `(at ${writeAt(refusedRoutes['src/routes/reassigned-create-handlers.tsx']!.source, 'get = ')})`,
    )
  })

  // a spread is the argument: no key to name
  test.each([
    'src/routes/reassigned-create-handlers-spread.tsx',
    'src/routes/reassigned-create-handlers-name.tsx',
  ])(
    'the error at %s, an argument without a key, names no key',
    async (file) => {
      const { host: dev } = host
      const error = await dev.transform(`/${file}`, 'client').then(
        () => undefined,
        (e: unknown) => e,
      )
      const text = diagnosticsOf(error)
        .map((d) => d.text)
        .join('\n')
      expect(text).toContain(
        'Write it in place at this argument, keeping the `createHandlers` callback and its middleware',
      )
    },
  )

  test.each(Object.keys(refusedRoutes))(
    '%s is refused in every compile',
    async (file) => {
      const { source, at } = refusedRoutes[file]!
      const { host: dev } = host
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
  let host: StartHost
  beforeAll(async () => {
    host = await createStartHost({
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
    return () => host.close()
  })

  // only server code assigns it, or it holds no server code
  test.each([
    'src/routes/written-by-handler.tsx',
    'src/routes/const-create-handlers.tsx',
  ])('%s compiles in every environment', async (file) => {
    const { host: dev } = host
    for (const environment of ['client', 'ssr'] as const) {
      await dev.transform(`/${file}`, environment)
    }
  })

  test('compiles, and the client loads no server code', async () => {
    const run = await host.run<string>(
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
  let host: StartHost
  beforeAll(async () => {
    host = await createStartHost({ framework: 'solid' })
    return () => host.close()
  })
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
      const startCase = await host.case({
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
    const startCase = await host.case({ ...dbFile, 'module.tsx': source })
    await expectRefused(startCase, source, ['client', 'ssr'])
  })
})
