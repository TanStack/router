/**
 * The plan cache's bookkeeping (generations, latest revisions, the
 * dependents index) is bounded by the live plans: it does not grow with
 * edits that change import targets, nor with unique files that come and go.
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import { PlanCache } from '../src/compiler/cache'
import { planKeyString } from '../src/compiler/identity'
import { MemoryHost, envInfo, toySummaryPlanner } from './helpers'
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

  it('a file change evicts the plans of every identity at that path', async () => {
    const host = new MemoryHost({
      files: {
        '/app/a.ts': `import { make } from './shared'\nexport const a = make\n`,
        '/app/shared.ts': 'export const make = 1\n',
      },
    })
    await host.compile('/app/a.ts', planners())
    await host.compile('/app/a.ts?flavour=b', planners())
    expect(stats(host)).toMatchObject({ plans: 2, keyPaths: 1, trackedKeys: 2 })
    const res = await invalidate(
      host.caches,
      { path: '/app/a.ts', kind: 'change' },
      host,
    )
    expect(res.evicted.map((k) => k.canonicalId).sort()).toEqual([
      '/app/a.ts',
      '/app/a.ts?flavour=b',
    ])
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
    const same = await invalidate(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    expect(same.dependents).toEqual([])
    expect(host.resolveCalls).toEqual([])
    // a change of the export facts: the importer is stale, still without a resolution
    host.write(
      '/app/shared.ts',
      'export const make = 1\nexport const more = 2\n',
    )
    const changed = await invalidate(
      host.caches,
      { path: '/app/shared.ts', kind: 'change' },
      host,
    )
    expect(changed.dependents.map((k) => k.canonicalId)).toEqual([
      '/app/consumer.ts',
    ])
    expect(host.resolveCalls).toEqual([])
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
    const res = await invalidate(
      host.caches,
      { path: '/app/t0.ts', kind: 'change' },
      host,
    )
    expect(res.dependents).toEqual([])
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
