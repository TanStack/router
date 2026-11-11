/**
 * Freshness at the host boundary: a host forwards every file event to
 * `invalidate()`, takes its environment's stale set and has its bundler
 * build those modules again; it keeps no record of the events it saw.
 *
 * - Repeating an invalidation is harmless (I1): while a file's text is
 *   unchanged, another `invalidate()` of it changes no plan, restarts no
 *   compile and adds nothing to a stale set.
 * - After any edits, the same as a fresh start (I3, "property (b)"): saves,
 *   in-place saves, deletions and re-adds (a stash and pop: the same text,
 *   modules requested in between), each event delivered one to
 *   three times to each environment's hook in any order, with compiles
 *   interleaved; once the stale sets are taken and built, every output
 *   equals a cold compile of the final files.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    await compiling
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

  // `x.ts` imports `./types`, which no file answers (a types-only `.d.ts`
  // the compiler's resolver finds nothing for: the app builds and runs). It
  // compiles while another file is saved, and the save reaches a second
  // hook. Neither event makes `./types` resolve, so the compile goes on.
  // Source: design 3 step 4 review, finding 3 (every file event restarted
  // the compiles in flight that met a failed resolution).
  it('a compile in flight that met a failed import is not restarted by an unrelated save or its repeat', async () => {
    const reads: Array<() => void> = []
    let hold = false
    const host = new MemoryHost({
      files: {
        '/app/u.ts': 'export const u = 1\n',
        '/app/k.ts': 'export const make = 1\n',
        '/app/x.ts': dedent(`
          import { T } from './types'
          import { make } from './k'
          export const use = make
        `),
      },
      recognizer: RECOGNIZER,
      onRead: (path) =>
        hold && path === '/app/k.ts'
          ? new Promise<void>((r) => reads.push(r))
          : undefined,
    })
    await invalidate(host.caches, { path: '/app/u.ts', kind: 'change' }, host)
    hold = true
    const compiling = host.compile('/app/x.ts', planners())
    while (reads.length === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    const cache = host.caches.plans.get(CLIENT.name)!
    const [key] = cache.keysAt('/app/x.ts')
    const generation = cache.generation(key!)
    host.write('/app/u.ts', 'export const u = 2\n')
    await invalidate(host.caches, { path: '/app/u.ts', kind: 'change' }, host)
    await invalidate(host.caches, { path: '/app/u.ts', kind: 'change' }, host)
    expect(cache.generation(key!)).toBe(generation)
    hold = false
    reads.splice(0).forEach((release) => release())
    await compiling
    expect(cache.get(key!)).not.toBeNull()
  })

  // The same compile in flight, and `a.ts` appears meanwhile: the watcher
  // folds its creation into a change (a removal and re-creation), and a
  // module compiled since read it. The change makes `./a` resolve, so the
  // compile that found nothing there is done again.
  it('a compile in flight that met a failed import is restarted when the import resolves now', async () => {
    const reads: Array<() => void> = []
    let hold = false
    const importer = dedent(`
      import { make } from './a'
      import { other } from './k'
      export const use = make
    `)
    const host = new MemoryHost({
      files: {
        '/app/k.ts': 'export const other = 1\n',
        '/app/x.ts': importer,
      },
      recognizer: RECOGNIZER,
      onRead: (path) =>
        hold && path === '/app/k.ts'
          ? new Promise<void>((r) => reads.push(r))
          : undefined,
    })
    hold = true
    const compiling = host.compile('/app/x.ts', planners())
    while (reads.length === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    host.write('/app/a.ts', SERVER_ONLY)
    host.write('/app/y.ts', importer.replace("'./k'", "'./a'"))
    await host.compile('/app/y.ts', planners())
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    hold = false
    while (reads.length > 0) {
      reads.splice(0).forEach((release) => release())
      await new Promise((r) => setTimeout(r, 1))
    }
    await compiling
    const factsOf = (out: CompileOutput | null) => out?.facts.planners
    expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/x.ts', planners())),
    )
  })

  // A `package.json` or tsconfig saved once moves the file set (what
  // specifiers resolve to may have changed); the same event through a
  // second hook, or a touch, finds the text the caches read.
  // Source: design 3 step 4 review, finding 3 (a repeat moved the file
  // set again: the resolution memo dropped, the resolutions under the
  // directory asked again).
  it.for(['/app/package.json', '/app/tsconfig.json'])(
    'a repeat of an event of %s moves no file set and asks no resolution',
    async (path) => {
      const host = memoryHost({
        [path]: '{"name":"a"}',
        '/app/k.ts': 'export const make = 1\n',
        '/app/x.ts': "import { make } from './k'\nexport const use = make\n",
      })
      await host.compile('/app/x.ts', planners())
      host.write(path, '{"name":"b"}')
      await invalidate(host.caches, { path, kind: 'change' }, host)
      const fileSetVersion = host.caches.fileSetVersion
      const resolverCalls = host.resolveCalls.length
      await invalidate(host.caches, { path, kind: 'change' }, host)
      expect(host.caches.fileSetVersion).toBe(fileSetVersion)
      expect(host.resolveCalls.length).toBe(resolverCalls)
    },
  )
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
 * of each module they hold) and their hooks, on the virtual clock (`drive`).
 * `seed` decides the edits, the event deliveries and the read delays;
 * `stretch` adds 0 to `jitter - 1` ms to each of the run's sleeps from a
 * generator of its own, as load does on a real clock: (seed, stretch,
 * jitter) replays one schedule exactly.
 */
