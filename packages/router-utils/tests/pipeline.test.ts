import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { describe, expect, it } from 'vitest'
import { compileModule, invalidate } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  envInfo,
  toyEdgePolicyPlanner,
  toyEnvPlanner,
  toyHydratePlanner,
  toySplitPlanner,
  toySummaryPlanner,
} from './helpers'
import type { HostServices, Planner } from '../src/compiler'

const ROUTE = dedent(`
  import { createFileRoute } from 'toy-router'
  import { secret } from './secret.server'
  import { helper } from './helper'
  export const Route = createFileRoute('/')({
    ssr: false,
    component: () => helper(secret),
    loader: () => helper(1),
  })
`)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('slice gates: loading', () => {
  const planners = () => [toySplitPlanner({ deleteNodes: ['ssr'] })]

  it('(a) direct loading: env first, then the chunk from the validated hit', async () => {
    const host = new MemoryHost({ files: { '/app/route.tsx': ROUTE } })
    const env = await host.compile('/app/route.tsx', planners())
    const cache = host.caches.plans.get('client')!
    const entry = cache.get({
      env: 'client',
      canonicalId: '/app/route.tsx',
      configKey: 'cfg',
    })!
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners(),
    )
    expect(cache.size).toBe(1)
    expect(
      cache.get({
        env: 'client',
        canonicalId: '/app/route.tsx',
        configKey: 'cfg',
      }),
    ).toBe(entry)
    expect(env!.code).toBe(
      dedent(`
      import { lazyRouteComponent } from 'toy-router'
      const tsrImportComponent = () => import('./route.tsx?tsr-split=component')
      import { createFileRoute } from 'toy-router'
      import { helper } from './helper'
      export const Route = createFileRoute('/')({
        component: /* @__PURE__ */ lazyRouteComponent(tsrImportComponent, 'component'),
        loader: () => helper(1),
      })
    `),
    )
    expect(chunk!.code).toBe(
      dedent(`
      import { secret } from './secret.server'
      import { helper } from './helper'
      const TsrSplitComponent = () => helper(secret)
      export { TsrSplitComponent as component }
    `),
    )
    expect(chunk!.output).toBe('derived:/app/route.tsx?tsr-split=component')
  })

  it('(b) derived-first loading yields identical bytes and one plan', async () => {
    const a = new MemoryHost({ files: { '/app/route.tsx': ROUTE } })
    const envA = await a.compile('/app/route.tsx', planners())
    const chunkA = await a.compile(
      '/app/route.tsx?tsr-split=component',
      planners(),
    )
    const b = new MemoryHost({ files: { '/app/route.tsx': ROUTE } })
    const chunkB = await b.compile(
      '/app/route.tsx?tsr-split=component',
      planners(),
    )
    const envB = await b.compile('/app/route.tsx', planners())
    expect(chunkB!.code).toBe(chunkA!.code)
    expect(envB!.code).toBe(envA!.code)
    expect(JSON.stringify(chunkB!.map)).toBe(JSON.stringify(chunkA!.map))
    expect(JSON.stringify(envB!.map)).toBe(JSON.stringify(envA!.map))
    expect(b.caches.plans.get('client')!.size).toBe(1)
  })

  it('(g) identity-preserving derived request with a foreign query', async () => {
    const files = {
      '/app/page.tsx': dedent(`
        import { createFileRoute } from 'toy-router'
        import { service } from './service'
        export const Route = createFileRoute('/')({
          component: () => service(),
        })
      `),
      '/app/service-a.ts': 'export const service = () => "a"\n',
      '/app/service-b.ts': 'export const service = () => "b"\n',
    }
    const host = new MemoryHost({
      files,
      resolve: (spec, importer) =>
        spec === './service'
          ? importer.includes('flavour=b')
            ? '/app/service-b.ts'
            : '/app/service-a.ts'
          : null,
    })
    const planners: Array<Planner> = [toySplitPlanner(), toySummaryPlanner()]
    const b = await host.compile('/app/page.tsx?flavour=b', planners)
    const a = await host.compile('/app/page.tsx?flavour=a', planners)
    expect(host.caches.plans.get('client')!.size).toBe(2)
    expect(host.resolveCalls).toContainEqual({
      specifier: './service',
      importer: '/app/page.tsx?flavour=b',
    })
    expect(host.resolveCalls).toContainEqual({
      specifier: './service',
      importer: '/app/page.tsx?flavour=a',
    })
    expect(a!.dependencies).toEqual(['/app/service-a.ts'])
    expect(b!.dependencies).toEqual(['/app/service-b.ts'])
    const chunk = await host.compile(
      '/app/page.tsx?flavour=b&tsr-split=component',
      planners,
    )
    expect(host.caches.plans.get('client')!.size).toBe(2)
    expect(b!.code).toContain(
      "import('./page.tsx?flavour=b&tsr-split=component')",
    )
    expect(chunk!.output).toBe(
      'derived:/app/page.tsx?flavour=b&tsr-split=component',
    )
    expect(chunk!.code).toContain("import { service } from './service'")
    // the chunk id may arrive with the owned key in another position
    const chunk2 = await host.compile(
      '/app/page.tsx?tsr-split=component&flavour=b',
      planners,
    )
    expect(chunk2!.code).toBe(chunk!.code)
    expect(host.caches.plans.get('client')!.size).toBe(2)
  })
})

