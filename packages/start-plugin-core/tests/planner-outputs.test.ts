/**
 * The Start planners on the compiler core, in process (not oracle: a fast
 * check of the output shapes of `start-env` and `rsc-css` on an in-memory
 * host, before the public Start host of the oracle tests exercises them).
 */
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../src/compiler/recognizer'
import { START_ENV, startPlanners } from '../src/planners'
import { importedAs, namesIn, shape } from './generated-names'
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

/** The local name of a client output's server-fn stub factory. */
const clientRpc = (code: string) =>
  importedAs(code, 'createClientRpc', '@tanstack/react-start/client-rpc')

describe("start-env: a server fn's filename on Windows is main's (pathe's relative)", () => {
  const code = `${head}export const fn = createServerFn().handler(async () => 1)\n`
  test.each([
    ['C:\\proj', 'C:/proj/src/fns.ts', 'src/fns.ts'],
    ['c:\\proj', 'C:/proj/src/fns.ts', 'src/fns.ts'],
    ['C:\\proj\\app', 'C:/proj/lib/fns.ts', '../lib/fns.ts'],
    ['C:\\proj', 'D:/lib/fns.ts', 'D:/lib/fns.ts'],
  ])('root %s, module %s: %s', async (root, id, filename) => {
    const out = (await compile({ [id]: code }, 'ssr', id, { root }))!
    expect(out.code).toContain(`filename: ${JSON.stringify(filename)}`)
    // main's default id: sha256 hex of `<filename>--<functionName>`
    const fnId = createHash('sha256')
      .update(`${filename}--fn_createServerFn_handler`)
      .digest('hex')
    expect(out.code).toContain(`id: "${fnId}"`)
    const facts = out.facts.planners[START_ENV] as StartEnvFacts
    expect(facts.serverFns[0]).toMatchObject({ rootRel: filename })
  })
})

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
      `createServerFn({ method: 'POST' }).handler(${clientRpc(out.code)}(`,
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

  test('provider: the chain stays next to a createServerRpc export, its handler loads on the first call', async () => {
    const out = (await compile(files, 'ssr'))!
    const rpc = importedAs(
      out.code,
      'createServerRpc',
      '@tanstack/react-start/server-rpc',
    )
    // the export the resolver reads, the handler loaded on the first call
    const { h } = namesIn(
      out.code,
      `const «h» = ${rpc}({ id: "«…»", name: "fn", filename: "module.tsx" }, («o») => fn.__executeServer(«o»))\nexport { «h» }`,
    )
    const { impl } = namesIn(
      out.code,
      `const «load» = () => («memo» ??= import('/app/module.tsx?tss-serverfn-handler'))«…».validator(schema).handler(${h}, (...args) => «load»().then((m) => m.«impl»(...args)))`,
    )
    expect(out.code).not.toContain('db.server')
    const handlers = (await compile(
      files,
      'ssr',
      '/app/module.tsx?tss-serverfn-handler',
    ))!
    expect(handlers.code).toContain("import { db } from './db.server'")
    expect(handlers.code).toContain(`const ${impl} = async () => db.x()`)
    expect(handlers.code).toContain(`export { ${impl} }`)
  })

  test('ssr caller with a separate provider: an ssr rpc stub keeps the validator', async () => {
    const out = (await compile(files, 'ssr-caller'))!
    const rpc = importedAs(
      out.code,
      'createSsrRpc',
      '@tanstack/react-start/ssr-rpc',
    )
    expect(out.code).toContain(
      `createServerFn({ method: 'POST' }).validator(schema).handler(${rpc}(`,
    )
    expect(out.code).not.toContain('db.server')
  })

  test('the ids agree between the client and the provider', async () => {
    const client = (await compile(files, 'client'))!
    const ssr = (await compile(files, 'ssr'))!
    const id = client.code
      .split(`${clientRpc(client.code)}("`)[1]!
      .split('"')[0]
    expect(ssr.code).toContain(`id: "${id}"`)
    // (the format of earlier versions: server-fns/format.ts)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
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
    expect(out.code).toContain(
      `authed().middleware([]).handler(${clientRpc(out.code)}(`,
    )
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
    expect(out.code).toContain(
      `F.createServerFn().handler(${clientRpc(out.code)}(`,
    )
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
    expect(out.code).toContain(`authed.handler(${clientRpc(out.code)}(`)
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

  test('a server fn passing through identity helpers', async () => {
    const files = {
      '/app/module.tsx': `${head}const wrap = <T,>(x: T) => x
export const wrapped = wrap(wrap(createServerFn().handler(async () => 'w')))
`,
    }
    const client = (await compile(files, 'client'))!
    expect(client.code).toContain(
      `wrap(wrap(createServerFn().handler(${clientRpc(client.code)}(`,
    )
    const ssr = (await compile(files, 'ssr'))!
    expect(ssr.code).toMatch(
      shape(
        `.handler(«h», (...args) => «load»().then((m) => m.«impl»(...args)))`,
      ),
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
      `const inner = createServerFn().handler(${clientRpc(client.code)}(`,
    )
    expect(client.code).not.toContain('db.server')
    const ssr = (await compile(files2, 'ssr'))!
    // hoisted: the module-level fn the nested occurrence reads
    const { hoisted } = namesIn(
      ssr.code,
      `const «hoisted» = createServerFn().handler(«h», (...args) => «load»().then((m) => m.«impl»(...args)))`,
    )
    expect(ssr.code).not.toContain('db.server')
    const handlers = (await compile(
      files2,
      'ssr',
      '/app/module.tsx?tss-serverfn-handler',
    ))!
    expect(handlers.code).toContain('= async () => db.inner()')
    expect(ssr.code).toContain(`const inner = ${hoisted}`)
    expect(ssr.code).toContain('name: "inner"')
  })

  // The nested site is judged against the stub of its enclosing handler
  // whatever the order the analysis found the sites in (here the inner
  // factory's import binding comes first): on the client the handler is a
  // stub, so the nested fn is dead there and never registered as
  // client-referenced (J4.2: only client-referenced fns are HTTP-callable).
  test('a nested server fn inside a handler is not a client server fn, whichever import binding declares it', async () => {
    const files3 = {
      '/app/module.tsx': `import { createServerFn as inner } from '@tanstack/react-start'
import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const outer = createServerFn().handler(async () => {
  const nested = inner().handler(async () => db.inner())
  return nested()
})
`,
      '/app/db.server.ts': `export const db = { inner: () => 'inner' }\n`,
    }
    const client = (await compile(files3, 'client'))!
    expect(client.diagnostics).toEqual([])
    expect(client.code).not.toContain('db.server')
    expect(
      (client.facts.planners[START_ENV] as StartEnvFacts).serverFns.map(
        (fn) => fn.name,
      ),
    ).toEqual(['outer'])
    const ssr = (await compile(files3, 'ssr'))!
    expect(ssr.diagnostics).toEqual([])
    expect(
      (ssr.facts.planners[START_ENV] as StartEnvFacts).serverFns.map(
        (fn) => fn.name,
      ),
    ).toEqual(['outer', 'nested'])
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

  test('`.inputValidator()` on the client is an error that names `.validator()`, at the method name', async () => {
    const files = {
      '/app/module.tsx': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().inputValidator((d: unknown) => d).handler(async () => 'x')
export const mw = createMiddleware({ type: 'function' }).inputValidator((d: unknown) => d).server(({ next }) => next())
`,
    }
    const code = files['/app/module.tsx']
    const out = (await compile(files, 'client'))!
    expect(out.diagnostics).toHaveLength(2)
    const ranges = out.diagnostics.map((d) => {
      expect(d.severity).toBe('error')
      expect(d.message).toContain('`.validator()`')
      return code.slice(d.range!.start, d.range!.end)
    })
    expect(ranges).toEqual(['inputValidator', 'inputValidator'])
    expect(
      out.diagnostics.map((d) => d.range!.start).sort((a, b) => a - b),
    ).toEqual([
      code.indexOf('inputValidator'),
      code.lastIndexOf('inputValidator'),
    ])
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
  // a separate provider: the provider module is the rsc layer's own
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
    const opts = { providerDirective: 'use server-entry' }
    const env = (await compile(files, 'rsc', '/app/module.tsx', opts))!
    const provider = (await compile(
      files,
      'rsc',
      '/app/module.tsx?tss-serverfn-split',
      opts,
    ))!
    expect(env.code).toContain(
      `.handler(${importedAs(env.code, 'createSsrRpc', '@tanstack/react-start/ssr-rpc')}(`,
    )
    expect(provider.code).toMatch(/^'use server-entry'/)
    // the provider owns the handler and exports it; the env module does not
    const { h } = namesIn(
      provider.code,
      `export { «h» }«…».handler(«h», async () => render())`,
    )
    expect(env.code).not.toContain(h)
    expect(provider.code).toContain("import { render } from './render'")
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
    // the resolver reads the export the facts name
    const facts = out.facts.planners[START_ENV] as StartEnvFacts
    expect(facts.serverFns[0]).toMatchObject({
      rootRel: 'src/routes/posts.tsx',
    })
    expect(out.code).toContain(`export { ${facts.serverFns[0]!.exportName} }`)
  })
})

/** The client output's diagnostics of `code`: severity, the source text each is at, and the message. */
async function clientDiagnostics(code: string) {
  const out = (await compile({ '/app/module.tsx': code }, 'client'))!
  return out.diagnostics.map((d) => ({
    severity: d.severity,
    at: d.range!.start,
    text: code.slice(d.range!.start, d.range!.end),
    message: d.message,
  }))
}

const FLOW_PLACES =
  'passed to a function, stored in an object, an array, a class field or another variable, awaited, rendered…'

describe('start-env: escape messages name the shape and a fix that compiles', () => {
  const mwHead = `import { createClientOnlyFn, createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const a = createMiddleware({ type: 'function' }).server(({ next }) => next())
const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
`
  const openMiddlewareFix =
    "To attach its server code later, keep it in its own `const` (export it to share it) and call `.server(…)` on that `const`. Otherwise pass it to `.middleware([…])` or to `createStart`'s `functionMiddleware` / `requestMiddleware` directly (or in an unexported `const` array only they read), or end its chain with `.server(({ next }) => next())`."
  const openMiddleware = (name: string, places: string) =>
    `\`${name}\` is a middleware without \`.server()\`, used where the compiler cannot follow it (${places}), so the compiler cannot be sure no \`.server()\` is attached to it there, which would ship server code to the client. ${openMiddlewareFix}`

  test('an open middleware returned from an isomorphic implementation', async () => {
    const code = `${mwHead}const mws = createIsomorphicFn().server(() => [a, b]).client(() => [b])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.lastIndexOf('[b]') + 1,
        text: 'b',
        message: openMiddleware(
          'b',
          'returned from an isomorphic implementation, whose calls the compiler does not follow',
        ),
      },
    ])
  })

  test('an open middleware composed of others, returned from an isomorphic implementation', async () => {
    const code = `${mwHead}const both = createMiddleware({ type: 'function' }).middleware([a, b])
const mws = createIsomorphicFn().server(() => [a, b]).client(() => [both])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('[both]') + 1,
        text: 'both',
        message: openMiddleware(
          'both',
          'returned from an isomorphic implementation, whose calls the compiler does not follow',
        ),
      },
    ])
  })

  test('an open middleware returned from a `createClientOnlyFn` implementation', async () => {
    const code = `${mwHead}const mws = createClientOnlyFn(() => [b])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.lastIndexOf('[b]') + 1,
        text: 'b',
        // (a `.server()` of its own compiles, but such a list reaching Start throws on the server)
        message:
          "`b` is a middleware without `.server()`, used where the compiler cannot follow it (returned from a `createClientOnlyFn` implementation, whose calls the compiler does not follow), so the compiler cannot be sure no `.server()` is attached to it there, which would ship server code to the client. `createClientOnlyFn` throws when called on the server, and Start reads middleware lists there too: pass the middleware to `.middleware([…])` or to `createStart`'s `functionMiddleware` / `requestMiddleware` directly (or in an unexported `const` array only they read).",
      },
    ])
  })

  test('an open middleware stored in an object', async () => {
    const code = `${mwHead}const cfg = { list: [b] }
export const fn = createServerFn().middleware(cfg.list).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('[b]') + 1,
        text: 'b',
        message: openMiddleware('b', FLOW_PLACES),
      },
    ])
  })

  test('a middleware kept in an object, its server code attached later', async () => {
    const code = `${mwHead}const mws = { open: createMiddleware({ type: 'function' }) }
export const m = mws.open.server(({ next }) => next())
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf("createMiddleware({ type: 'function' }) }"),
        text: "createMiddleware({ type: 'function' })",
        message: `A middleware without \`.server()\` is used where the compiler cannot follow it (${FLOW_PLACES}), so the compiler cannot be sure no \`.server()\` is attached to it there, which would ship server code to the client. ${openMiddlewareFix}`,
      },
    ])
  })

  const isoHead = `import { createIsomorphicFn } from '@tanstack/react-start'
import { QueryCache } from 'some-lib'
`
  const keepsServerBehaviour =
    '`.server(() => undefined)` keeps what it does on the server now (without one, it returns `undefined` there).'
  const isoFnFlow = (subject: string) =>
    `${subject} where the compiler cannot follow it (${FLOW_PLACES}), so the compiler cannot be sure no \`.server()\` implementation is attached to it there, which would ship server code to the client. Give it one where it is defined: ${keepsServerBehaviour}`

  test('a client-only isomorphic fn passed to code the compiler does not see', async () => {
    const code = `${isoHead}export const cache = new QueryCache({ onError: createIsomorphicFn().client(() => 'client') })
const tick = createIsomorphicFn().client(() => 'tick')
setTimeout(tick, 0)
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createIsomorphicFn().client('),
        text: "createIsomorphicFn().client(() => 'client')",
        message: isoFnFlow(
          'An isomorphic fn without a `.server()` implementation is used',
        ),
      },
      {
        severity: 'error',
        at: code.indexOf('tick, 0'),
        text: 'tick',
        message: isoFnFlow(
          '`tick` is an isomorphic fn without a `.server()` implementation, used',
        ),
      },
    ])
  })

  test('a client-only isomorphic fn returned from a function the compiler cannot summarise', async () => {
    const code = `${isoHead}export function pick(on: boolean) {
  if (on) { return createIsomorphicFn().client(() => 1) }
  return createIsomorphicFn().client(() => 2)
}
`
    const diagnostics = await clientDiagnostics(code)
    expect(diagnostics.map((d) => [d.severity, d.text])).toEqual([
      ['error', 'createIsomorphicFn().client(() => 1)'],
      ['error', 'createIsomorphicFn().client(() => 2)'],
    ])
    for (const d of diagnostics) {
      expect(d.message).toBe(
        `A function that returns a TanStack Start builder must return it from its single top-level \`return\` (or an arrow body) and must not be async, a generator, a method or a getter: the compiler cannot follow it otherwise, so server code attached to the builder would ship to the client. Split it into one factory per builder. Or give the isomorphic fn a \`.server()\` implementation where it is defined: ${keepsServerBehaviour}`,
      )
    }
  })

  test('an open middleware returned from a function the compiler cannot summarise', async () => {
    const code = `${mwHead}function makeB(on: boolean) {
  if (!on) { return createMiddleware({ type: 'function' }).client(({ next }) => next()) }
  return b
}
export const fn = createServerFn().middleware([makeB(true)]).handler(async () => 'x')
`
    const diagnostics = await clientDiagnostics(code)
    expect(diagnostics.map((d) => [d.severity, d.text])).toEqual([
      [
        'error',
        "createMiddleware({ type: 'function' }).client(({ next }) => next())",
      ],
      ['error', 'b'],
    ])
    for (const d of diagnostics) {
      expect(d.message).toBe(
        "A function that returns a TanStack Start builder must return it from its single top-level `return` (or an arrow body) and must not be async, a generator, a method or a getter: the compiler cannot follow it otherwise, so server code attached to the builder would ship to the client. Split it into one factory per builder. Or end the middleware's chain with `.server(({ next }) => next())`.",
      )
    }
  })
  const flowHead = `import { createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const register = (x: unknown) => x
`
  const where = `where the compiler cannot follow it (${FLOW_PLACES})`

  test('a server fn builder in a `const`, passed to a function', async () => {
    const code = `${flowHead}const base = createServerFn()
register(base)
export const fn = base.handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('base)'),
        text: 'base',
        message: `\`base\` is a server fn builder without \`.handler()\`, used ${where}, so a handler attached to it there would ship to the client. Keep the builder in its own \`const\` (export it to share it) and call \`.handler(…)\` on that \`const\` where you define each server function, or call \`.handler(…)\` before passing it on.`,
      },
    ])
  })

  test('a server fn builder created inside a call', async () => {
    const code = `${flowHead}export const fn = (register(createServerFn()) as any).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createServerFn()'),
        text: 'createServerFn()',
        message: `A server fn builder without \`.handler()\` is used ${where}, so a handler attached to it there would ship to the client. Keep the builder in its own \`const\` (export it to share it) and call \`.handler(…)\` on that \`const\` where you define each server function, or call \`.handler(…)\` before passing it on.`,
      },
    ])
  })

  test('a factory passed to a function', async () => {
    const code = `${flowHead}const make = (f: any) => f()
export const fn = make(createServerFn).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createServerFn)'),
        text: 'createServerFn',
        message: `\`createServerFn\` is a TanStack Start factory, used ${where}, so server code attached to what it creates there would ship to the client. Call it directly where you need what it creates: the compiler follows each call's chain, and the \`const\` holding it.`,
      },
    ])
  })

  test('a function returning a builder, passed to a function', async () => {
    const code = `${flowHead}const make = () => createServerFn()
register(make)
export const fn = make().handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('make)'),
        text: 'make',
        message: `\`make\` returns a server fn builder without \`.handler()\`, and is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })

  test('an isomorphic fn returning an open middleware, passed to a function', async () => {
    const code = `${flowHead}const a = createMiddleware({ type: 'function' }).server(({ next }) => next())
const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
const mw = createIsomorphicFn().server(() => a).client(() => b)
register(mw)
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('mw)'),
        text: 'mw',
        message: `\`mw\` returns a middleware without \`.server()\`, and is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })

  test("a builder's options passed on, written to, or their middleware list read", async () => {
    const code = `${flowHead}const base = createServerFn({ method: 'POST' })
export const method = base.options.method
const { validator } = base.options
register(base.options)
base.options.validator = (data: unknown) => data
export const mws = base.options.middleware
export const fn = base.handler(async () => validator)
`
    const options = (builder: string) =>
      `\`${builder}.options\` is used where the compiler cannot follow it (passed on, stored, written to, or its \`middleware\` list read), so server code attached to the builder through it would ship to the client. Read each option you need by name where you use it (\`${builder}.options.method\`).`
    expect(await clientDiagnostics(code)).toEqual(
      [
        'base.options)',
        'base.options.validator =',
        'base.options.middleware',
      ].map((needle) => ({
        severity: 'error',
        at: code.indexOf(needle),
        text: 'base.options',
        message: options('base'),
      })),
    )
  })

  test('a factory returned from a getter or a method', async () => {
    const code = `${flowHead}const own = { get make() { return createServerFn } }
const api = { make() { return createMiddleware } }
export const o = [own, api]
`
    const returned = (factory: string, from: string) =>
      `\`${factory}\` is a TanStack Start factory, returned from ${from}, whose result the compiler does not follow, so server code attached to what it creates would ship to the client. Call \`${factory}\` directly where you need what it creates, instead of returning it: the compiler follows each call's chain.`
    expect((await clientDiagnostics(code)).sort((a, b) => a.at - b.at)).toEqual(
      [
        {
          severity: 'error',
          at: code.indexOf('createServerFn }'),
          text: 'createServerFn',
          message: returned('createServerFn', 'a getter'),
        },
        {
          severity: 'error',
          at: code.indexOf('createMiddleware }'),
          text: 'createMiddleware',
          message: returned('createMiddleware', 'a method'),
        },
      ],
    )
  })

  test('a start instance passed to a function', async () => {
    const code = `${flowHead}const si = createStart(() => ({}))
register(si)
export const startInstance = si
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('si)'),
        text: 'si',
        message: `\`si\` is a start instance, used ${where}, so server code attached there to a middleware it creates would ship to the client. Call its \`.createMiddleware()\` directly where you need a middleware.`,
      },
    ])
  })
  test('the implementation of a `createClientOnlyFn` returning an open middleware', async () => {
    const code =
      `${flowHead}const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
const mw = createClientOnlyFn(() => b)
export const startInstance = createStart(() => ({ functionMiddleware: [mw()] }))
`.replace('createIsomorphicFn,', 'createClientOnlyFn, createIsomorphicFn,')
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('() => b'),
        text: '() => b',
        message: `A function returning a middleware without \`.server()\` is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })
})

// `compiler/vue.ts` words a refusal for `<script setup>` from this fact,
// joined on the diagnostic's offset
test('a Vue SFC module records each refused nested server fn and what it reads, in every env', async () => {
  const code = `${head}import { f } from './f'
export function setup(props: { t: string }) {
  const base = createServerFn()
  const a = base.handler(async () => 1)
  const b = createServerFn().handler(async () => props.t)
  const c = createServerFn().validator(f()).handler(async () => 2)
  return [a, b, c]
}
`
  const at = (needle: string) => code.indexOf(needle)
  for (const [id, vue] of [
    ['/app/Comp.vue?vue&type=script&setup=true&lang.ts', true],
    ['/app/module.tsx', false],
  ] as const) {
    for (const env of ['client', 'ssr'] as const) {
      const out = (await compile(
        {
          [id.split('?')[0]!]: code,
          '/app/f.ts': 'export const f = () => (d: unknown) => d\n',
        },
        env,
        id,
      ))!
      expect(
        out.diagnostics.map((d) => d.range!.start).sort((x, y) => x - y),
      ).toEqual([at('base.handler'), at('props.t'), at('f()).handler')])
      const facts = out.facts.planners[START_ENV] as StartEnvFacts
      expect(facts.vueHoists).toEqual(
        vue
          ? [
              {
                at: at('base.handler'),
                reads: { name: 'base', builder: true },
              },
              { at: at('props.t'), reads: { name: 'props', builder: false } },
              { at: at('f()).handler'), option: '`f()`' },
            ]
          : undefined,
      )
    }
  }
})
