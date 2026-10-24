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
      /const tsrRpc\$fn = tsrServerRpc\(\{ id: '[^']+', name: 'fn', filename: 'module\.tsx' \}, \(opts\) => fn\.__executeServer\(opts\)\)\nexport \{ tsrRpc\$fn as fn_createServerFn_handler \}/,
    )
    expect(out.code).toContain(
      '.validator(schema).handler(tsrRpc$fn, async () => db.x())',
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
      'const tsrServerFn$inner = createServerFn().handler(tsrRpc$inner, async () => db.inner())',
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
  return describe()
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