async function run(
  seed: number,
  { stretch = 0, jitter = 0 }: { stretch?: number; jitter?: number } = {},
): Promise<void> {
  const pick = prng(seed)
  const stretched = prng(stretch)
  const sleep = (ms: number) =>
    new Promise<void>((r) =>
      setTimeout(r, ms + (jitter > 0 ? stretched(jitter) : 0)),
    )
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
      const text = host.files[path]!
      delete host.files[path]
      deliver({ path, kind: 'unlink' })
      if (pick(2) === 0) {
        // a stash and pop: modules are requested while the file is gone,
        // and it is back with the same text before the events are read
        // (reported as created, or as modified: Rspack's form for a file
        // its last compilation read)
        for (const env of ENVS) {
          build(env, pathOf(pick(MODULES)))
        }
        const kind = pick(2) === 0 ? 'add' : 'change'
        later(1 + pick(6), () => {
          if (host.files[path] === undefined) {
            host.write(path, text)
            deliver({ path, kind })
          }
        })
      }
    } else if (action === 1 || action === 6) {
      // saved in place: truncated, reported, then written (no event of
      // its own: the watcher drops a change within a moment of the last).
      // The caches know the text it held, empty or not (an importer read
      // it): a file nothing read is read empty by a compile that finds it
      // truncated, with no event left to tell
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
  const row = `seed ${seed}, stretch ${stretch}, jitter ${jitter}`
  for (const env of ENVS) {
    const held = outputs.get(env.name)!
    const final = Object.keys(host.files).sort()
    expect([...held.keys()].sort(), `${row}, ${env.name}`).toEqual(final)
    for (const path of final) {
      expect(
        held.get(path),
        `${row}, ${env.name}, ${path}:\n${host.files[path]}`,
      ).toEqual(snapshot(await fresh.compile(path, planners(), { env })))
    }
  }
}

const realImmediate = setImmediate

/**
 * Runs `p` on the virtual clock: every microtask settles, then the next
 * timer fires, one at a time, until `p` ends. The order of a run's timers
 * and reads is then a function of its row alone.
 */
async function drive(p: Promise<void>): Promise<void> {
  const run: { done: boolean; error?: unknown } = { done: false }
  p.then(
    () => {
      run.done = true
    },
    (e: unknown) => {
      run.done = true
      run.error = e ?? new Error('rejected')
    },
  )
  for (let idle = 0; ; ) {
    await new Promise<void>((r) => realImmediate(r))
    if (run.done) {
      break
    }
    if (vi.getTimerCount() === 0) {
      // nothing left to fire, and the run waits on something that never settles
      if (++idle > 5) {
        throw new Error('the run waits with no timer left')
      }
      continue
    }
    idle = 0
    vi.advanceTimersToNextTimer()
  }
  if (run.error) {
    throw run.error
  }
}

async function settle(tasks: Set<Promise<unknown>>): Promise<void> {
  while (tasks.size > 0) {
    await Promise.allSettled([...tasks])
  }
}

