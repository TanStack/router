/**
 * Inputs the V2 corpus review found untested at the compiler level (FIX-PLAN
 * §G, W3-start-v2): each is ordinary user code the docs or the public types
 * allow, compiled for the client, the SSR caller and the provider, and
 * checked through what the outputs load and do (SPEC J4.1, J4.5, J4.8,
 * J4.12, §2.1). The real builds of the same inputs are in
 * `integration/start-build-v2-*.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callProvider,
  callerRpcId,
  compileAll,
  createServerGraph,
  evaluateModule,
  moduleLoads,
  renderToHtml,
} from './regression-helpers'
import type { ModuleStub } from './regression-helpers'

const head = `import { createMiddleware, createServerFn } from '@tanstack/react-start'\n`

describe('server-only imports the client cannot resolve (V2-02)', () => {
  // `cloudflare:workers` (241 corpus files) and `node:*` resolve on the
  // server only; the compiler removes them with the server code that reads
  // them, before any bundler tries to resolve them for the client (SPEC
  // J4.12). The server outputs keep them.
  // Source: FIX-PLAN V2-02 (start-fable SF-22/MW-7; #6185, #7460, #3990).
  const platform = `import { env } from 'cloudflare:workers'
import { readFileSync } from 'node:fs'
export const withEnv = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { secret: env.SECRET } }),
)
export const readConfig = createServerFn()
  .middleware([withEnv])
  .handler(async ({ context }) => [
    context.secret,
    readFileSync('/config').toString(),
  ])
export const label = () => 'MARK_CLIENT_LABEL'
`
  const unresolvable = ['cloudflare:workers', 'node:fs']
  const platformStubs: Record<string, ModuleStub> = {
    'cloudflare:workers': { env: { SECRET: 'MARK_ENV_SECRET' } },
    'node:fs': { readFileSync: () => 'MARK_FILE' },
  }

  test('the client output compiles and loads neither specifier; the server outputs still read them', async () => {
    const compiled = await compileAll(`${head}${platform}`)
    expectNotLoaded(await moduleLoads(compiled.client), unresolvable)
    const client = await evaluateModule(compiled.client)
    expect(client.label()).toBe('MARK_CLIENT_LABEL')
    expect(callerRpcId(client.readConfig)).toEqual(expect.any(String))
    // The server runs the middleware and the handler with the platform
    // modules (stubbed here: this process is neither a worker nor a server
    // bundle).
    expect(
      await callFromClient(
        compiled,
        (module) => module.readConfig,
        undefined,
        platformStubs,
      ),
    ).toEqual(['MARK_ENV_SECRET', 'MARK_FILE'])
    // (The handler's `node:fs` read is proven by the result above: the
    // linker names Node's builtins differently from stubs.)
    for (const output of ['ssr', 'provider'] as const) {
      expect(
        await moduleLoads(compiled[output], {
          env: 'server',
          stubs: platformStubs,
        }),
        output,
      ).toContain('cloudflare:workers')
    }
  })
})

describe('a validator schema the client also uses (V2-08)', () => {
  // A schema that validates a server fn's input and also validates a form
  // on the client stays in the client with its behaviour (SPEC J4.1); a
  // schema only a validator uses is gone (J4.12).
  // Source: FIX-PLAN V2-08 (start-fable SF-3; ~3,500 validator files).
  const files = {
    '/test/src/post-schema.ts': `export interface Post {
  title: string
}
export function PostSchema(input: unknown): Post {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof (input as Post).title !== 'string'
  ) {
    throw new Error('MARK_INVALID_POST')
  }
  return { title: (input as Post).title }
}
`,
    '/test/src/draft-schema.ts': `export function DraftSchema(input: unknown): { body: string } {
  if (typeof (input as { body?: unknown }).body !== 'string') {
    throw new Error('MARK_INVALID_DRAFT')
  }
  return { body: String((input as { body: string }).body) }
}
`,
  }
  const stubs: Record<string, ModuleStub> = {
    './db.server': { save: (data: unknown) => ({ saved: data }) },
  }
  const code = `${head}import { PostSchema } from './post-schema'
import { DraftSchema } from './draft-schema'
import { save } from './db.server'
export const createPost = createServerFn({ method: 'POST' })
  .validator(PostSchema)
  .handler(async ({ data }) => save(data))
export const saveDraft = createServerFn({ method: 'POST' })
  .validator(DraftSchema)
  .handler(async ({ data }) => save(data))
export function validateForm(input: unknown) {
  return PostSchema(input)
}
`

  test('the client form validates with the schema, the validator-only schema is not loaded, the provider rejects invalid input', async () => {
    const compiled = await compileAll(code, { files })
    expectNotLoaded(await moduleLoads(compiled.client, { files }), [
      '/test/src/draft-schema.ts',
      './db.server',
    ])
    const client = await evaluateModule(compiled.client, stubs, { files })
    expect(client.validateForm({ title: 'hello' })).toEqual({ title: 'hello' })
    expect(() => client.validateForm({})).toThrow('MARK_INVALID_POST')
    expect(callerRpcId(client.createPost)).toEqual(expect.any(String))
    expect(callerRpcId(client.saveDraft)).toEqual(expect.any(String))
    // The provider validates: an invalid call is rejected, a valid one saved.
    expect(
      await callProvider(compiled, 'createPost', stubs, { title: 'hello' }),
    ).toEqual({ saved: { title: 'hello' } })
    await expect(
      callProvider(compiled, 'createPost', stubs, { nope: true }),
    ).rejects.toThrow('MARK_INVALID_POST')
    expect(
      await callProvider(compiled, 'saveDraft', stubs, { body: 'draft' }),
    ).toEqual({ saved: { body: 'draft' } })
  })
})

describe('.jsx modules (V2-11)', () => {
  // Untyped `.jsx` files with JSX and a server fn (532 corpus files) are
  // compiled like `.tsx` ones (SPEC §2.1): the client gets the stub and no
  // server code, the handler runs on the provider, the JSX renders.
  // Source: FIX-PLAN V2-11 (start-fable SF-19).
  const id = '/test/src/fns.jsx'
  const code = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const getUser = createServerFn().handler(async () => db.user())
export function Badge({ name }) {
  return <span className="badge">{name}</span>
}
`
  const stubs: Record<string, ModuleStub> = {
    './db.server': { db: { user: () => 'MARK_USER' } },
  }

  test('the client calls the server by id without the handler, and renders the JSX', async () => {
    const compiled = await compileAll(code, { id })
    expectNotLoaded(await moduleLoads(compiled.client, { id }), ['./db.server'])
    expect(
      await callFromClient(
        compiled,
        (module) => module.getUser,
        undefined,
        stubs,
      ),
    ).toBe('MARK_USER')
    for (const output of ['client', 'ssr'] as const) {
      const module =
        output === 'client'
          ? await evaluateModule(compiled.client, stubs)
          : await createServerGraph(compiled, stubs).ssr()
      expect(await renderToHtml(module.Badge({ name: 'Ada' })), output).toBe(
        '<span class="badge">Ada</span>',
      )
    }
  })
})

describe('a server fn builder reused as middleware (V2-25)', () => {
  // `createServerFn().middleware([auth])` passed in another server fn's
  // `.middleware([...])` contributes `auth` (SPEC J4.5): the client runs
  // `auth.client()` and ships no `auth.server()` code; the provider runs
  // `auth.server()` before the handler (J4.8).
  // Source: FIX-PLAN V2-25 (start-fable SF-6; runtime createServerFn.ts
  // TSS_SERVER_FUNCTION_FACTORY).
  const code = `${head}import { audit } from './audit.server'
export const auth = createMiddleware({ type: 'function' })
  .client(({ next }) => next({ sendContext: { from: 'client' } }))
  .server(({ next, context }) =>
    next({ context: { user: audit(context.from) } }),
  )
const authed = createServerFn().middleware([auth])
export const whoAmI = createServerFn()
  .middleware([authed])
  .handler(async ({ context }) => context.user)
`
  const stubs: Record<string, ModuleStub> = {
    './audit.server': { audit: (from: string) => `user(${from})` },
  }

  test('the client call runs auth.client(), the provider runs auth.server() then the handler', async () => {
    const compiled = await compileAll(code)
    expectNotLoaded(await moduleLoads(compiled.client), ['./audit.server'])
    const client = await evaluateModule(compiled.client, stubs)
    expect(client.auth.options.server).toBeUndefined()
    expect(client.auth.options.client).toBeTypeOf('function')
    // `from: 'client'` reaches the server only when `auth.client()` ran.
    expect(
      await callFromClient(
        compiled,
        (module) => module.whoAmI,
        undefined,
        stubs,
      ),
    ).toBe('user(client)')
    const ssr = await createServerGraph(compiled, stubs).ssr()
    expect(await ssr.whoAmI()).toBe('user(client)')
  })
})

describe('createServerFn options by identifier or spread (V2-31)', () => {
  // `createServerFn(opts)` and `createServerFn({ ...opts })` are ordinary
  // input (SPEC J4.5): each env keeps the options' `method`, the client gets
  // a stub, the provider the handler.
  // Source: FIX-PLAN V2-31 (start-fable SF-2; 26 corpus files).
  const code = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const opts = { method: 'POST' } as const
export const byIdentifier = createServerFn(opts).handler(async () => db.x())
export const bySpread = createServerFn({ ...opts }).handler(async () => db.x())
`
  const stubs: Record<string, ModuleStub> = {
    './db.server': { db: { x: () => 'MARK_X' } },
  }

  test.each(['byIdentifier', 'bySpread'])(
    '%s: each env keeps the method, the client calls by id, the provider runs the handler',
    async (name) => {
      const compiled = await compileAll(code)
      expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
      const client = await evaluateModule(compiled.client, stubs)
      const ssr = await createServerGraph(compiled, stubs).ssr()
      for (const [output, fn] of [
        ['client', client[name]],
        ['ssr', ssr[name]],
      ] as const) {
        // Start exposes the declared method on the server fn.
        expect(fn.method, output).toBe('POST')
      }
      expect(callerRpcId(client[name])).toEqual(expect.any(String))
      expect(
        await callFromClient(
          compiled,
          (module) => module[name],
          undefined,
          stubs,
        ),
      ).toBe('MARK_X')
      expect(await ssr[name]()).toBe('MARK_X')
      expect(await callProvider(compiled, name, stubs)).toBe('MARK_X')
    },
  )
})
