/**
 * Inputs the V2 corpus review found untested at the compiler level (FIX-PLAN
 * §G, W3-start-v2): each is ordinary user code the docs or the public types
 * allow, served by the public Start host (`./start-host`) and checked
 * through what each environment loads and does (SPEC J4.1, J4.5, J4.8,
 * J4.12, §2.1): the client in a real page, server fns called from the
 * client through the dev server and from server code in a real request.
 * The real builds of the same inputs are in
 * `integration/start-build-v2-*.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  inPage,
  serveCase,
  useStartHost,
} from './regression-helpers'
import type { Plugin } from 'vite'

/**
 * `cloudflare:workers` as a Workers platform plugin gives it to the server
 * environments (a module the client cannot resolve).
 */
function workersPlatform(): Plugin {
  const id = '\0cloudflare:workers'
  return {
    name: 'test:cloudflare-workers',
    applyToEnvironment: (environment) => environment.name !== 'client',
    resolveId: (source) => (source === 'cloudflare:workers' ? id : null),
    load: (loaded) =>
      loaded === id
        ? `export const env = { SECRET: 'MARK_ENV_SECRET' }\n`
        : null,
  }
}

const host = useStartHost({ plugins: [workersPlatform()] })

const head = `import { createMiddleware, createServerFn } from '@tanstack/react-start'\n`

describe('server-only imports the client cannot resolve (V2-02)', () => {
  // `cloudflare:workers` (241 corpus files) and `node:*` resolve on the
  // server only; the compiler removes them with the server code that reads
  // them, before any bundler tries to resolve them for the client (SPEC
  // J4.12). The server keeps them.
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
    readFileSync(new URL('./config.txt', import.meta.url)).toString(),
  ])
export const label = () => 'MARK_CLIENT_LABEL'
`
  const unresolvable = ['cloudflare:workers', 'node:fs']

  test('the client compiles and loads neither specifier; the server still reads them', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}${platform}`,
      'config.txt': 'MARK_FILE',
    })
    const loads = await served.loads()
    expectNotLoaded(loads, unresolvable)
    expect(
      loads.filter((loaded) =>
        /cloudflare|node:fs|__vite-browser-external/.test(loaded),
      ),
    ).toEqual([])
    expect(
      await inPage(
        served,
        `return { label: module.label(), url: typeof module.readConfig.url }`,
      ),
    ).toEqual({ label: 'MARK_CLIENT_LABEL', url: 'string' })
    // The server runs the middleware and the handler with the platform
    // modules: a call from the client reaches them through the server.
    expect(await callFromClient(served, 'module.readConfig')).toEqual([
      'MARK_ENV_SECRET',
      'MARK_FILE',
    ])
    expect(await callOnServer(served, 'module.readConfig')).toEqual([
      'MARK_ENV_SECRET',
      'MARK_FILE',
    ])
    expect(
      (await served.serverLoads()).some((loaded) =>
        loaded.includes('cloudflare:workers'),
      ),
      'the SSR environment loads cloudflare:workers',
    ).toBe(true)
  })
})