const SEEDS = Array.from({ length: 48 }, (_, i) => 0x5eed + i)

/**
 * Rows that found defects (seed, stretch, jitter): a file back reported as
 * a change, the first in-place save of an empty file, a removed file read
 * again before its return was reported.
 */
const FOUND: Array<[number, { stretch: number; jitter: number }]> = [
  [24309, { stretch: 16, jitter: 12 }],
  [24335, { stretch: 86, jitter: 12 }],
  [24301, { stretch: 93, jitter: 12 }],
  [24316, { stretch: 115, jitter: 16 }],
  [24317, { stretch: 126, jitter: 16 }],
  [24310, { stretch: 241, jitter: 16 }],
  [24303, { stretch: 46, jitter: 6 }],
  [24329, { stretch: 96, jitter: 16 }],
  [24341, { stretch: 139, jitter: 16 }],
]

describe('after any edits', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('every output equals a cold compile of the final files', async () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setImmediate',
        'clearImmediate',
        'Date',
        'performance',
      ],
    })
    // each seed as scheduled, then stretched: a few stretch generators per
    // jitter, and the rows that found defects
    const rows: Array<[number, { stretch?: number; jitter?: number }]> = [
      ...SEEDS.map((seed) => [seed, {}] as [number, object]),
      ...[4, 8, 12].flatMap((jitter) =>
        [1, 2].flatMap((stretch) =>
          SEEDS.map((seed) => [seed, { stretch, jitter }] as [number, object]),
        ),
      ),
      ...FOUND,
    ]
    for (const [seed, stretch] of rows) {
      await drive(run(seed, stretch))
    }
    // (about 2 s here; CI's macOS runners took over 30 s beside the other files)
  }, 180_000)

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
    // files created empty, each event read waiting in vain
    for (let i = 0; i < 3; i++) {
      const path = `/app/empty-${i}.ts`
      host.write(path, '')
      await invalidate(host.caches, { path, kind: 'add' }, host)
      delete host.files[path]
      await invalidate(host.caches, { path, kind: 'unlink' }, host)
    }
    expect(host.rawFacts.stats(false).seenPaths).toBeLessThanOrEqual(1)
    expect(host.rawFacts.stats(false).emptyReadPaths).toBe(0)
    expect(host.caches.stale.stats()).toEqual({ stalePaths: 0, staleHeld: 0 })
  })
})

const SERVER_ONLY = dedent(`
  import { createServerOnlyFn } from 'toy-start'
  export const make = createServerOnlyFn(() => 1)
`)

