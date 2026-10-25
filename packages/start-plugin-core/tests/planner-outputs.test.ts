/**
 * The Start planners on the compiler core, in process (not oracle: a fast
 * check of the output shapes of `start-env` and `rsc-css` on an in-memory
 * host, before the public Start host of the oracle tests exercises them).
 */
import { describe, expect, test } from 'vitest'
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../src/compiler/recognizer'
import { START_ENV, startPlanners } from '../src/planners'
import type { StartEnvConfig, StartEnvFacts } from '../src/planners'
import type {
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  HostServices,
} from '@tanstack/router-utils/compiler'

class Host implements HostServices {
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  constructor(readonly files: Record<string, string>) {
    this.rawFacts = new RawFactsCache({
      readFile: (p) => Promise.resolve(this.files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      recognizer: startRecognizer(),
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }
  resolve(specifier: string, importer: string) {
    if (!specifier.startsWith('.')) {
      return Promise.resolve(null)
    }
    const dir = importer.split('?')[0]!.replace(/\/[^/]*$/, '')
    const joined = `${dir}/${specifier}`.replace(/\/\.\//g, '/')
    for (const c of [joined, `${joined}.ts`, `${joined}.tsx`]) {
      if (c in this.files) {
        return Promise.resolve({ id: c })
      }
    }
    return Promise.resolve(null)
  }
  readFile(p: string) {
    return Promise.resolve(this.files[p] ?? null)
  }
  loadVirtual() {
    return Promise.resolve(null)
  }
}

type Env = 'client' | 'ssr' | 'ssr-caller' | 'rsc'

function envInfo(env: Env): EnvInfo {
  return {
    name: env === 'ssr-caller' ? 'ssr' : env,
    type: env === 'client' ? 'client' : 'server',
    isProvider: env === 'ssr' || env === 'rsc',
    mode: 'build',
    bundler: 'test',
    framework: 'react',
    conditions: [],
    routerSplit: env === 'client',
  }
}

async function compile(
  files: Record<string, string>,
  env: Env,
  id = '/app/module.tsx',
  opts: Partial<StartEnvConfig> = {},
): Promise<CompileOutput | null> {
  const host = new Host(files)
  const config: StartEnvConfig = {
    framework: 'react',
    root: '/app',
    providerSeparate: env === 'ssr-caller' || env === 'rsc',
    idMode: 'default',
    ...opts,
  }
  return compileModule(
    {
      id,
      code: files[id.split('?')[0]!]!,
      env: envInfo(env),
      planners: startPlanners({ rscCss: env === 'rsc' }),
      config: {
        configKey: 'cfg',
        perPlanner: {
          [START_ENV]: config,
          'rsc-css': { loadCssExpression: 'import.meta.viteRsc.loadCss()' },
        },
      },
      wantMap: false,
    },
    host,
    host.caches,
  )
}

const head = `import { createServerFn } from '@tanstack/react-start'\n`

describe('start-env: server fns', () => {
  const files = {
    '/app/module.tsx': `${head}import { db } from './db.server'
import { schema } from './schema'
export const fn = createServerFn({ method: 'POST' }).validator(schema).handler(async () => db.x())
export const label = () => 'client'
`,
    '/app/db.server.ts': `export const db = { x: () => 'x' }\n`,
    '/app/schema.ts': `export const schema = (d: unknown) => d\n`,
  }

  test('client: a stub keeps the builder, drops the validator and the handler-only imports', async () => {
    const out = (await compile(files, 'client'))!
    expect(out.code).toContain(
      "import { createClientRpc as tsrClientRpc } from '@tanstack/react-start/client-rpc'",
    )
    expect(out.code).toContain(
      "createServerFn({ method: 'POST' }).handler(tsrClientRpc(",
    )
    expect(out.code).not.toContain('db.server')
    expect(out.code).not.toContain('schema')
    expect(out.code).toContain("export const label = () => 'client'")
    const facts = out.facts.planners[START_ENV] as StartEnvFacts
    expect(facts.serverFns).toHaveLength(1)
    expect(facts.serverFns[0]).toMatchObject({
      rootRel: 'module.tsx',
      stableKey: 'fn',
      name: 'fn',
    })
  })

  test('provider: the handler stays in place next to a createServerRpc export', async () => {
    const out = (await compile(files, 'ssr'))!
    expect(out.code).toContain(
      "import { createServerRpc as tsrServerRpc } from '@tanstack/react-start/server-rpc'",
    )
    expect(out.code).toMatch(
      /const fn_createServerFn_handler = tsrServerRpc\(\{ id: '[^']+', name: 'fn', filename: 'module\.tsx' \}, \(opts\) => fn\.__executeServer\(opts\)\)\nexport \{ fn_createServerFn_handler \}/,
    )
    expect(out.code).toContain(
      '.validator(schema).handler(fn_createServerFn_handler, async () => db.x())',
    )
    expect(out.code).toContain("from './db.server'")
  })

  test('ssr caller with a separate provider: an ssr rpc stub keeps the validator', async () => {
    const out = (await compile(files, 'ssr-caller'))!
    expect(out.code).toContain(
      "createServerFn({ method: 'POST' }).validator(schema).handler(tsrSsrRpc(",
    )
    expect(out.code).not.toContain('db.server')
  })

  test('the ids agree between the client and the provider', async () => {
    const client = (await compile(files, 'client'))!
    const ssr = (await compile(files, 'ssr'))!
    const id = /tsrClientRpc\('([^']+)'\)/.exec(client.code)![1]
    expect(ssr.code).toContain(`id: '${id}'`)
    expect(id).toHaveLength(22)
  })

  test('a validator link on a stored builder is stripped where it is declared', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `${head}import { schema } from './schema'
const withPost = createServerFn({ method: 'POST' }).validator(schema)
export const fn = withPost.handler(async ({ data }) => data)
export const other = withPost.handler(async ({ data }) => data)
`,
        '/app/schema.ts': `export const schema = (d: unknown) => d\n`,
      },
      'client',
    ))!
    expect(out.code).toContain(
      "const withPost = createServerFn({ method: 'POST' })\n",
    )
    expect(out.code).not.toContain('schema')
    expect(
      (out.facts.planners[START_ENV] as StartEnvFacts).serverFns.map(
        (f) => f.stableKey,
      ),
    ).toEqual(['fn', 'other'])
  })

  test('a server fn through a user factory of another module', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import { authed } from './factory'
import { db } from './db.server'
export const fn = authed().middleware([]).handler(async () => db.x())
`,
        '/app/factory.ts': `import { createServerFn } from '@tanstack/react-start'
export const authed = () => createServerFn({ method: 'GET' })
`,
        '/app/db.server.ts': `export const db = { x: () => 'x' }\n`,
      },
      'client',
    ))!
    expect(out.code).toContain('authed().middleware([]).handler(tsrClientRpc(')
    expect(out.code).not.toContain('db.server')
  })

  test('a namespace import of a module re-exporting the factories', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import * as F from './factories'
import { db } from './db.server'
export const fn = F.createServerFn().handler(async () => db.x())
export const iso = F.createIsomorphicFn().server(() => db.w()).client(() => 'client')
`,
        '/app/factories.ts': `export { createServerFn, createIsomorphicFn } from '@tanstack/react-start'\n`,
        '/app/db.server.ts': `export const db = { x: () => 'x', w: () => 'w' }\n`,
      },
      'client',
    ))!
    expect(out.code).toContain('F.createServerFn().handler(tsrClientRpc(')
    expect(out.code).toContain("export const iso = () => 'client'")
    expect(out.code).not.toContain('db.server')
  })

  test('a default-exported builder imported as default', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import mw from './mw'
import authed from './builders'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })
export const fn = authed.handler(async () => db.x())
`,
        '/app/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export default createMiddleware({ type: 'function' })
`,
        '/app/builders.ts': `import { createServerFn } from '@tanstack/react-start'
const authed = createServerFn({ method: 'POST' })
export default authed
`,
        '/app/db.server.ts': `export const db = { x: () => 'x', log: () => {} }\n`,
      },
      'client',
    ))!
    expect(out.code).toContain('export const logged = mw\n')
    expect(out.code).toContain('authed.handler(tsrClientRpc(')
    expect(out.code).not.toContain('db.server')
  })

  test('an import alias cycle settles', async () => {
    const out = await compile(
      {
        '/app/module.tsx': `import { createServerOnlyFn } from './factory-a'
export const myFn = createServerOnlyFn(() => 'server-only-value')
`,
        '/app/factory-a.ts': `import { createServerOnlyFn } from './factory-b'\nexport { createServerOnlyFn }\n`,
        '/app/factory-b.ts': `import { createServerOnlyFn } from './factory-a'\nexport { createServerOnlyFn }\n`,
      },
      'client',
    )
    expect(out?.code ?? '').toContain('server-only-value')
  })

  test('a builder passing through an identity helper', async () => {
    const files = {
      '/app/module.tsx': `${head}import { schema } from './schema'
function applyStep<T>(builder: T) {
  return builder
}
export const fn = applyStep(
  createServerFn({ method: 'POST' }).validator(schema),
).handler(async ({ data }) => data)
const wrap = <T,>(x: T) => x
export const wrapped = wrap(wrap(createServerFn().handler(async () => 'w')))
`,
      '/app/schema.ts': `export const schema = (d: unknown) => d\n`,
    }
    const client = (await compile(files, 'client'))!
    expect(client.code).toContain(
      "applyStep(\n  createServerFn({ method: 'POST' }),\n).handler(tsrClientRpc(",
    )
    expect(client.code).toContain(
      'wrap(wrap(createServerFn().handler(tsrClientRpc(',
    )
    expect(client.code).not.toContain('schema')
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.code).toContain(
      '.handler(fn_createServerFn_handler, async ({ data }) => data)',
    )
    expect(ssr.code).toContain(
      'wrap(wrap(createServerFn().handler(wrapped_createServerFn_handler, async',
    )
  })

  test('a computed member on a builder is an error on the client', async () => {
    const files = {
      '/app/module.tsx': `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn()['server'](() => 'x').client(() => 'client')
`,
    }
    const client = (await compile(files, 'client'))!
    expect(client.diagnostics.map((d) => d.severity)).toEqual(['error'])
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.diagnostics).toEqual([])
    expect(ssr.code).toContain(
      "createIsomorphicFn()['server'](() => 'x').client(() => 'client')",
    )
  })

  test('a nested server fn capturing a local is refused in every env', async () => {
    const files = {
      '/app/module.tsx': `${head}export function make(id: string) {
  const inner = createServerFn().handler(async () => id)
  return inner
}
`,
    }
    for (const env of ['client', 'ssr'] as const) {
      const out = (await compile(files, env))!
      expect(out.diagnostics.map((d) => d.severity)).toEqual(['error'])
    }
  })

  test('a nested server fn is hoisted on the server and stubbed in place on the client', async () => {
    const files2 = {
      '/app/module.tsx': `${head}import { db } from './db.server'
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}
`,
      '/app/db.server.ts': `export const db = { inner: () => 'inner' }\n`,
    }
    const client = (await compile(files2, 'client'))!
    expect(client.code).toContain(
      'const inner = createServerFn().handler(tsrClientRpc(',
    )
    expect(client.code).not.toContain('db.server')
    const ssr = (await compile(files2, 'ssr'))!
    expect(ssr.code).toContain(
      'const tsrServerFn$inner = createServerFn().handler(inner_make_createServerFn_handler, async () => db.inner())',
    )
    expect(ssr.code).toContain('const inner = tsrServerFn$inner')
    expect(ssr.code).toContain("name: 'inner'")
  })

  test('a nested server fn capturing a local is refused at the capture', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `${head}export function make(id: string) {
  const inner = createServerFn().handler(async () => id)
  return inner
}
`,
      },
      'ssr',
    ))!
    expect(out.diagnostics.map((d) => d.severity)).toEqual(['error'])
    expect(out.diagnostics[0]!.range).toBeDefined()
  })

  test('a server fn without a handler argument is an error at the chain', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `${head}export const fn = createServerFn().handler()\n`,
      },
      'client',
    ))!
    expect(out.diagnostics[0]).toMatchObject({ severity: 'error' })
  })
})

