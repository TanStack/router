/**
 * The plan cache's bookkeeping (generations, latest revisions, the
 * dependents index) is bounded by the live plans: it does not grow with
 * edits that change import targets, nor with unique files that come and go.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  compileModule,
  invalidate,
  releaseEnvironment,
  restorePlans,
} from '../src/compiler'
import { PlanCache } from '../src/compiler/cache'
import { planKeyString } from '../src/compiler/identity'
import {
  MemoryHost,
  dedent,
  envInfo,
  staleAfter,
  toySplitPlanner,
  toySummaryPlanner,
} from './helpers'
import type { HostServices, Planner } from '../src/compiler'
import type { PlanKey } from '../src/compiler/identity'

const planners = () => [toySummaryPlanner()]
const env = envInfo()
const stats = (host: MemoryHost) =>
  host.caches.plans.get(env.name)!.stats(false)

describe('plan keys by path', () => {
  const key = (canonicalId: string): PlanKey => ({
    env: 'client',
    canonicalId,
    configKey: 'cfg',
  })
  const strings = (keys: Array<PlanKey>) => keys.map(planKeyString).sort()

  it('a file with foreign queries has several keys at its path; an owned query is not a source', () => {
    const cache = new PlanCache('client')
    const plain = key('/app/page.tsx')
    const flavoured = key('/app/page.tsx?flavour=b')
    for (const k of [plain, flavoured]) {
      cache.noteRevision(k, 'r1')
      cache.begin(k)
      expect(
        cache.set({
          key: k,
          revision: 'r1',
          generation: cache.generation(k),
          plan: { dependencies: [] } as any,
          resolvedAt: 0,
          factsAt: 0,
          compiledFor: 'env',
          compiledAt: 0,
        }),
      ).toBe(true)
      cache.end(k)
    }
    expect(strings(cache.keysAt('/app/page.tsx'))).toEqual(
      strings([plain, flavoured]),
    )
    expect(cache.keysAt('/app/other.tsx')).toEqual([])
    expect(cache.stats(false)).toMatchObject({ keyPaths: 1, trackedKeys: 2 })
    cache.delete(flavoured)
    expect(strings(cache.keysAt('/app/page.tsx'))).toEqual(strings([plain]))
    cache.delete(plain)
    expect(cache.keysAt('/app/page.tsx')).toEqual([])
    expect(cache.stats(false)).toMatchObject({ keyPaths: 0, trackedKeys: 0 })
  })

  it('an attempt in flight is found at its path until it ends unpublished', () => {
    const cache = new PlanCache('client')
    const k = key('/app/mod.ts')
    cache.noteRevision(k, 'r1')
    cache.begin(k)
    expect(cache.keysAt('/app/mod.ts')).toEqual([k])
    // a second overlapping attempt keeps the single row
    cache.begin(k)
    expect(cache.keysAt('/app/mod.ts')).toEqual([k])
    cache.end(k)
    expect(cache.keysAt('/app/mod.ts')).toEqual([k])
    cache.end(k)
    expect(cache.keysAt('/app/mod.ts')).toEqual([])
    expect(cache.stats(false)).toMatchObject({
      keyPaths: 0,
      trackedKeys: 0,
      generations: 0,
      latest: 0,
    })
  })

  it('a file removal evicts the plans of every identity at that path', async () => {
    const host = new MemoryHost({
      files: {
        '/app/a.ts': `import { make } from './shared'\nexport const a = make\n`,
        '/app/shared.ts': 'export const make = 1\n',
      },
    })
    await host.compile('/app/a.ts', planners())
    await host.compile('/app/a.ts?flavour=b', planners())
    expect(stats(host)).toMatchObject({ plans: 2, keyPaths: 1, trackedKeys: 2 })
    delete host.files['/app/a.ts']
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'unlink' }, host)
    expect(stats(host)).toMatchObject({ plans: 0, keyPaths: 0, trackedKeys: 0 })
  })
})

describe('a changed dependency', () => {
  it('re-validates its importers against its new facts without re-resolving their imports', async () => {
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': `import { make } from './shared'\nexport const c = make\n`,
        '/app/shared.ts': 'export const make = 1\n',
      },
    })
    await host.compile('/app/consumer.ts', planners())
    // a change that keeps the export facts: no importer is stale
    host.write('/app/shared.ts', 'export const make = 2\n')
    host.resolveCalls.length = 0
    const same = await staleAfter(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    expect(same).toEqual([])
    expect(host.resolveCalls).toEqual([])
    // a new export: the importer reads `make` only, and stays current
    host.write(
      '/app/shared.ts',
      'export const make = 2\nexport const more = 2\n',
    )
    const added = await staleAfter(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    expect(added).toEqual([])
    // a change of the export it reads: the importer is stale, still without a resolution
    host.write('/app/shared.ts', "export { make } from './elsewhere'\n")
    const changed = await staleAfter(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    expect(changed).toEqual(['/app/consumer.ts'])
    expect(host.resolveCalls).toEqual([])
  })
})

describe('a dependency with a query or a virtual id', () => {
  it('is found at its path: a change of an export read stales the importer, another export does not', async () => {
    const virtual: Record<string, string> = {
      '\0virtual:x': 'export const make = 1\n',
      'virtual:y?side=1': 'export const make = 1\n',
    }
    const ids: Record<string, string> = {
      './shared?flavour=b': '/app/shared.ts?flavour=b',
      './x': '\0virtual:x',
      './y': 'virtual:y?side=1',
    }
    const host = new MemoryHost({
      files: {
        '/app/shared.ts': 'export const make = 1\n',
        ...Object.fromEntries(
          Object.keys(ids).map((spec, i) => [
            `/app/c${i}.ts`,
            `import { make } from '${spec}'\nexport const c = make\n`,
          ]),
        ),
      },
      resolve: (specifier) => ids[specifier] ?? null,
      virtual,
    })
    const consumers = Object.keys(ids).map((_, i) => `/app/c${i}.ts`)
    for (const c of consumers) {
      await host.compile(c, planners())
    }
    const edit = async (id: string, text: string) => {
      const file = id.split('?')[0]!
      if (id in virtual) {
        virtual[id] = text
      } else {
        host.write(file, text)
      }
      const r = await staleAfter(
        host.caches,
        { path: file, kind: 'change' },
        host,
      )
      return r
    }
    const at = Object.values(ids)
    for (const [i, id] of at.entries()) {
      // another export: current
      expect(
        await edit(id, 'export const make = 1\nexport const more = 2\n'),
      ).toEqual([])
      // the export read: stale
      expect(await edit(id, "export { make } from './elsewhere'\n")).toEqual([
        consumers[i],
      ])
    }
  })
})

describe('a lookup through `export *`', () => {
  it('depends on the star lists it walked, star targets without the name included', async () => {
    const host = new MemoryHost({
      files: {
        '/app/consumer.ts': `import { make } from './barrel'\nexport const c = make\n`,
        '/app/barrel.ts': `export * from './a'\nexport * from './b'\n`,
        '/app/a.ts': 'export const other = 1\n',
        '/app/b.ts': 'export const make = 1\n',
        '/app/c.ts': 'export const make = 2\n',
      },
    })
    await host.compile('/app/consumer.ts', planners())
    const edit = async (path: string, text: string) => {
      host.write(path, text)
      const r = await staleAfter(host.caches, { path, kind: 'change' }, host)
      return r
    }
    // a star target without the name: another export of it is not read
    expect(await edit('/app/a.ts', 'export const other = 2\n')).toEqual([])
    // its own `export *` list is (the name may come through it)
    expect(
      await edit('/app/a.ts', `export const other = 2\nexport * from './c'\n`),
    ).toEqual(['/app/consumer.ts'])
    await host.compile('/app/consumer.ts', planners())
    // and so is the barrel's
    expect(await edit('/app/barrel.ts', `export * from './b'\n`)).toEqual([
      '/app/consumer.ts',
    ])
  })
})

describe('a package.json change', () => {
  it('checks the resolutions of a plan once, however many of its files lie under the manifest', async () => {
    const names = Array.from({ length: 50 }, (_, i) => `m${i}`)
    const host = new MemoryHost({
      files: {
        '/app/package.json': '{}',
        '/app/src/tree.ts':
          names.map((n) => `import './${n}'`).join('\n') + '\n',
        ...Object.fromEntries(
          names.map((n) => [`/app/src/${n}.ts`, `export const ${n} = 1\n`]),
        ),
      },
    })
    const resolving: Planner = {
      name: 'resolving',
      tier: 0,
      gate: () => true,
      plan() {},
      async prefetch(t0, ctx) {
        for (const i of t0.imports) {
          await ctx.resolve(i.specifier)
        }
      },
    }
    await host.compile('/app/src/tree.ts', [resolving], { env })
    const cache = host.caches.plans.get(env.name)!
    const checks = vi.spyOn(cache, 'dependenciesOf')
    await invalidate(
      host.caches,
      { path: '/app/package.json', kind: 'change' },
      host,
    )
    expect(checks.mock.calls.length).toBeLessThanOrEqual(1)
  })
})

describe('an import the resolver answers external', () => {
  const resolving: Planner = {
    name: 'resolving',
    tier: 0,
    gate: () => true,
    plan() {},
    async prefetch(t0, ctx) {
      for (const i of t0.imports) {
        await ctx.resolve(i.specifier)
      }
    },
  }
  const modules = 20
  const setup = () => {
    const files: Record<string, string> = { '/app/package.json': '{}' }
    for (let m = 0; m < modules; m++) {
      files[`/app/m${m}.ts`] =
        `import a from 'pkg-a'\nimport b from 'pkg-b'\nexport const v = ${m}\n`
    }
    let local = false
    const host = new MemoryHost({
      files,
      // packages are external, until one of them is aliased to a project file
      resolve: (specifier) =>
        local && specifier === 'pkg-a'
          ? '/app/local-a.ts'
          : { id: specifier, external: true },
    })
    return { host, aliasToFile: () => (local = true) }
  }
  const asked = (host: MemoryHost, from: number) =>
    host.resolveCalls.slice(from).filter((c) => c.specifier.startsWith('pkg-'))
      .length

  it('is an answer: a file appearing or disappearing does not ask it again', async () => {
    const { host } = setup()
    for (let m = 0; m < modules; m++) {
      await host.compile(`/app/m${m}.ts`, [resolving], { env })
    }
    for (const change of [
      { path: '/app/new.ts', kind: 'add' },
      { path: '/app/new.ts', kind: 'unlink' },
    ] as const) {
      const before = host.resolveCalls.length
      if (change.kind === 'add') {
        host.write(change.path, 'export {}\n')
      }
      const res = await staleAfter(host.caches, change, host)
      expect(asked(host, before)).toBe(0)
      expect(res).toEqual([])
    }
  })

  it('is asked again when a package.json changes, and reports the module it now resolves differently for', async () => {
    const { host, aliasToFile } = setup()
    host.write('/app/local-a.ts', 'export default 1\n')
    await host.compile('/app/m0.ts', [resolving], { env })
    aliasToFile()
    const res = await staleAfter(
      host.caches,
      { path: '/app/package.json', kind: 'change' },
      host,
    )
    expect(res).toEqual(['/app/m0.ts'])
  })
})

describe('plan cache bookkeeping', () => {
  it('a plan re-published with other import targets keeps only its current dependency rows', async () => {
    const files: Record<string, string> = { '/app/a.ts': '' }
    for (let i = 0; i < 20; i++) {
      files[`/app/t${i}.ts`] = `export const make = ${i}\n`
    }
    const host = new MemoryHost({ files })
    const importing = (i: number) =>
      `import { make } from './t${i}'\nexport const a = make\n`
    await host.compile('/app/a.ts', planners(), { code: importing(0) })
    const once = stats(host)
    // the host transforms each new text (no watcher event in between)
    for (let i = 1; i < 20; i++) {
      await host.compile('/app/a.ts', planners(), { code: importing(i) })
    }
    const after = stats(host)
    expect(after.plans).toBe(1)
    expect(after.dependentEntries).toBe(once.dependentEntries)
    expect(after.dependentPaths).toBe(once.dependentPaths)
    // an earlier target's edit no longer concerns the plan
    const res = await staleAfter(
      host.caches,
      { path: '/app/t0.ts', kind: 'change' },
      host,
    )
    expect(res).toEqual([])
  })

  it('forgets the bookkeeping of files that were deleted', async () => {
    const host = new MemoryHost({
      files: { '/app/shared.ts': `export const make = 1\n` },
    })
    for (let i = 0; i < 30; i++) {
      const path = `/app/unique-${i}.ts`
      host.write(
        path,
        `import { make } from './shared'\nexport const u = make\n`,
      )
      await host.compile(path, planners())
      delete host.files[path]
      await invalidate(host.caches, { path, kind: 'unlink' }, host)
    }
    expect(stats(host)).toMatchObject({
      plans: 0,
      generations: 0,
      latest: 0,
      inFlight: 0,
      keyPaths: 0,
      trackedKeys: 0,
      dependentPaths: 0,
      dependentEntries: 0,
    })
  })

  it('keeps raw facts of existing files only', async () => {
    const host = new MemoryHost({ files: {} })
    for (let i = 0; i < 30; i++) {
      const dep = `/app/dep-${i}.ts`
      host.write(dep, `export const make = ${i}\n`)
      host.write(
        '/app/consumer.ts',
        `import { make } from './dep-${i}'\nexport const c = make\n`,
      )
      await invalidate(
        host.caches,
        { path: '/app/consumer.ts', kind: 'change' },
        host,
      )
      await host.compile('/app/consumer.ts', planners())
      delete host.files[dep]
      await invalidate(host.caches, { path: dep, kind: 'unlink' }, host)
    }
    // the consumer's plan read the last dependency, which is gone too
    expect(host.rawFacts.stats(false).rawFacts).toBe(0)
  })

  it('forgets the bookkeeping of a module no planner applies to', async () => {
    const host = new MemoryHost({ files: { '/app/plain.ts': 'export {}\n' } })
    await host.compile('/app/plain.ts', planners())
    expect(stats(host)).toMatchObject({ generations: 0, latest: 0 })
  })
})

describe('releasing an environment', () => {
  const server = envInfo({ name: 'ssr', type: 'server' })
  const files = {
    '/app/a.ts': `import { make } from './t'\nexport const a = make\n`,
    '/app/t.ts': `export const make = 1\n`,
  }

  it('drops its plans only: the other environments keep theirs, and it compiles again the same', async () => {
    const host = new MemoryHost({ files })
    const client = await host.compile('/app/a.ts', planners())
    await host.compile('/app/a.ts', planners(), { env: server })
    releaseEnvironment(host.caches, env.name)
    expect([...host.caches.plans.keys()]).toEqual([server.name])
    // the other environment's plan is still a validated hit
    await host.compile('/app/a.ts', planners(), { env: server })
    expect(host.caches.plans.get(server.name)!.counters.planHits).toBe(1)
    // compiling in the released environment starts over, with the same output
    const again = await host.compile('/app/a.ts', planners())
    expect(again!.code).toBe(client!.code)
    expect(again!.facts).toEqual(client!.facts)
    expect(stats(host)).toMatchObject({ plans: 1, planHits: 0 })
  })

  it('drops its resolution memo: the next compile asks the host again, the other environment does not', async () => {
    const host = new MemoryHost({ files })
    await host.compile('/app/a.ts', planners())
    await host.compile('/app/a.ts', planners(), { env: server })
    const asked = host.resolveCalls.length
    expect(asked).toBeGreaterThan(0)
    releaseEnvironment(host.caches, env.name)
    await host.compile('/app/a.ts', planners(), { env: server })
    expect(host.resolveCalls).toHaveLength(asked)
    await host.compile('/app/a.ts', planners())
    expect(host.resolveCalls.length).toBeGreaterThan(asked)
  })

  it('leaves nothing of the released plans reachable from the caches', async () => {
    const gc = (globalThis as { gc?: () => void }).gc
    expect(gc).toBeTypeOf('function')
    const host = new MemoryHost({ files })
    await host.compile('/app/a.ts', planners())
    const released = new WeakRef(host.caches.plans.get(env.name)!)
    releaseEnvironment(host.caches, env.name)
    await new Promise((r) => setImmediate(r))
    gc!()
    expect(released.deref()).toBeUndefined()
  })
})

describe('plans restored from an earlier process', () => {
  const files = {
    '/app/page.ts': `import { make } from './helper'\nexport const page = make()\n`,
    '/app/helper.ts': 'export const make = () => 1\n',
  }
  // the export the page reads changes (an export added beside it would not re-plan the page)
  const edited = "export { make } from './elsewhere'\n"

  /** The persisted plan of `/app/page.ts`, compiled by an earlier process (plain data). */
  async function persisted() {
    const out = await new MemoryHost({ files }).compile(
      '/app/page.ts',
      planners(),
    )
    return JSON.parse(JSON.stringify(out!.persisted))
  }

  it('a current plan joins the invalidation: an edit of what it read reports it', async () => {
    const host = new MemoryHost({ files })
    expect(await restorePlans(host.caches, [await persisted()], host)).toEqual(
      [],
    )
    expect(stats(host)).toMatchObject({ plans: 0, restored: 1 })
    host.write('/app/helper.ts', edited)
    const res = await staleAfter(
      host.caches,
      { path: '/app/helper.ts', kind: 'change' },
      host,
    )
    expect(res).toEqual(['/app/page.ts'])
    expect(stats(host)).toMatchObject({ restored: 0, dependentEntries: 0 })
  })

  it('a plan whose dependency changed meanwhile is returned, not restored', async () => {
    const host = new MemoryHost({
      files: { ...files, '/app/helper.ts': edited },
    })
    const stale = await restorePlans(host.caches, [await persisted()], host)
    expect(stale.map((k) => k.canonicalId)).toEqual(['/app/page.ts'])
    expect(stats(host)).toMatchObject({ restored: 0, dependentEntries: 0 })
  })

  it('a compile of the key replaces the restored plan', async () => {
    const host = new MemoryHost({ files })
    await restorePlans(host.caches, [await persisted()], host)
    await host.compile('/app/page.ts', planners())
    expect(stats(host)).toMatchObject({ plans: 1, restored: 0 })
  })
})