describe('events that move the file set', () => {
  const IMPORTER = "import { make } from './a'\nexport const use = make\n"
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

  // `a.ts` was created in the session; it is removed, a module that imports
  // it is compiled for the first time while it is gone, and it is created
  // again with the same text. Both events arrive once it is back: the
  // removal is no repeat (the file was gone for a while, and something
  // looked for it), so the importer's failed resolution is asked again.
  // The second event is an `add`, or a `change` (Rspack reports a file the
  // last compilation read as modified).
  // Source: design 3 steps 0-1 review, finding 1 (a stash and pop, a
  // checkout and back).
  it.for([['unlink', 'add'] as const, ['unlink', 'change'] as const])(
    'a file removed and created again with the same text re-plans what looked for it meanwhile (%s, %s)',
    async (events) => {
      const host = memoryHost({})
      host.write('/app/a.ts', SERVER_ONLY)
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, host)
      await host.compile('/app/a.ts', planners())
      delete host.files['/app/a.ts']
      host.write('/app/c.ts', IMPORTER)
      await host.compile('/app/c.ts', planners())
      host.write('/app/a.ts', SERVER_ONLY)
      for (const kind of events) {
        await invalidate(host.caches, { path: '/app/a.ts', kind }, host)
      }
      expect(host.caches.stale.take(CLIENT.name, { held: true })).toContain(
        '/app/c.ts',
      )
      expect(factsOf(await host.compile('/app/c.ts', planners()))).toEqual(
        factsOf(await memoryHost(host.files).compile('/app/c.ts', planners())),
      )
    },
  )

  // `a.ts` is removed, and its removal is applied while it is gone; a module
  // that imports it is compiled meanwhile (again, or for the first time);
  // the file comes back reported as modified (Rsbuild: another environment's
  // last compilation still lists it; the router's webpack-family host
  // reports every created file so). The caches hold nothing of the path by
  // then: a change of a path nothing knows that reads as a file is a
  // creation, and the importer's failed resolution is asked again.
  // Source: CI failure of property (b), seed 24344.
  it.for([
    { name: 'compiled before the removal too', before: true },
    { name: 'compiled for the first time meanwhile', before: false },
  ])(
    'a file removed and back as a change re-plans what looked for it meanwhile (importer $name)',
    async ({ before }) => {
      const host = memoryHost({ '/app/a.ts': SERVER_ONLY })
      await host.compile('/app/a.ts', planners())
      host.write('/app/c.ts', IMPORTER)
      if (before) {
        await host.compile('/app/c.ts', planners())
      }
      delete host.files['/app/a.ts']
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'unlink' }, host)
      host.caches.stale.take(CLIENT.name, { held: true })
      await host.compile('/app/c.ts', planners())
      host.write('/app/a.ts', SERVER_ONLY)
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      expect(host.caches.stale.take(CLIENT.name, { held: true })).toContain(
        '/app/c.ts',
      )
      expect(factsOf(await host.compile('/app/c.ts', planners()))).toEqual(
        factsOf(await memoryHost(host.files).compile('/app/c.ts', planners())),
      )
    },
  )

  // `a.ts` is removed and created again with the same text within the
  // watcher's moment: one change reaches the caches, no removal (chokidar
  // folds the two into a change; Rspack lists a file back in its batch as
  // modified). A module compiled meanwhile found nothing at `./a`. The
  // change repeats the text the caches read, and still asks the failed
  // resolutions again: any file event may hide a creation.
  // Source: design 3 steps 0-1 review, finding 4a.
  it('a file removed and created again within one change re-plans what was compiled meanwhile', async () => {
    const host = memoryHost({
      '/app/a.ts': SERVER_ONLY,
      '/app/b.ts': IMPORTER,
    })
    await host.compile('/app/b.ts', planners())
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    delete host.files['/app/a.ts']
    host.write('/app/c.ts', IMPORTER)
    await host.compile('/app/c.ts', planners())
    host.write('/app/a.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name, { held: true })).toEqual([
      '/app/c.ts',
    ])
    expect(factsOf(await host.compile('/app/c.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/c.ts', planners())),
    )
  })

  // The same, with a twin: `a/index.ts` exists beside `a.ts`, so the module
  // compiled meanwhile found the twin at `./a`, not nothing. The change asks
  // no failed resolution (none failed), moves no file set (it is a change,
  // and the text is the one the caches read), and the memo still answers
  // `a/index.ts`: the importer keeps the twin's facts.
  // Bug: `c.ts` reads `./a` as `a/index.ts` until the file set moves; a
  // cold compile reads `a.ts` (here a server-only export the client takes
  // for unknown). Same before design 3 step 4.
  // Impact: a twin (`x.ts` beside `x/index.ts`), a removal and re-creation
  // inside the watcher's window or Rspack's batch, and an importer compiled
  // in between: rare.
  // Source: design 3 step 4 review, finding 2 (the third case of rule A's
  // family: the file-set version moves on event kinds, and kinds are not
  // reliable; a fix makes the memo and the shadow check per path).
  it.fails(
    'a file removed and created again within one change re-plans what found its twin meanwhile',
    async () => {
      const host = memoryHost({
        '/app/a.ts': SERVER_ONLY,
        '/app/a/index.ts': 'export const make = 1\n',
        '/app/b.ts': IMPORTER,
      })
      await host.compile('/app/b.ts', planners())
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      delete host.files['/app/a.ts']
      host.write('/app/c.ts', IMPORTER)
      await host.compile('/app/c.ts', planners())
      host.write('/app/a.ts', SERVER_ONLY)
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      expect(host.caches.stale.take(CLIENT.name, { held: true })).toEqual([
        '/app/c.ts',
      ])
      expect(factsOf(await host.compile('/app/c.ts', planners()))).toEqual(
        factsOf(await memoryHost(host.files).compile('/app/c.ts', planners())),
      )
    },
  )

  // A created file reaches each environment's hook at its own time (Rspack:
  // each compiler's `make`). The first one's invalidation asks every
  // environment's failed resolutions again, each with its own resolver, and
  // the SSR resolver still answers from before the file existed. SSR's own
  // event, the same text, asks them again: its resolver finds the file now.
  // Source: design 3 steps 0-1 review, step 2 item 3.
  it("a created file's event re-asks the resolutions of an environment whose resolver answered from before it", async () => {
    const host = memoryHost({ '/app/c.ts': IMPORTER })
    let lagging = false
    const ssrHost: MemoryHost = Object.create(host, {
      resolve: {
        value: (specifier: string, importer: string) =>
          lagging ? Promise.resolve(null) : host.resolve(specifier, importer),
      },
    })
    const hostOf = (key: { env: string }) =>
      key.env === SSR.name ? ssrHost : host
    await host.compile('/app/c.ts', planners(), { env: CLIENT })
    await ssrHost.compile('/app/c.ts', planners(), { env: SSR })
    host.write('/app/a.ts', SERVER_ONLY)
    lagging = true
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, hostOf)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/c.ts'])
    expect(host.caches.stale.take(SSR.name)).toEqual([])
    lagging = false
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, hostOf)
    expect(host.caches.stale.take(SSR.name)).toEqual(['/app/c.ts'])
    expect(
      factsOf(await ssrHost.compile('/app/c.ts', planners(), { env: SSR })),
    ).toEqual(
      factsOf(
        await memoryHost(host.files).compile('/app/c.ts', planners(), {
          env: SSR,
        }),
      ),
    )
  })
})