describe('resolution for analysis', () => {
  it('never asks the host about a Node builtin or a URL-scheme specifier (G16)', async () => {
    const files = {
      '/app/page.tsx': dedent(`
        import { createFileRoute } from 'toy-router'
        import { readFileSync } from 'node:fs'
        import { existsSync } from 'fs'
        import { env } from 'cloudflare:workers'
        import { service } from './service'
        import { served } from 'virtual:served'
        export const Route = createFileRoute('/')({
          component: () => service(readFileSync, existsSync, env, served),
        })
      `),
      '/app/service.ts': 'export const service = () => "a"\n',
    }
    const host = new MemoryHost({ files })
    const planners: Array<Planner> = [
      toySplitPlanner(),
      {
        ...toySummaryPlanner(),
        async prefetch(t0, ctx) {
          for (const imp of t0.imports) {
            await ctx.resolve(imp.specifier)
          }
          ctx.set({})
        },
      },
    ]
    await host.compile('/app/page.tsx', planners)
    // a package specifier (not a known one here), a project module and a
    // bundler virtual module are asked; the builtins and the platform scheme
    // never. Each is asked once: the attempt's snapshot validation and later
    // hits do not re-ask while no file appeared or disappeared
    const asked = ['toy-router', './service', 'virtual:served']
    expect(host.resolveCalls.map((c) => c.specifier)).toEqual(asked)
    host.resolveCalls.length = 0
    await host.compile('/app/page.tsx', planners)
    await host.compile('/app/page.tsx?tsr-split=component', planners)
    expect(host.resolveCalls).toEqual([])
    // a file appeared: the failed resolutions are re-asked by the event,
    // then the next validation of the plan asks the resolver again, once
    host.write('/app/other.ts', 'export {}\n')
    await invalidate(host.caches, { path: '/app/other.ts', kind: 'add' }, host)
    expect(host.resolveCalls.map((c) => c.specifier)).toEqual([
      'toy-router',
      'virtual:served',
    ])
    host.resolveCalls.length = 0
    await host.compile('/app/page.tsx', planners)
    expect(host.resolveCalls.map((c) => c.specifier)).toEqual(asked)
    host.resolveCalls.length = 0
    await host.compile('/app/page.tsx?tsr-split=component', planners)
    expect(host.resolveCalls).toEqual([])
  })
})

