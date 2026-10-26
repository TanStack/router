/**
 * The plan cache's bookkeeping (generations, latest revisions, the
 * dependents index) is bounded by the live plans: it does not grow with
 * edits that change import targets, nor with unique files that come and go.
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import { MemoryHost, envInfo, toySummaryPlanner } from './helpers'

const planners = () => [toySummaryPlanner()]
const env = envInfo()
const stats = (host: MemoryHost) =>
  host.caches.plans.get(env.name)!.stats(false)

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