describe('a validator schema the client also uses (V2-08)', () => {
  // A schema that validates a server fn's input and also validates a form
  // on the client stays in the client with its behaviour (SPEC J4.1); a
  // schema only a validator uses is gone (J4.12).
  // Source: FIX-PLAN V2-08 (start-fable SF-3; ~3,500 validator files).
  const files = {
    'post-schema.ts': `export interface Post {
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
    'draft-schema.ts': `export function DraftSchema(input: unknown): { body: string } {
  if (typeof (input as { body?: unknown }).body !== 'string') {
    throw new Error('MARK_INVALID_DRAFT')
  }
  return { body: String((input as { body: string }).body) }
}
`,
    'db.server.ts': `export const save = (data: unknown) => ({ saved: data })\n`,
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

  test('the client form validates with the schema, the validator-only schema is not loaded, the server rejects invalid input', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': code,
      ...files,
    })
    expectNotLoaded(await served.loads(), ['./draft-schema', './db.server'])
    expect(
      await inPage(
        served,
        `return {
  valid: module.validateForm({ title: 'hello' }),
  invalid: await settle(() => module.validateForm({})),
  urls: [typeof module.createPost.url, typeof module.saveDraft.url],
}`,
      ),
    ).toEqual({
      valid: { title: 'hello' },
      invalid: {
        thrown: { name: 'Error', message: 'MARK_INVALID_POST' },
      },
      urls: ['string', 'string'],
    })
    // The server validates: an invalid call is rejected, a valid one saved.
    expect(
      await callFromClient(served, 'module.createPost', { title: 'hello' }),
    ).toEqual({ saved: { title: 'hello' } })
    await expect(
      callFromClient(served, 'module.createPost', { nope: true }),
    ).rejects.toThrow('MARK_INVALID_POST')
    expect(
      await callFromClient(served, 'module.saveDraft', { body: 'draft' }),
    ).toEqual({ saved: { body: 'draft' } })
  })
})

describe('.jsx modules (V2-11)', () => {
  // Untyped `.jsx` files with JSX and a server fn (532 corpus files) are
  // compiled like `.tsx` ones (SPEC §2.1): the client gets the stub and no
  // server code, the handler runs on the server, the JSX renders.
  // Source: FIX-PLAN V2-11 (start-fable SF-19).
  const code = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const getUser = createServerFn().handler(async () => db.user())
export function Badge({ name }) {
  return <span className="badge">{name}</span>
}
`

  test('the client calls the server by id without the handler, and renders the JSX', async () => {
    const served = await serveCase(
      await host(),
      {
        'fns.jsx': code,
        'db.server.ts': `export const db = { user: () => 'MARK_USER' }\n`,
        'render.server.tsx': `import { renderToStaticMarkup } from 'react-dom/server'
import { Badge } from './fns.jsx'
export const html = () => renderToStaticMarkup(<Badge name="Ada" />)
`,
        'render.client.tsx': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Badge } from './fns.jsx'
export function html() {
  const container = document.createElement('div')
  const root = createRoot(container)
  flushSync(() => root.render(createElement(Badge, { name: 'Ada' })))
  const markup = container.innerHTML
  root.unmount()
  return markup
}
`,
      },
      { file: 'fns.jsx' },
    )
    expectNotLoaded(await served.loads('fns.jsx'), ['./db.server'])
    expect(
      await callFromClient(served, 'module.getUser', undefined, {
        file: 'fns.jsx',
      }),
    ).toBe('MARK_USER')
    expect(
      await inPage(served, 'return module.html()', {
        file: 'render.client.tsx',
      }),
      'client',
    ).toBe('<span class="badge">Ada</span>')
    expect((await served.ssr('render.server.tsx')).html(), 'ssr').toBe(
      '<span class="badge">Ada</span>',
    )
  })
})

describe('a server fn builder reused as middleware (V2-25)', () => {
  // `createServerFn().middleware([auth])` passed in another server fn's
  // `.middleware([...])` contributes `auth` (SPEC J4.5): the client runs
  // `auth.client()` and ships no `auth.server()` code; the server runs
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

  test('the client call runs auth.client(), the server runs auth.server() then the handler', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': code,
      'audit.server.ts': `export const audit = (from: string) => \`user(\${from})\`\n`,
    })
    expectNotLoaded(await served.loads(), ['./audit.server'])
    expect(
      await inPage(
        served,
        `return { server: module.auth.options.server === undefined, client: typeof module.auth.options.client }`,
      ),
    ).toEqual({ server: true, client: 'function' })
    // `from: 'client'` reaches the server only when `auth.client()` ran.
    expect(await callFromClient(served, 'module.whoAmI')).toBe('user(client)')
    expect(await callOnServer(served, 'module.whoAmI')).toBe('user(client)')
  })
})

describe('createServerFn options by identifier or spread (V2-31)', () => {
  // `createServerFn(opts)` and `createServerFn({ ...opts })` are ordinary
  // input (SPEC J4.5): each env keeps the options' `method`, the client
  // calls through the server, the server runs the handler.
  // Source: FIX-PLAN V2-31 (start-fable SF-2; 26 corpus files).
  const code = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const opts = { method: 'POST' } as const
export const byIdentifier = createServerFn(opts).handler(async () => db.x())
export const bySpread = createServerFn({ ...opts }).handler(async () => db.x())
`

  test.each(['byIdentifier', 'bySpread'])(
    '%s: each env keeps the method, the client calls by id, the server runs the handler',
    async (name) => {
      const served = await serveCase(await host(), {
        'module.tsx': code,
        'db.server.ts': `export const db = { x: () => 'MARK_X' }\n`,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      // Start exposes the declared method on the server fn.
      expect(
        await inPage(
          served,
          `return { method: module.${name}.method, url: typeof module.${name}.url }`,
        ),
        'client',
      ).toEqual({ method: 'POST', url: 'string' })
      expect((await served.ssr())[name].method, 'ssr').toBe('POST')
      expect(await callFromClient(served, `module.${name}`)).toBe('MARK_X')
      expect(await callOnServer(served, `module.${name}`)).toBe('MARK_X')
    },
  )
})