describe('start-env: middleware, isomorphic and env-only fns', () => {
  test('client: middleware keeps .client() and drops .server()/.validator() with their imports', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from './db.server'
export const mw = createMiddleware({ type: 'function' })
  .validator(z.number())
  .client(() => 'client')
  .server(async ({ next }) => { db.x(); return next() })
`,
        '/app/db.server.ts': `export const db = { x: () => 'x' }\n`,
      },
      'client',
    ))!
    expect(out.code).toMatch(
      /createMiddleware\(\{ type: 'function' \}\)\s*\.client\(\(\) => 'client'\)\s*\n/,
    )
    expect(out.code).not.toContain('.server(')
    expect(out.code).not.toContain('.validator(')
    expect(out.code).not.toContain('zod')
    expect(out.code).not.toContain('db.server')
  })

  test('isomorphic fns select the environment implementation', async () => {
    const files = {
      '/app/module.tsx': `import { createIsomorphicFn } from '@tanstack/react-start'
export const noImpl = createIsomorphicFn()
export const both = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const direct = () => createIsomorphicFn().client(() => 'c').server(() => 's')()
const base = createIsomorphicFn().server(() => 'base-server')
export const stored = base.client(() => 'base-client')
`,
    }
    const client = (await compile(files, 'client'))!
    expect(client.code).toContain('export const noImpl = () => {}')
    expect(client.code).toContain("export const both = () => 'client'")
    expect(client.code).toContain("export const direct = () => (() => 'c')()")
    expect(client.code).not.toContain('base-server')
    expect(client.code).toContain("export const stored = () => 'base-client'")
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.code).toContain("export const both = () => 'server'")
    expect(ssr.code).toContain("const base = () => 'base-server'")
    expect(ssr.code).toContain('export const stored = base')
  })

  test('env-only fns run in their environment and throw elsewhere', async () => {
    const files = {
      '/app/module.tsx': `import { createServerOnlyFn, createClientOnlyFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const s = createServerOnlyFn(() => secret())
export const c = createClientOnlyFn(() => 'window')
export const bound = createServerOnlyFn(() => secret()).bind(null)
`,
      '/app/secret.server.ts': `export const secret = () => 'secret'\n`,
    }
    const client = (await compile(files, 'client'))!
    expect(client.code).toContain('export const s = () => { throw new Error(')
    expect(client.code).toContain("export const c = () => 'window'")
    expect(client.code).toContain(
      'export const bound = (() => { throw new Error(',
    )
    expect(client.code).not.toContain('secret.server')
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.code).toContain('export const s = () => secret()')
    expect(ssr.code).toContain('export const c = () => { throw new Error(')
  })

  test('server: <ClientOnly> loses its children and what only they read', async () => {
    const files = {
      '/app/module.tsx': `import { ClientOnly } from '@tanstack/react-router'
import * as R from '@tanstack/react-router'
import { Chart } from './chart.client'
export function Page() {
  return <div><ClientOnly fallback={<p>loading</p>}><Chart /></ClientOnly><R.ClientOnly><Chart /></R.ClientOnly></div>
}
`,
      '/app/chart.client.tsx': `export const Chart = () => null\n`,
    }
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.code).toContain(
      '<ClientOnly fallback={<p>loading</p>}/><R.ClientOnly/>',
    )
    expect(ssr.code).not.toContain('chart.client')
    const client = await compile(files, 'client')
    expect(client?.code ?? files['/app/module.tsx']).toContain('<Chart />')
  })

  test('a hook call only the removed implementation read keeps running', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import { createIsomorphicFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const serverId = useId()
  const describe = createIsomorphicFn().server(() => serverId).client(() => 'client')
  const inputId = useId()
  return [describe(), inputId]
}
`,
      },
      'client',
    ))!
    expect(out.code).toContain('useId();')
    expect(out.code).not.toContain('const serverId')
  })
})

