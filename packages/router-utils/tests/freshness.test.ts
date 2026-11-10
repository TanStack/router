/**
 * Freshness at the host boundary: a host forwards every file event to
 * `invalidate()`, takes its environment's stale set and has its bundler
 * build those modules again; it keeps no record of the events it saw.
 *
 * - Repeating an invalidation is harmless (I1): while a file's text is
 *   unchanged, another `invalidate()` of it changes no plan, restarts no
 *   compile and adds nothing to a stale set.
 * - After any edits, the same as a fresh start (I3, "property (b)"): saves,
 *   in-place saves, deletions and re-adds, each event delivered one to
 *   three times to each environment's hook in any order, with compiles
 *   interleaved; once the stale sets are taken and built, every output
 *   equals a cold compile of the final files.
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  envInfo,
  toyEnvPlanner,
  toySummaryPlanner,
} from './helpers'
import type {
  CompileOutput,
  EnvInfo,
  InvalidateChange,
  Planner,
} from '../src/compiler'

const RECOGNIZER = {
  factories: {
    'toy-start': {
      createServerOnlyFn: 'serverOnly',
      createClientOnlyFn: 'clientOnly',
    },
  },
  builderKinds: new Set<string>(),
  terminal: {},
  envOnlyKinds: {
    serverOnly: 'server' as const,
    clientOnly: 'client' as const,
  },
}

const planners = (): Array<Planner> => [toySummaryPlanner(), toyEnvPlanner()]
const CLIENT = envInfo({ name: 'client', type: 'client' })
const SSR = envInfo({ name: 'ssr', type: 'server' })
const ENVS = [CLIENT, SSR]

const memoryHost = (files: Record<string, string>) =>
  new MemoryHost({ files, recognizer: RECOGNIZER })

describe('repeating an invalidation', () => {
  // `page.ts` imports `user.ts`, which imports `db.ts` (a checkout writes
  // `db.ts`, then `user.ts`, and the watcher reports them apart)
  const files = {
    '/app/db.ts': 'export const make = 1\n',
    '/app/user.ts': dedent(`
      import { make as inner } from './db'
      export const make = inner
    `),
    '/app/page.ts': dedent(`
      import { make } from './user'
      export const page = make
    `),
  }
  const factsOf = (out: CompileOutput | null) =>
    out!.facts.planners['toy-summary']

  it('a dependent saved while its dependency is invalidated still re-plans its importers', async () => {
    const host = memoryHost(files)
    await host.compile('/app/user.ts', planners())
    await host.compile('/app/page.ts', planners())
    host.write(
      '/app/db.ts',
      dedent(`
        import { createServerOnlyFn } from 'toy-start'
        export const make = createServerOnlyFn(() => 1)
      `),
    )
    host.write(
      '/app/user.ts',
      dedent(`
        import { createClientOnlyFn } from 'toy-start'
        export const make = createClientOnlyFn(() => 2)
      `),
    )
    // the first batch holds `db.ts` only: `user.ts` is stale, and its
    // bundler builds it again from its new text
    await invalidate(host.caches, { path: '/app/db.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/user.ts'])
    await host.compile('/app/user.ts', planners())
    // the second batch holds `user.ts`: nothing the caches read of it is
    // its new text, so its importers re-plan
    await invalidate(
      host.caches,
      { path: '/app/user.ts', kind: 'change' },
      host,
    )
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/page.ts'])
    const page = await host.compile('/app/page.ts', planners())
    expect(factsOf(page)).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/page.ts', planners())),
    )
  })

  it('changes no plan, restarts no compile and adds nothing to a stale set while the text is unchanged', async () => {
    const reads: Array<() => void> = []
    let hold = false
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      onRead: () =>
        hold ? new Promise<void>((r) => reads.push(r)) : undefined,
    })
    await host.compile('/app/user.ts', planners())
    await host.compile('/app/page.ts', planners())
    host.write(
      '/app/user.ts',
      dedent(`
        import { make as inner } from './db'
        export const make = () => inner
      `),
    )
    await invalidate(
      host.caches,
      { path: '/app/user.ts', kind: 'change' },
      host,
    )
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/page.ts'])
    await host.compile('/app/user.ts', planners())
    await host.compile('/app/page.ts', planners())
    const cache = host.caches.plans.get(CLIENT.name)!
    const [pageKey] = cache.keysAt('/app/page.ts')
    const [userKey] = cache.keysAt('/app/user.ts')
    const before = {
      page: cache.get(pageKey!),
      user: cache.get(userKey!),
      pageGeneration: cache.generation(pageKey!),
      factsVersion: host.rawFacts.version,
      fileSetVersion: host.caches.fileSetVersion,
    }
    // an echo of the same change, twice at once (two environments' hooks),
    // while a compile of an importer is in flight
    host.write('/app/other.ts', "import { make } from './user'\n")
    hold = true
    const compiling = host.compile('/app/other.ts', planners())
    const repeats = [
      invalidate(host.caches, { path: '/app/user.ts', kind: 'change' }, host),
      invalidate(host.caches, { path: '/app/user.ts', kind: 'change' }, host),
    ]
    while (reads.length > 0 || hold) {
      await new Promise((r) => setTimeout(r, 1))
      hold = false
      reads.splice(0).forEach((release) => release())
    }
    await Promise.all(repeats)
    const other = await compiling
    expect(other!.diagnostics.map((d) => d.code)).not.toContain(
      'compile-overtaken',
    )
    expect({
      page: cache.get(pageKey!),
      user: cache.get(userKey!),
      pageGeneration: cache.generation(pageKey!),
      factsVersion: host.rawFacts.version,
      fileSetVersion: host.caches.fileSetVersion,
    }).toEqual(before)
    expect(cache.get(pageKey!)).toBe(before.page)
    expect(cache.get(userKey!)).toBe(before.user)
    for (const env of ENVS) {
      expect(host.caches.stale.has(env.name)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// after any edits, the same as a fresh start
// ---------------------------------------------------------------------------

/** A seeded PRNG (mulberry32): a failing seed replays the same choices. */
function prng(seed: number): (n: number) => number {
  let a = seed >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

const MODULES = 6
const pathOf = (i: number) => `/app/m${i}.ts`

/** A module text of `m<i>`: what it exports and what it reads of an earlier module (the graph stays acyclic). */
function textOf(i: number, pick: (n: number) => number): string {
  const n = pick(3)
  const j = i > 0 ? pick(i) : -1
  const shapes: Array<() => string> = [
    () => `export const make = ${n}\n`,
    () => `export const other = ${n}\n`,
    () =>
      `import { createServerOnlyFn } from 'toy-start'\nexport const make = createServerOnlyFn(() => ${n})\n`,
    () =>
      `import { createClientOnlyFn } from 'toy-start'\nexport const make = createClientOnlyFn(() => ${n})\n`,
    () =>
      `import { wrapServer } from 'toy-start'\nexport const make = wrapServer(() => ${n})\n`,
    () => '',
  ]
  if (j >= 0) {
    shapes.push(
      () => `export { make } from './m${j}'\n`,
      () => `export * from './m${j}'\n`,
      () =>
        `import { make as inner } from './m${j}'\nexport const make = inner\n`,
      () => `import { make } from './m${j}'\nexport const use = make\n`,
    )
  }
  return shapes[pick(shapes.length)]!()
}

type Snapshot = {
  code: string
  facts: CompileOutput['facts']
  diagnostics: Array<string>
} | null

const snapshot = (out: CompileOutput | null): Snapshot =>
  out && {
    code: out.code,
    facts: out.facts,
    diagnostics: out.diagnostics.map((d) => `${d.severity}:${d.code}`),
  }

/**
 * One run: a memory host, its two environments' bundlers (the latest build
 * of each module they hold) and their hooks.
 */
async function run(seed: number): Promise<void> {
  const pick = prng(seed)
  const files: Record<string, string> = {}
  for (let i = 0; i < MODULES; i++) {
    files[pathOf(i)] = textOf(i, pick)
  }
  const host = new MemoryHost({
    files,
    recognizer: RECOGNIZER,
    // a read takes a moment: writes and events land in between
    onRead: () => (pick(3) === 0 ? sleep(pick(3)) : undefined),
  })
  const caches = host.caches
  const tasks = new Set<Promise<unknown>>()
  const spawn = (p: Promise<unknown>) => {
    const task = p.finally(() => tasks.delete(task))
    tasks.add(task)
  }
  const later = (ms: number, fn: () => void) => spawn(sleep(ms).then(fn))
  /** Files an in-place save truncated, whose text is about to be written: a bundler reads them once written (Vite's `readModifiedFile`). */
  const writing = new Map<string, Promise<void>>()

  const outputs = new Map(
    ENVS.map((e) => [e.name, new Map<string, Snapshot>()]),
  )
  const builds = new Map<string, number>()
  /** The bundler of `env` builds the module of `path` (its latest build is the one it holds). */
  const build = (env: EnvInfo, path: string) =>
    spawn(
      (async () => {
        const key = `${env.name}\0${path}`
        const n = (builds.get(key) ?? 0) + 1
        builds.set(key, n)
        await writing.get(path)
        const code = host.files[path]
        const out =
          code === undefined
            ? undefined
            : snapshot(await host.compile(path, planners(), { env, code }))
        if (builds.get(key) === n) {
          if (out === undefined) {
            outputs.get(env.name)!.delete(path)
          } else {
            outputs.get(env.name)!.set(path, out)
          }
        }
      })(),
    )
  /** An environment's hook: forwards the event, takes, tells its bundler. */
  const hook = async (env: EnvInfo, change: InvalidateChange) => {
    await invalidate(caches, change, host)
    const taken = caches.stale.take(env.name, {
      held: change.kind === 'add',
    })
    // the bundler that reported the event builds the file's own modules
    for (const path of new Set([change.path, ...taken])) {
      build(env, path)
    }
  }
  /** One event, delivered one to three times to each environment's hook, each after its own delay. */
  const deliver = (change: InvalidateChange) => {
    for (const env of ENVS) {
      for (let k = 1 + pick(3); k > 0; k--) {
        later(pick(12), () => spawn(hook(env, change)))
      }
    }
  }

  for (const env of ENVS) {
    for (let i = 0; i < MODULES; i++) {
      build(env, pathOf(i))
    }
  }
  await settle(tasks)

  for (let step = 0; step < 30; step++) {
    const i = pick(MODULES)
    const path = pathOf(i)
    if (writing.has(path)) {
      continue
    }
    const exists = host.files[path] !== undefined
    const action = pick(10)
    if (!exists) {
      // re-added
      host.write(path, textOf(i, pick))
      deliver({ path, kind: 'add' })
    } else if (action === 0) {
      delete host.files[path]
      deliver({ path, kind: 'unlink' })
    } else if ((action === 1 || action === 6) && host.files[path] !== '') {
      // saved in place: truncated, reported, then written (no event of
      // its own: the watcher drops a change within a moment of the last).
      // The caches know the module it held (an importer read it): a file
      // nothing read is read empty by a compile that finds it truncated,
      // with no event left to tell
      let text = textOf(i, pick)
      while (text === '') {
        text = textOf(i, pick)
      }
      await host.rawFacts.get(path, CLIENT.name)
      host.write(path, '')
      writing.set(
        path,
        sleep(1 + pick(25)).then(() => {
          host.write(path, text)
          writing.delete(path)
        }),
      )
      spawn(writing.get(path)!)
      deliver({ path, kind: 'change' })
    } else if (action === 2) {
      // a module requested again (a page reload)
      build(ENVS[pick(2)]!, path)
    } else if (action === 3) {
      // a touch: saved unchanged
      deliver({ path, kind: 'change' })
    } else if (action <= 5 && i > 0) {
      // a checkout: a dependency, then a module that reads it, written a
      // moment apart, each reported once its write landed
      const d = pick(i)
      const dep = pathOf(d)
      if (host.files[dep] !== undefined && !writing.has(dep)) {
        host.write(dep, textOf(d, pick))
        deliver({ path: dep, kind: 'change' })
        const gap = 5 + pick(16)
        const text = `import { make as inner } from './m${d}'\nexport const make = inner\n`
        later(gap, () => {
          if (host.files[path] !== undefined && !writing.has(path)) {
            host.write(path, text)
            deliver({ path, kind: 'change' })
          }
        })
      }
    } else {
      host.write(path, textOf(i, pick))
      deliver({ path, kind: 'change' })
    }
    await sleep(pick(6))
  }

  // the events stop: once every invalidation ended, the stale sets are
  // taken and built until nothing is stale
  for (;;) {
    await settle(tasks)
    await caches.settled()
    let more = false
    for (const env of ENVS) {
      for (const path of caches.stale.take(env.name, { held: true })) {
        more = true
        build(env, path)
      }
    }
    if (!more && tasks.size === 0) {
      break
    }
  }

  const fresh = memoryHost(host.files)
  for (const env of ENVS) {
    const held = outputs.get(env.name)!
    const final = Object.keys(host.files).sort()
    expect([...held.keys()].sort(), `seed ${seed}, ${env.name}`).toEqual(final)
    for (const path of final) {
      expect(
        held.get(path),
        `seed ${seed}, ${env.name}, ${path}:\n${host.files[path]}`,
      ).toEqual(snapshot(await fresh.compile(path, planners(), { env })))
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(tasks: Set<Promise<unknown>>): Promise<void> {
  while (tasks.size > 0) {
    await Promise.allSettled([...tasks])
  }
}

describe('after any edits', () => {
  it('every output equals a cold compile of the final files', async () => {
    const seeds = Array.from({ length: 48 }, (_, i) => 0x5eed + i)
    // a few runs at once: their timers interleave
    for (let at = 0; at < seeds.length; at += 8) {
      await Promise.all(seeds.slice(at, at + 8).map(run))
    }
  }, 30_000)

  it('keeps no stale path and no read record beyond the live files', async () => {
    const host = memoryHost({ '/app/shared.ts': 'export const make = 1\n' })
    for (let i = 0; i < 200; i++) {
      const path = `/app/unique-${i}.ts`
      host.write(
        path,
        "import { make } from './shared'\nexport const u = make\n",
      )
      await invalidate(host.caches, { path, kind: 'add' }, host)
      await host.compile(path, planners())
      delete host.files[path]
      await invalidate(host.caches, { path, kind: 'unlink' }, host)
    }
    expect(host.rawFacts.stats(false).seenPaths).toBeLessThanOrEqual(1)
    expect(host.caches.stale.stats()).toEqual({ stalePaths: 0, staleHeld: 0 })
  })
})