describe('a file saved in place', () => {
  const IMPORTER = "import { make } from './a'\nexport const use = make\n"

  // A file is created empty (its event read it empty) and its importer
  // compiled; the first save is in place, and its one event is read
  // between the truncation and the write. An empty read waits for the text
  // as for any other in-place save: the file was empty before, but it was
  // written since, so this event is no repeat of the one that read it so.
  // Source: design 3 steps 0-1 review, finding 4b (a route file starts so:
  // created, typed, saved).
  it('the first save of a file created empty re-plans its importer', async () => {
    const host = memoryHost({ '/app/b.ts': IMPORTER })
    host.write('/app/a.ts', '')
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, host)
    await host.compile('/app/b.ts', planners())
    // the save truncates the file (its modification time moves), the event
    // is read, the text is written
    host.write('/app/a.ts', '')
    const event = invalidate(
      host.caches,
      { path: '/app/a.ts', kind: 'change' },
      host,
    )
    setTimeout(() => host.write('/app/a.ts', SERVER_ONLY), 5)
    await event
    expect(host.caches.stale.take(CLIENT.name, { held: true })).toEqual([
      '/app/b.ts',
    ])
    expect(
      (await host.compile('/app/b.ts', planners()))?.facts.planners,
    ).toEqual(
      (await memoryHost(host.files).compile('/app/b.ts', planners()))?.facts
        .planners,
    )
  })

  // The same first save on a filesystem whose modification times are whole
  // seconds (HFS+, ext3, FAT, some network shares): the truncation is
  // stamped like the creation it follows within that second, which tells
  // nothing of a repeat, so the empty read waits for the text.
  // Source: design 3 step 4 review, finding 8.
  it('the first save of a file created empty re-plans its importer on a clock of whole seconds', async () => {
    const host = new MemoryHost({
      files: { '/app/b.ts': IMPORTER },
      recognizer: RECOGNIZER,
      clock: () => 1_731_312_000_000,
    })
    host.write('/app/a.ts', '')
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, host)
    await host.compile('/app/b.ts', planners())
    host.write('/app/a.ts', '')
    const event = invalidate(
      host.caches,
      { path: '/app/a.ts', kind: 'change' },
      host,
    )
    setTimeout(() => host.write('/app/a.ts', SERVER_ONLY), 5)
    await event
    expect(host.caches.stale.take(CLIENT.name, { held: true })).toEqual([
      '/app/b.ts',
    ])
  })

  // A file that held a module is saved empty on purpose; the save reaches
  // two hooks. The first call reads it again for a moment (an in-place save
  // may be on its way); the second finds the file as the first left it (not
  // written since), and reads once.
  it.for([
    { name: 'at once (Rsbuild compilers)', together: true },
    { name: 'one after the other (Vite environments)', together: false },
  ])(
    'a repeat of an event that waited for an empty file reads it once (hooks $name)',
    async ({ together }) => {
      /** Reads of `a.ts` by the events of a save to empty that reach `hooks` hooks. */
      const readsOf = async (hooks: number) => {
        let reads = 0
        const host = new MemoryHost({
          files: {
            '/app/a.ts': 'export const make = 1\n',
            '/app/b.ts': IMPORTER,
          },
          recognizer: RECOGNIZER,
          onRead: (path) => {
            if (path === '/app/a.ts') {
              reads++
            }
          },
        })
        await host.compile('/app/b.ts', planners())
        await invalidate(
          host.caches,
          { path: '/app/a.ts', kind: 'change' },
          host,
        )
        host.write('/app/a.ts', '')
        reads = 0
        const event = () =>
          invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
        if (together) {
          await Promise.all(Array.from({ length: hooks }, event))
        } else {
          for (let n = 0; n < hooks; n++) {
            await event()
          }
        }
        return reads
      }
      const one = await readsOf(1)
      expect(one).toBeGreaterThan(1)
      expect(await readsOf(2)).toBe(one + 1)
    },
  )
})