describe('rsc-css', () => {
  test('the provider env gets the CSS loader on the RSC helpers', async () => {
    const out = (await compile(
      {
        '/app/module.tsx': `import { renderServerComponent, renderToReadableStream } from '@tanstack/react-start/rsc'
export const a = () => renderServerComponent(<X />)
export const b = () => renderToReadableStream((<X /> as any))
export const c = (d: boolean) => renderToReadableStream(d ? <X /> : <Y />)
export const d = () => renderToReadableStream(/* c */ <X />).then((v) => v)
`,
      },
      'rsc',
    ))!
    expect(out.code).toContain(
      'renderServerComponent(<X />, { __tanstackStartRscCss: import.meta.viteRsc.loadCss() })',
    )
    expect(out.code).toContain(
      'renderToReadableStream(<>{import.meta.viteRsc.loadCss()}{(<X /> as any)}</>)',
    )
    expect(out.code).toContain(
      'd ? <>{import.meta.viteRsc.loadCss()}<X /></> : <>{import.meta.viteRsc.loadCss()}<Y /></>',
    )
    expect(out.code).toContain(
      'renderToReadableStream(/* c */ <>{import.meta.viteRsc.loadCss()}<X /></>)',
    )
  })
})

describe('derived providers of every server fn module (Rsbuild RSC)', () => {
  // `alwaysDeriveProvider`: the provider module is the rsc layer's own
  // instance of the file (`?tss-serverfn-split`), so it owns the server fn
  // declaration with its handler in place and what the handler reads; the
  // environment's own output keeps the SSR-caller stub
  test('an exported server fn: the provider owns its declaration', async () => {
    const files = {
      '/app/module.tsx': `${head}import { render } from './render'
import { useState } from 'react'
export const fn = createServerFn().handler(async () => render())
export function Page() {
  const [n] = useState(0)
  return n
}
`,
      '/app/render.ts': `export const render = () => 'MARK'\n`,
    }
    const opts = { alwaysDeriveProvider: true, providerDirective: 'use server-entry' }
    const env = (await compile(files, 'rsc', '/app/module.tsx', opts))!
    const provider = (await compile(
      files,
      'rsc',
      '/app/module.tsx?tss-serverfn-split',
      opts,
    ))!
    expect(env.code).toContain('.handler(tsrSsrRpc(')
    expect(env.code).not.toContain('fn_createServerFn_handler')
    expect(provider.code).toMatch(/^'use server-entry'/)
    expect(provider.code).toContain('.handler(fn_createServerFn_handler, async () => render())')
    expect(provider.code).toContain("import { render } from './render'")
    expect(provider.code).toContain('export { fn_createServerFn_handler }')
    expect(provider.code).not.toContain("from './module.tsx")
    expect(provider.code).not.toContain('useState')
    const facts = env.facts.planners[START_ENV] as StartEnvFacts
    expect(facts.serverFns[0]).toMatchObject({ providerDerived: true })
  })
})

describe('route modules', () => {
  test('a private server fn of a route module: provider output', async () => {
    const out = (await compile(
      {
        '/app/src/routes/posts.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { secret } from '../db.server'
const cache = new Map<string, string>()
;(globalThis as any).__postsInits = ((globalThis as any).__postsInits ?? 0) + 1
const getPosts = createServerFn().handler(async () => 'posts:' + secret())
function Posts() {
  return <p>{String(cache.size)}</p>
}
export const Route = createFileRoute('/posts')({
  loader: async () => getPosts(),
  component: Posts,
})
`,
        '/app/src/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
      },
      'ssr',
      '/app/src/routes/posts.tsx',
    ))!
    expect(out.code).toContain('export { getPosts_createServerFn_handler }')
    const facts = out.facts.planners[START_ENV] as StartEnvFacts
    expect(facts.serverFns[0]).toMatchObject({
      rootRel: 'src/routes/posts.tsx',
      exportName: 'getPosts_createServerFn_handler',
    })
  })
})