describe('slice gates: edges and policy', () => {
  it('(c) judges a chunk-only denied import in the chunk output with async verdicts per importer', async () => {
    const files = {
      '/app/veto.tsx': ROUTE,
      '/app/allow.tsx': ROUTE,
    }
    const host = new MemoryHost({ files })
    const edges = toyEdgePolicyPlanner({
      onViolation: async (info) => {
        await new Promise((r) => setTimeout(r, 1))
        return !info.importerId.includes('veto')
      },
    })
    const planners = [toySplitPlanner(), edges]
    const vetoEnv = await host.compile('/app/veto.tsx', planners)
    const vetoChunk = await host.compile(
      '/app/veto.tsx?tsr-split=component',
      planners,
    )
    const allowEnv = await host.compile('/app/allow.tsx', planners)
    const allowChunk = await host.compile(
      '/app/allow.tsx?tsr-split=component',
      planners,
    )
    // the denied import lives only in the chunk
    expect(vetoEnv!.edges.map((e) => e.specifier)).not.toContain(
      './secret.server',
    )
    expect(allowEnv!.edges.map((e) => e.specifier)).not.toContain(
      './secret.server',
    )
    expect(vetoChunk!.edges.map((e) => e.specifier)).toContain(
      './secret.server',
    )
    expect(vetoChunk!.code).toContain("from './secret.server'")
    expect(allowChunk!.code).toMatch(
      /from '\\u0000tsr-mock:[^:]+:\.\/secret\.server'|from '\0tsr-mock:[^:]+:\.\/secret\.server'/,
    )
    expect(edges.calls.map((c) => c.output)).toEqual([
      'derived:/app/veto.tsx?tsr-split=component',
      'derived:/app/allow.tsx?tsr-split=component',
    ])
    expect(edges.calls.map((c) => c.importerId)).toEqual([
      '/app/veto.tsx?tsr-split=component',
      '/app/allow.tsx?tsr-split=component',
    ])
  })

  it('substitution maps the literal to its original offset', async () => {
    const host = new MemoryHost({
      files: {
        '/app/lib.ts': "import { x } from './a.server'\nexport const y = x\n",
      },
    })
    const out = await host.compile('/app/lib.ts', [toyEdgePolicyPlanner()])
    expect(out!.code).toMatch(/^import \{ x \} from '\0tsr-mock:/)
    const tracer = new TraceMap(out!.map as never)
    expect(originalPositionFor(tracer, { line: 1, column: 18 })).toMatchObject({
      line: 1,
      column: 18,
    })
    expect(originalPositionFor(tracer, { line: 2, column: 0 })).toMatchObject({
      line: 2,
      column: 0,
    })
  })
})

const RECOGNIZER = {
  factories: {
    'toy-start': {
      createServerOnlyFn: 'serverOnly',
      createClientOnlyFn: 'clientOnly',
      createServerFn: 'serverFn',
    },
  },
  builderKinds: new Set(['serverFn']),
  terminal: { serverFn: 'serverFn' as const },
  envOnlyKinds: {
    serverOnly: 'server' as const,
    clientOnly: 'client' as const,
  },
}

const FACTORY = (fn: string, body = '1') =>
  dedent(`
    import { ${fn} } from 'toy-start'
    export const make = ${fn}(() => ${body})
  `)

const CONSUMER = dedent(`
  import { make } from './factory-inner'
  export const run = () => make()
`)

describe('slice gates: invalidation', () => {
  it('(e) consumer invalidation through the export-facts digest; handler-body edits do not invalidate', async () => {
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': CONSUMER,
        '/app/factory-inner.ts': FACTORY('createServerOnlyFn'),
      },
      recognizer: RECOGNIZER,
    })
    const planners = [toySummaryPlanner()]
    const first = await host.compile('/app/consumer.ts', planners)
    expect(first!.facts.planners['toy-summary']).toEqual({
      './factory-inner': { t: 'envOnlyResult', kind: 'server' },
    })
    expect(first!.dependencies).toEqual(['/app/factory-inner.ts'])
    const key = {
      env: 'client',
      canonicalId: '/app/consumer.ts',
      configKey: 'cfg',
    }
    // handler-body edit: digest unchanged → no dependents
    host.write('/app/factory-inner.ts', FACTORY('createServerOnlyFn', '2'))
    const r1 = await invalidate(
      host.caches,
      { path: '/app/factory-inner.ts', kind: 'change' },
      host,
    )
    expect(r1.dependents).toEqual([])
    expect(r1.evicted).toEqual([])
    const entry = host.caches.plans.get('client')!.get(key)
    const again = await host.compile('/app/consumer.ts', planners)
    expect(host.caches.plans.get('client')!.get(key)).toBe(entry)
    expect(again!.facts).toBe(first!.facts)
    // flip make from server-only to client-only: digest changes → the consumer is a dependent
    host.write('/app/factory-inner.ts', FACTORY('createClientOnlyFn'))
    const r2 = await invalidate(
      host.caches,
      { path: '/app/factory-inner.ts', kind: 'change' },
      host,
    )
    expect(r2.dependents).toEqual([key])
    expect(host.caches.plans.get('client')!.get(key)).toBeNull()
    const second = await host.compile('/app/consumer.ts', planners)
    expect(second!.facts.planners['toy-summary']).toEqual({
      './factory-inner': { t: 'envOnlyResult', kind: 'client' },
    })
  })

  it('re-validates each environment with its own resolver on add/unlink (no cross-env resolution contamination)', async () => {
    // the client resolves `./dep` to the browser file, the server to the node
    // file, and only the server resolves `./maybe`: an `add` checked with the
    // server's resolver would find the client's failed `./maybe` resolving
    // (a false dependent), an `unlink` of the client's file checked with the
    // client's resolver would find the server's `./dep` moved (another)
    const files = {
      '/app/a.ts': `import { x } from './dep'\nimport './maybe'\nexport const y = x\n`,
      '/app/dep.client.ts': 'export const x = 1\n',
      '/app/dep.server.ts': 'export const x = 2\n',
      '/app/maybe.server.ts': 'export {}\n',
    }
    const resolverOf = (kind: 'client' | 'server') => (spec: string) =>
      spec === './dep'
        ? `/app/dep.${kind}.ts`
        : spec === './maybe' && kind === 'server'
          ? '/app/maybe.server.ts'
          : null
    const client = new MemoryHost({ files, resolve: resolverOf('client') })
    const server: HostServices = {
      resolve: (spec) => {
        const r = resolverOf('server')(spec)
        return Promise.resolve(r ? { id: r } : null)
      },
      readFile: (p) => client.readFile(p),
      loadVirtual: () => Promise.resolve(null),
      rawFacts: client.rawFacts,
    }
    const hosts = (env: string) => (env === 'ssr' ? server : client)
    const planners = [toySummaryPlanner()]
    const ssr = envInfo({ name: 'ssr', type: 'server', routerSplit: false })
    await client.compile('/app/a.ts', planners)
    await compileModule(
      {
        id: '/app/a.ts',
        code: files['/app/a.ts'],
        env: ssr,
        planners,
        config: { configKey: 'cfg', perPlanner: {} },
        wantMap: false,
      },
      server,
      client.caches,
    )
    const resolutionsOf = (env: string) =>
      client.caches.plans
        .get(env)!
        .get({ env, canonicalId: '/app/a.ts', configKey: 'cfg' })!
        .plan.dependencies.filter((fp) => fp.kind === 'resolution')
        .map((fp) => [fp.specifier, fp.resolved])
    expect(resolutionsOf('client')).toEqual([
      ['./dep', '/app/dep.client.ts'],
      ['./maybe', null],
    ])
    expect(resolutionsOf('ssr')).toEqual([
      ['./dep', '/app/dep.server.ts'],
      ['./maybe', '/app/maybe.server.ts'],
    ])
    // an unrelated file appears, then the client's dependency is deleted: every
    // environment's fingerprints are checked with that environment's resolver
    const added = await invalidate(
      client.caches,
      { path: '/app/other.ts', kind: 'add' },
      hosts,
    )
    expect(added.dependents).toEqual([])
    client.files['/app/dep.client.ts'] = undefined as never
    delete client.files['/app/dep.client.ts']
    const r = await invalidate(
      client.caches,
      { path: '/app/dep.client.ts', kind: 'unlink' },
      hosts,
    )
    expect(r.dependents.map((k) => k.env).sort()).toEqual(['client'])
    expect(client.caches.plans.get('ssr')!.size).toBe(1)
    expect(client.caches.plans.get('client')!.size).toBe(0)
  })

  it('watches only files: a known package an export resolves to is no dependency path', async () => {
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': CONSUMER,
        '/app/factory-inner.ts': `export { createServerOnlyFn as make } from 'toy-start'\n`,
      },
      recognizer: RECOGNIZER,
    })
    const out = await host.compile('/app/consumer.ts', [toySummaryPlanner()])
    expect(out!.facts.planners['toy-summary']).toEqual({
      './factory-inner': { t: 'factory', kind: 'serverOnly' },
    })
    expect(out!.dependencies).toEqual(['/app/factory-inner.ts'])
  })

  it('(d) overlapping save: a slow r1 compile never publishes over r2', async () => {
    const gate = deferred<void>()
    let suspendOnce = true
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': CONSUMER,
        '/app/factory-inner.ts': FACTORY('createServerOnlyFn'),
      },
      recognizer: RECOGNIZER,
      // r1's phase A suspends on the dependency's resolution (its first fact acquisition)
      onResolve: async (specifier) => {
        if (specifier === './factory-inner' && suspendOnce) {
          suspendOnce = false
          await gate.promise
        }
      },
    })
    const planners = [toySummaryPlanner()]
    const r1 = CONSUMER
    const r2 = `${CONSUMER}export const v2 = 2\n`
    const slow = host.compile('/app/consumer.ts', planners, { code: r1 })
    await new Promise((r) => setTimeout(r, 5))
    // the file is saved and the host invalidates + transforms r2 while r1 is suspended on the summary read
    host.write('/app/consumer.ts', r2)
    await invalidate(
      host.caches,
      { path: '/app/consumer.ts', kind: 'change' },
      host,
    )
    const fresh = await host.compile('/app/consumer.ts', planners, { code: r2 })
    expect(fresh!.code).toContain('export const v2 = 2')
    const key = {
      env: 'client',
      canonicalId: '/app/consumer.ts',
      configKey: 'cfg',
    }
    const cache = host.caches.plans.get('client')!
    const published = cache.get(key)!
    expect(published.plan.sourceLength).toBe(r2.length)
    gate.resolve()
    const stale = await slow
    expect(stale!.code).not.toContain('v2')
    expect(cache.get(key)).toBe(published)
    const hit = await host.compile('/app/consumer.ts', planners, { code: r2 })
    expect(cache.get(key)).toBe(published)
    expect(hit!.code).toBe(fresh!.code)
  })

  it('(f) in-flight dependency-only edit restarts the compile; onViolation is asked once', async () => {
    const verdict = deferred<boolean>()
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': dedent(`
          import { make } from './factory-inner'
          import { x } from './x.server'
          export const run = () => make() + x
        `),
        '/app/factory-inner.ts': FACTORY('createServerOnlyFn'),
      },
      recognizer: RECOGNIZER,
    })
    const edges = toyEdgePolicyPlanner({ onViolation: () => verdict.promise })
    const planners = [toySummaryPlanner(), edges]
    const pending = host.compile('/app/consumer.ts', planners)
    await new Promise((r) => setTimeout(r, 5))
    expect(edges.calls).toHaveLength(1)
    // the dependency flips while the consumer waits in phase C
    host.write('/app/factory-inner.ts', FACTORY('createClientOnlyFn'))
    const inv = await invalidate(
      host.caches,
      { path: '/app/factory-inner.ts', kind: 'change' },
      host,
    )
    expect(inv.dependents).toEqual([])
    verdict.resolve(true)
    const out = await pending
    expect(out!.facts.planners['toy-summary']).toEqual({
      './factory-inner': { t: 'envOnlyResult', kind: 'client' },
    })
    expect(edges.calls).toHaveLength(1)
    expect(out!.code).toMatch(/tsr-mock/)
    const key = {
      env: 'client',
      canonicalId: '/app/consumer.ts',
      configKey: 'cfg',
    }
    expect(host.caches.plans.get('client')!.get(key)!.plan.facts).toBe(
      out!.facts,
    )
  })
})

describe('attempts that are overtaken or throw', () => {
  const key = {
    env: 'client',
    canonicalId: '/app/consumer.ts',
    configKey: 'cfg',
  }

  it('(n) answers from the last plan, unpublished and with a warning, when dependencies keep changing', async () => {
    let flips = 0
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': CONSUMER,
        '/app/factory-inner.ts': FACTORY('createServerOnlyFn'),
      },
      recognizer: RECOGNIZER,
    })
    const flipping: Planner = {
      name: 'toy-flip',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        // the dependency flips after this attempt recorded its facts, on every attempt
        const target = await ctx.resolve('./factory-inner')
        await ctx.resolver.resolve(target!, 'make')
        if (flips < 3) {
          flips++
          host.write(
            '/app/factory-inner.ts',
            FACTORY(flips % 2 ? 'createClientOnlyFn' : 'createServerOnlyFn'),
          )
          await invalidate(
            host.caches,
            { path: '/app/factory-inner.ts', kind: 'change' },
            host,
          )
        }
      },
      plan() {},
    }
    const planners = [toySummaryPlanner(), flipping]
    const out = await host.compile('/app/consumer.ts', planners)
    expect(flips).toBe(3)
    expect(out!.code).toContain('export const run')
    expect(out!.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'compile-overtaken',
      }),
    )
    const cache = host.caches.plans.get('client')!
    expect(cache.get(key)).toBeNull()
    expect(cache.dependents.stats().entries).toBe(0)
    // the next request compiles and publishes as usual
    const next = await host.compile('/app/consumer.ts', planners)
    expect(next!.diagnostics).toEqual([])
    expect(cache.get(key)).not.toBeNull()
  })

  it('(o) discards the attempt ledger when a planner throws', async () => {
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': CONSUMER,
        '/app/factory-inner.ts': FACTORY('createServerOnlyFn'),
      },
      recognizer: RECOGNIZER,
    })
    const boom: Planner = {
      name: 'toy-boom',
      tier: 1,
      gate: () => true,
      plan() {
        throw new Error('boom')
      },
    }
    await expect(
      host.compile('/app/consumer.ts', [toySummaryPlanner(), boom]),
    ).rejects.toThrow('boom')
    const cache = host.caches.plans.get('client')!
    expect(cache.get(key)).toBeNull()
    expect(cache.dependents.stats()).toMatchObject({ entries: 0, keys: 0 })
    expect(cache.inFlight.size).toBe(0)
  })
})

describe('slice gates: claims and maps', () => {
  it('(k) a Hydrate boundary inside an erased server-only handler yields no chunk, edge or validation on the client', async () => {
    const code = dedent(`
      import { wrapServer, Hydrate } from 'toy-start'
      import { Heavy } from './heavy.server'
      export const fn = wrapServer(() => <Hydrate><Heavy/></Hydrate>)
    `)
    const host = new MemoryHost({ files: { '/app/mod.tsx': code } })
    const edges = toyEdgePolicyPlanner()
    const planners = [toyEnvPlanner(), toyHydratePlanner(), edges]
    const env = await host.compile('/app/mod.tsx', planners)
    // the toy planner replaces the whole call, so the callee/tag import is orphaned too
    expect(env!.code).toBe('export const fn = tsrStub()\n')
    const chunk = await host.compile('/app/mod.tsx?tss-hydrate=h0', planners)
    expect(chunk!.code).toBe('export {}\n')
    expect(chunk!.edges).toEqual([])
    expect(edges.calls).toEqual([])
    const server = await host.compile('/app/mod.tsx', planners, {
      env: envInfo({ name: 'ssr', type: 'server' }),
    })
    expect(server!.code).toContain(
      'tsrRpc(() => <Hydrate><TsrHydrate0/></Hydrate>)',
    )
    const serverChunk = await host.compile(
      '/app/mod.tsx?tss-hydrate=h0',
      planners,
      { env: envInfo({ name: 'ssr', type: 'server' }) },
    )
    expect(serverChunk!.code).toBe(
      dedent(`
      import { Heavy } from './heavy.server'
      export function TsrHydrate0(props) { return <><Heavy/></> }
    `),
    )
  })

  it('(m) map positions survive a raw U+2028 in a string and a lone-CR file, in env and derived outputs', async () => {
    const base = [
      "import { createFileRoute } from 'toy-router'",
      "import { helper } from './helper'",
      'const text = "a\u2028b"',
      "export const Route = createFileRoute('/')({",
      '  component: () => {',
      '    if (text) {',
      '      throw new Error(helper(text))',
      '    }',
      '    return null',
      '  },',
      '  loader: () => helper(text),',
      '})',
      '',
    ]
    for (const [name, code] of [
      ['ls', base.join('\n')],
      ['cr', base.join('\r')],
    ] as const) {
      const host = new MemoryHost({ files: { [`/app/${name}.tsx`]: code } })
      const planners = [toySplitPlanner()]
      const env = await host.compile(`/app/${name}.tsx`, planners)
      const chunk = await host.compile(
        `/app/${name}.tsx?tsr-split=component`,
        planners,
      )
      for (const out of [env!, chunk!]) {
        const tracer = new TraceMap(out.map as never)
        for (const needle of ['throw', 'helper(text)', 'text)', 'Error']) {
          let from = 0
          for (;;) {
            const gi = out.code.indexOf(needle, from)
            if (gi === -1) {
              break
            }
            from = gi + 1
            const g = locate(out.code, gi)
            const pos = originalPositionFor(tracer, {
              line: g.line + 1,
              column: g.column,
            })
            if (pos.line === null) {
              continue
            }
            const originalOffset = offsetOf(code, pos.line - 1, pos.column)
            expect(
              code.slice(originalOffset, originalOffset + needle.length),
              `${name}: ${needle} in ${out.output}`,
            ).toBe(needle)
          }
        }
      }
    }
  })
})

function locate(
  code: string,
  offset: number,
): { line: number; column: number } {
  let line = 0
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    const c = code.charCodeAt(i)
    if (c === 13) {
      if (code.charCodeAt(i + 1) === 10) {
        i++
      }
      line++
      lineStart = i + 1
    } else if (c === 10 || c === 0x2028 || c === 0x2029) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: offset - lineStart }
}

function offsetOf(code: string, line: number, column: number): number {
  let l = 0
  let i = 0
  while (l < line && i < code.length) {
    const c = code.charCodeAt(i)
    if (c === 13) {
      if (code.charCodeAt(i + 1) === 10) {
        i++
      }
      l++
    } else if (c === 10 || c === 0x2028 || c === 0x2029) {
      l++
    }
    i++
  }
  return i + column
}