describe('a derived id compiled again after an edit', () => {
  const route = '/app/route.tsx'
  const chunk = `${route}?tsr-split=component`
  const files = {
    [route]: dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './shared'
      export const Route = createFileRoute('/')({
        component: () => make,
      })
    `),
    '/app/shared.ts': 'export const make = 1\n',
  }
  const routePlanners = () => [toySplitPlanner(), toySummaryPlanner()]
  const factsOf = async (host: MemoryHost, id: string) =>
    (await host.compile(id, routePlanners()))!.facts.planners['toy-summary']

  it('sees a dependency edit reported by a file event', async () => {
    const host = new MemoryHost({ files })
    await host.compile(route, routePlanners())
    const before = await factsOf(host, chunk)
    host.write('/app/shared.ts', 'export const other = 1\n')
    await invalidate(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    const after = await factsOf(host, chunk)
    expect(after).not.toEqual(before)
    expect(after).toEqual(await factsOf(host, route))
  })

  it('sees a dependency edit whose facts were marked stale without a file event', async () => {
    // the Rsbuild host marks the facts of files a read found missing stale
    // at each compilation (`forgetMisses`), outside `invalidate`
    const host = new MemoryHost({ files })
    await host.compile(route, routePlanners())
    const before = await factsOf(host, chunk)
    host.write('/app/shared.ts', 'export const other = 1\n')
    host.rawFacts.markStale('/app/shared.ts')
    const after = await factsOf(host, chunk)
    expect(after).not.toEqual(before)
    expect(after).toEqual(await factsOf(host, route))
  })

  it('sees a dependency edit whose facts the cache dropped', async () => {
    // the Rsbuild host keeps the raw facts of the files its compilation
    // still holds (`retain`); a dropped file is read again when asked
    const host = new MemoryHost({ files })
    await host.compile(route, routePlanners())
    const before = await factsOf(host, chunk)
    host.write('/app/shared.ts', 'export const other = 1\n')
    host.rawFacts.retain((id) => !id.startsWith('/app/shared.ts'))
    const after = await factsOf(host, chunk)
    expect(after).not.toEqual(before)
    expect(after).toEqual(await factsOf(host, route))
  })

  it('sees a dependency that was missing once a host marks its facts stale', async () => {
    // a resolution found the file, which was deleted before its facts were
    // read; it is saved again without an event: the Rsbuild host marks
    // missing files stale at each compilation (`forgetMisses`)
    const { ['/app/shared.ts']: shared, ...rest } = files
    const host = new MemoryHost({
      files: rest,
      resolve: (spec) => (spec === './shared' ? '/app/shared.ts' : null),
    })
    await host.compile(route, routePlanners())
    const before = await factsOf(host, chunk)
    host.write('/app/shared.ts', shared)
    host.rawFacts.markStale('/app/shared.ts')
    const after = await factsOf(host, chunk)
    expect(after).not.toEqual(before)
    expect(after).toEqual(
      await factsOf(new MemoryHost({ files: host.files }), route),
    )
  })

  it.each([
    ['a file event', 'event'],
    ['facts marked stale', 'stale'],
  ] as const)(
    'sees a dependency edit made while its importer compiles (%s)',
    async (_, report) => {
      // the dependency is saved right after the compile read it: the compile
      // holds the old text's facts, and its plan must not stand for the new text
      class SavedAfterRead extends MemoryHost {
        private saved = false
        override async readFile(path: string): Promise<string | null> {
          const text = await super.readFile(path)
          if (path === '/app/shared.ts' && !this.saved) {
            this.saved = true
            this.write(path, 'export const other = 1\n')
            if (report === 'event') {
              void invalidate(this.caches, { path, kind: 'change' }, this)
            } else {
              this.rawFacts.markStale(path)
            }
          }
          return text
        }
      }
      const host = new SavedAfterRead({ files })
      await host.compile(route, routePlanners())
      const chunkFacts = await factsOf(host, chunk)
      expect(chunkFacts).toEqual(
        await factsOf(new MemoryHost({ files: host.files }), route),
      )
      expect(chunkFacts).toEqual(await factsOf(host, route))
    },
  )
})

// Rsbuild's RSC layer resolves with `react-server` through rule `resolve`
// options, in the environment of the SSR layer: two resolvers of one
// environment (`HostServices.resolveScope`, R35)
describe('two resolvers of one environment', () => {
  const files = {
    '/app/page.ts': `import { make } from '#cond'\nexport const p = make\n`,
    '/app/client.ts': 'export const make = 1\n',
    '/app/server.ts': 'export const make = 2\n',
    '/app/package.json': '{}\n',
  }
  const plain: PlanKey = {
    env: env.name,
    canonicalId: '/app/page.ts',
    configKey: 'cfg',
  }
  const layered: PlanKey = { ...plain, configKey: 'cfg-layer' }
  const setup = () => {
    // what `#cond` names by each resolver's conditions
    const targets = { plain: '/app/client.ts', layer: '/app/server.ts' }
    const host = new MemoryHost({
      files,
      resolve: (specifier) => (specifier === '#cond' ? targets.plain : null),
    })
    const layerHost: HostServices = {
      rawFacts: host.rawFacts,
      resolveScope: 'layer',
      resolve: (specifier) =>
        Promise.resolve(specifier === '#cond' ? { id: targets.layer } : null),
    }
    const compile = (key: PlanKey) =>
      compileModule(
        {
          id: key.canonicalId,
          code: files['/app/page.ts'],
          env: key === layered ? envInfo({ layer: 'layer' }) : env,
          planners: [toySummaryPlanner({ subpathImports: true })],
          config: { configKey: key.configKey, perPlanner: {} },
          wantMap: false,
        },
        key === layered ? layerHost : host,
        host.caches,
      )
    const hostOf = (key: PlanKey) =>
      key.configKey === layered.configKey ? layerHost : host
    const resolved = (key: PlanKey) =>
      host.caches.plans
        .get(env.name)!
        .dependenciesOf(key)
        ?.flatMap((fp) =>
          fp.kind === 'resolution' && fp.specifier === '#cond'
            ? [fp.resolved]
            : [],
        )
    return { targets, host, compile, hostOf, resolved }
  }
  const manifestChange = {
    path: '/app/package.json',
    kind: 'change',
  } as const

  it("each resolver's answers are memoised apart", async () => {
    const { compile, resolved } = setup()
    await compile(plain)
    await compile(layered)
    expect(resolved(plain)).toEqual(['/app/client.ts'])
    expect(resolved(layered)).toEqual(['/app/server.ts'])
  })

  it("an invalidation checks each plan with its own module's resolver", async () => {
    const { targets, host, compile, hostOf } = setup()
    await compile(plain)
    await compile(layered)
    const kept = await staleAfter(host.caches, manifestChange, hostOf)
    expect(kept).toEqual([])
    await compile(plain)
    await compile(layered)
    // only the layer's conditions name another file now
    targets.layer = '/app/client.ts'
    host.write('/app/package.json', '{ "imports": {} }\n')
    const moved = await staleAfter(host.caches, manifestChange, hostOf)
    expect(moved).toEqual(['/app/page.ts'])
    // (the layer's plan only)
    const cache = host.caches.plans.get(env.name)!
    expect(cache.get(plain)).not.toBeNull()
    expect(cache.get(layered)).toBeNull()
  })

  it("a restored plan is checked with its own module's resolver", async () => {
    const out = await setup().compile(layered)
    const persisted = JSON.parse(JSON.stringify(out!.persisted))
    const restoring = setup()
    expect(
      await restorePlans(restoring.host.caches, [persisted], restoring.hostOf),
    ).toEqual([])
  })
})
