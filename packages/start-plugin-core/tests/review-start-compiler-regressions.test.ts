/**
 * Failing regression tests for Critical & High bugs found during review of PR #8817
 * in `@tanstack/start-plugin-core` (security leaks, DCE leaks, builder escapes,
 * `<ClientOnly>`, `<Hydrate>`, RSC CSS, `Queue`, and dev basepath planning).
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { shouldRewriteDevBasepath } from '../src/planning'
import { Queue } from '../src/queue'
import {
  callFromClient,
  compileError,
  serveCase,
  useStartHost,
} from './regression-helpers'
import { useStartHost as useStartHostRaw } from './start-host'

const DB = `export const db = {
  x: () => 'from the server',
  getServerDefault: () => 'server-default',
  createServerClient: () => ({ query: () => 'from the server' }),
}
export const getServerDefault = db.getServerDefault
export const createServerClient = db.createServerClient
`

const host = useStartHost({
  start: { importProtection: { enabled: false } },
  files: {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        verbatimModuleSyntax: true,
      },
    }),
  },
})

describe('PR #8817 security leaks & escape bypasses in TanStack Start', () => {
  test('zero-cast escape via createStart + start.getOptions() must not ship server code to the client', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { createStart, createMiddleware } from '@tanstack/react-start'
const openMw = createMiddleware({ type: 'function' }).client(({ next }) => next())
const start = createStart(() => ({ functionMiddleware: [openMw] }))
export async function run() {
  const opts = await start.getOptions()
  return opts.functionMiddleware![0].server(async ({ next }) =>
    next({ context: { secret: 'MARK_START_GET_OPTIONS_SECRET' } }),
  )
}
`,
    })
    const failure = await compileError(startCase, 'client')
    if (!failure) {
      expect(await startCase.served('module.tsx', 'client')).not.toContain(
        'MARK_START_GET_OPTIONS_SECRET',
      )
    }
  })

  test('builder escape via createMiddleware().client().options.client must not ship server code to the client', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const mw = createMiddleware({ type: 'function' }).client(() => createServerFn as any)
export const leaked = (mw.options.client as any)().handler(async () => 'MARK_OPTIONS_CLIENT_SECRET')
`,
    })
    const failure = await compileError(startCase, 'client')
    if (!failure) {
      expect(await startCase.served('module.tsx', 'client')).not.toContain(
        'MARK_OPTIONS_CLIENT_SECRET',
      )
    }
  })

  test('public __opts second argument of createMiddleware must not ship server code to the client', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware(undefined, {
  type: 'request',
  server: async ({ next }: any) => {
    const secret = 'MARK_MIDDLEWARE_OPTS_SECRET'
    return next({ context: { secret } })
  },
} as any)
`,
    })
    const failure = await compileError(startCase, 'client')
    if (!failure) {
      expect(await startCase.served('module.tsx', 'client')).not.toContain(
        'MARK_MIDDLEWARE_OPTS_SECRET',
      )
    }
  })

  test('isoFnLink must not clobber .server(() => createServerFn()) when .client() returns a stub', async () => {
    const startCase = await (
      await host()
    ).case({
      'builder.ts': `import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
export const getFn = createIsomorphicFn()
  .server(() => createServerFn())
  .client(() => ({ handler: () => () => {} }))
`,
      'module.tsx': `import { getFn } from './builder'
export const leak = getFn().handler(async () => 'MARK_ISO_FN_LEAK_SECRET')
`,
    })
    const failure = await compileError(startCase, 'client')
    if (!failure) {
      expect(await startCase.served('module.tsx', 'client')).not.toContain(
        'MARK_ISO_FN_LEAK_SECRET',
      )
    }
  })

  test('local alias of a function parameter passed to createServerOnlyFn fails the client compile', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
export function wrap(impl: () => string) {
  const fn = impl
  return createServerOnlyFn(fn)
}
`,
    })
    const failure = await compileError(startCase, 'client')
    expect(failure).toBeDefined()
  })
})

describe('PR #8817 end-to-end DCE server-import leaks in TanStack Start', () => {
  test('phase-ordering leak: module-level destructuring default used only via a top-level server helper does not load db.server on client', async () => {
    const c = await serveCase(await host(), {
      'db.server.ts': DB,
      'shared.ts': `export const getSharedConfig = (): { clientKey: string; serverKey?: string } => ({ clientKey: 'ok' })\n`,
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import { getServerDefault } from './db.server'
import { getSharedConfig } from './shared'

const { clientKey, serverKey = getServerDefault() } = getSharedConfig()
function serverOnlyHelper() {
  return serverKey
}

export const clientValue = clientKey
export const fn = createServerFn().handler(async () => serverOnlyHelper())
`,
    })
    await c.client(`return module.clientValue`)
    expectNotLoaded(await c.loads(), ['./db.server'])
  })

  test('intra-function leak: self-recursive local helper used only by createServerOnlyFn does not load db.server on client', async () => {
    const c = await serveCase(await host(), {
      'db.server.ts': DB,
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'

export function makeFetcher() {
  function retry(n: number): string {
    return n <= 0 ? db.x() : retry(n - 1)
  }
  return createServerOnlyFn(() => retry(3))
}
`,
    })
    await c.client(`return typeof module.makeFetcher`)
    expectNotLoaded(await c.loads(), ['./db.server'])
  })

  test('type-provenance leak: local type alias using typeof serverClient does not load db.server on client', async () => {
    const c = await serveCase(await host(), {
      'db.server.ts': DB,
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import { createServerClient } from './db.server'

const serverClient = createServerClient()
type Client = typeof serverClient

export const fn = createServerFn().handler(async (c: Client) => c)
`,
    })
    await c.client(`return typeof module.fn`)
    expectNotLoaded(await c.loads(), ['./db.server'])
  })
})

describe('PR #8817 compiler correctness bugs in TanStack Start', () => {
  test('self-closing <ClientOnly children={...} /> strips browser-only children on the server', async () => {
    const c = await serveCase(await host(), {
      'module.tsx': `import { ClientOnly } from '@tanstack/react-router'
export function Page() {
  return <ClientOnly children={<div>MARK_BROWSER_ONLY</div>} />
}
`,
    })
    expect(c.code.ssr).not.toContain('MARK_BROWSER_ONLY')
  })

  test('hoisted server fn inside an object literal preserves method evaluation order between server and client', async () => {
    const c = await serveCase(await host(), {
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
let ready = false
function init() {
  ready = true
  return 'done'
}
export const api = {
  init: init(),
  fn: createServerFn({ method: ready ? 'POST' : 'GET' }).handler(async () => 'ok'),
}
`,
    })
    expect(await callFromClient(c, 'module.api.fn')).toBe('ok')
  })

  test('React <Hydrate> refuses capturing a reassigned function declaration just like a reassigned let', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  function label() {
    return 'a'
  }
  label = () => 'b'
  return (
    <Hydrate when="visible">
      <button onClick={() => console.log(label())}>click</button>
    </Hydrate>
  )
}
`,
    })
    const failure = await compileError(startCase, 'client')
    expect(failure).toBeDefined()
  })
})

describe('PR #8817 Vite RSC CSS regressions', () => {
  const rscHost = useStartHostRaw({ rsc: true })

  test(
    'renderToReadableStream(node, options) still injects RSC CSS when options are passed',
    { timeout: 20_000 },
    async () => {
      const c = await (
        await rscHost()
      ).case({
        'card.css': `.card { color: red }\n`,
        'module.tsx': `import { renderToReadableStream } from '@tanstack/react-start/rsc'
import './card.css'

function Card() {
  return <div className="card">hello</div>
}

export async function render() {
  const stream = renderToReadableStream(<Card />, { onError: () => {} })
  return stream
}
`,
      })
      const served = await c.served('module.tsx', 'rsc')
      expect(served).toContain('card.css')
      expect(served).toMatch(/__tss|loadCss|Asset/)
    },
  )
})

describe('PR #8817 Queue and dev basepath unit regressions', () => {
  test('two Queue instances with default options do not share the same mutable task queue', async () => {
    const ran: Array<string> = []
    const q1 = new Queue()
    const q2 = new Queue()
    q1.add(() => {
      ran.push('from-q1')
    })
    await q2.start()
    expect(ran).toEqual([])
  })

  test('shouldRewriteDevBasepath returns false for an absolute URL base', () => {
    expect(
      shouldRewriteDevBasepath({
        command: 'serve',
        middlewareMode: false,
        publicBase: 'https://cdn.example.com/app/',
        routerBasepath: '/',
      }),
    ).toBe(false)
  })
})