describe('a text without a plan', () => {
  // `a.ts` had a plan that read `l.ts`; it is saved to a text the compiler
  // leaves alone, to one that does not parse, and empty. None of those has a
  // plan, and the plan of the old text goes with it: a later edit of what
  // the old text read finds nothing stale.
  // Source: design 3 steps 0-1 review, finding 2 (Vite's `liveModules`
  // reads the plan at the path).
  it.for([
    { name: 'that the compiler leaves alone', text: 'export const use = 1\n' },
    { name: 'that does not parse', text: 'export const = \n' },
    { name: 'that is empty', text: '' },
  ])("keeps no plan of the file's old text ($name)", async ({ text }) => {
    const host = memoryHost({
      '/app/l.ts': 'export const make = 1\n',
      '/app/a.ts': "import { make } from './l'\nexport const use = make\n",
    })
    await host.compile('/app/a.ts', planners())
    host.write('/app/a.ts', text)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    await host.compile('/app/a.ts', planners())
    const cache = host.caches.plans.get(CLIENT.name)!
    expect(
      cache.keysAt('/app/a.ts').filter((key) => cache.get(key) !== null),
    ).toEqual([])
    host.write('/app/l.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/l.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name, { held: true })).toEqual([])
  })
})

describe('a plan hit that fails validation', () => {
  // A tsconfig edit moves a resolution that had found a file: `invalidate()`
  // asks failed resolutions only, and the next request asks the others. The
  // hit that fails there is by design, not a defect: it is counted apart
  // from `staleHits` (an invalidation that missed a fact). The file still
  // enters the stale set (its other outputs follow).
  // Source: design 3 steps 0-1 review, finding 3.
  it('counts a resolution asked again at the next request apart from a stale fact', async () => {
    let target = '/app/x1.ts'
    const host = new MemoryHost({
      files: {
        '/app/tsconfig.json': '{"paths":1}',
        '/app/x1.ts': 'export const make = 1\n',
        '/app/x2.ts': SERVER_ONLY,
        '/app/a.ts': "import { make } from './x'\nexport const use = make\n",
      },
      recognizer: RECOGNIZER,
      resolve: (specifier) => (specifier === './x' ? target : null),
    })
    await host.compile('/app/a.ts', planners())
    target = '/app/x2.ts'
    host.write('/app/tsconfig.json', '{"paths":2}')
    await invalidate(
      host.caches,
      { path: '/app/tsconfig.json', kind: 'change' },
      host,
    )
    const out = await host.compile('/app/a.ts', planners())
    expect(out?.facts.planners).toEqual(
      (
        await new MemoryHost({
          files: host.files,
          recognizer: RECOGNIZER,
          resolve: (specifier) => (specifier === './x' ? target : null),
        }).compile('/app/a.ts', planners())
      )?.facts.planners,
    )
    const { staleHits, lazyHits } = host.caches.plans.get(CLIENT.name)!.counters
    expect({ staleHits, lazyHits }).toEqual({ staleHits: 0, lazyHits: 1 })
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/a.ts'])
  })
})
