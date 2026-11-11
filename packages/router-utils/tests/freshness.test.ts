/**
 * Freshness at the host boundary: a host forwards every file event to
 * `invalidate()`, takes its environment's stale set and has its bundler
 * build those modules again; it keeps no record of the events it saw.
 *
 * - Repeating an invalidation is harmless (I1): while a file's text is
 *   unchanged, another `invalidate()` of it changes no plan, restarts no
 *   compile and adds nothing to a stale set (it moves the file set: the
 *   plans ask their resolutions again at their next request).
 * - After any edits, the same as a fresh start (I3, "property (b)"): each
 *   sequence of events below ends with every output equal to a cold
 *   compile of the final files, and the caches keep nothing of files gone.
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
import type { CompileOutput, Planner } from '../src/compiler'

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

  // The same restart, for a key that already has a plan: `x.ts` was
  // compiled, and its plan has a failed import of its own (`./types`, a
  // types-only `.d.ts`). The new text imports `./a` while `a.ts` is gone;
  // `a.ts` comes back reported as a change. The compile must not publish
  // its failed `./a` because the old plan's `./types` still fails.
  // Source: design 3 step 5 review, finding 5 (the published plan and the
  // compile in flight shared one row, which said "published").
  it('a compile in flight that met a failed import is restarted when the import resolves now, beside a published plan with a failed import', async () => {
    const reads: Array<() => void> = []
    let hold = false
    const host = new MemoryHost({
      files: {
        '/app/k.ts': 'export const other = 1\n',
        '/app/h.ts': 'export const h = 1\n',
        '/app/x.ts': dedent(`
          import { T } from './types'
          import { other } from './k'
          export const use = other
        `),
      },
      recognizer: RECOGNIZER,
      onRead: (path) =>
        hold && path === '/app/h.ts'
          ? new Promise<void>((r) => reads.push(r))
          : undefined,
    })
    await host.compile('/app/x.ts', planners())
    host.write(
      '/app/x.ts',
      dedent(`
        import { T } from './types'
        import { make } from './a'
        import { other } from './k'
        import { h } from './h'
        export const use = make
      `),
    )
    await invalidate(host.caches, { path: '/app/x.ts', kind: 'change' }, host)
    hold = true
    const compiling = host.compile('/app/x.ts', planners())
    while (reads.length === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    host.write('/app/a.ts', SERVER_ONLY)
    host.write(
      '/app/y.ts',
      "import { make } from './a'\nexport const use = make\n",
    )
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

  // A compile asks `./a` while `a.ts` is gone, and the resolver answers
  // after `a.ts` came back and its event was applied (the answer was made
  // from before: the file was checked, then the event ran). The change
  // moves no file set (a module compiled meanwhile read `a.ts`), so only
  // the failed resolutions are asked at the event, and the compile had
  // recorded none yet. The answer is asked again before it is recorded.
  // Source: design 3 step 5 review, step 6 item 2 (rows at ask time: a
  // failed answer whose ask an event overlapped).
  it('a failed resolution answered after an event that made it resolve is asked again', async () => {
    const asks: Array<() => void> = []
    let hold = false
    /** The files as the resolver checked them when a held ask began, by importer and specifier. */
    const checked = new Map<string, Record<string, string>>()
    const host: MemoryHost = new MemoryHost({
      files: {
        '/app/k.ts': 'export const other = 1\n',
        '/app/x.ts': dedent(`
          import { make } from './a'
          import { other } from './k'
          export const use = make
        `),
      },
      recognizer: RECOGNIZER,
      onResolve: (specifier, importer) => {
        if (hold && specifier === './a') {
          hold = false
          checked.set(`${importer} ${specifier}`, { ...host.files })
          return new Promise<void>((r) => asks.push(r))
        }
        return undefined
      },
      resolve: (specifier, importer, files) => {
        const dir = importer.slice(0, importer.lastIndexOf('/'))
        const id = `${dir}/${specifier.slice(2)}.ts`
        const seen = checked.get(`${importer} ${specifier}`) ?? files
        checked.delete(`${importer} ${specifier}`)
        return id in seen ? id : null
      },
    })
    hold = true
    const compiling = host.compile('/app/x.ts', planners())
    while (asks.length === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    host.write('/app/a.ts', SERVER_ONLY)
    host.write(
      '/app/y.ts',
      "import { make } from './a'\nexport const use = make\n",
    )
    await host.compile('/app/y.ts', planners())
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    asks.splice(0).forEach((release) => release())
    await compiling
    const factsOf = (out: CompileOutput | null) => out?.facts.planners
    expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/x.ts', planners())),
    )
  })

  // A `package.json` or tsconfig saved once asks, at its event, the
  // resolutions under its directory (what specifiers resolve to may have
  // changed); the same event through a second hook, or a touch, finds the
  // text the caches read and asks none (each plan asks its own at its next
  // request: every file event moves the file set).
  // Source: design 3 step 4 review, finding 3 (a repeat asked the
  // resolutions under the directory again).
  it.for(['/app/package.json', '/app/tsconfig.json'])(
    'a repeat of an event of %s asks no resolution at the event',
    async (path) => {
      const host = memoryHost({
        [path]: '{"name":"a"}',
        '/app/k.ts': 'export const make = 1\n',
        '/app/x.ts': "import { make } from './k'\nexport const use = make\n",
      })
      await host.compile('/app/x.ts', planners())
      host.write(path, '{"name":"b"}')
      await invalidate(host.caches, { path, kind: 'change' }, host)
      const resolverCalls = host.resolveCalls.length
      await invalidate(host.caches, { path, kind: 'change' }, host)
      expect(host.resolveCalls.length).toBe(resolverCalls)
    },
  )
})

describe('after any edits', () => {
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
  // no failed resolution (none failed) and moves no file set (it is a
  // change, and the text is the one the caches read); the memo still
  // answers `a/index.ts`. Any event of a file asks the resolutions it may
  // take, past the memo.
  // Source: design 3 step 4 review, finding 2 (the third case of rule A's
  // family: the file-set version moves on event kinds, and kinds are not
  // reliable), closed in design 3 step 6.
  it('a file removed and created again within one change re-plans what found its twin meanwhile', async () => {
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
  })

  // `a.ts` beside its twin `a/index.ts`: removed and created again within
  // one change, while a compile of `x.ts`, which now imports `./a`, runs
  // across it and finds the twin. Its key has a published plan (of a text
  // that did not import `./a`) or none; `a.ts` is back with its text or
  // another.
  // Source: design 3 final review, finding 2 (form a: the compile restarted
  // and its next attempt read the twin from the resolution memo).
  it.for([
    [false, true],
    [false, false],
    [true, true],
    [true, false],
  ] as const)(
    'a compile in flight that found the twin of a file removed and created again within one change: published plan %s, same text %s',
    async ([published, sameText]) => {
      const reads: Array<() => void> = []
      let hold = false
      const host = new MemoryHost({
        files: {
          '/app/a.ts': SERVER_ONLY,
          '/app/a/index.ts': 'export const make = 1\n',
          '/app/k.ts': 'export const other = 1\n',
          '/app/h.ts': 'export const h = 1\n',
          '/app/w.ts': IMPORTER,
          '/app/x.ts':
            "import { other } from './k'\nexport const use = other\n",
        },
        recognizer: RECOGNIZER,
        onRead: (path) =>
          hold && path === '/app/h.ts'
            ? new Promise<void>((r) => reads.push(r))
            : undefined,
      })
      // (the caches know `a.ts`: another module read it)
      await host.compile('/app/w.ts', planners())
      if (published) {
        await host.compile('/app/x.ts', planners())
      }
      host.write(
        '/app/x.ts',
        dedent(`
          import { make } from './a'
          import { other } from './k'
          import { h } from './h'
          export const use = make
        `),
      )
      await invalidate(host.caches, { path: '/app/x.ts', kind: 'change' }, host)
      delete host.files['/app/a.ts']
      hold = true
      const compiling = host.compile('/app/x.ts', planners())
      while (reads.length === 0) {
        await new Promise((r) => setTimeout(r, 1))
      }
      host.write(
        '/app/a.ts',
        sameText ? SERVER_ONLY : SERVER_ONLY.replace('() => 1', '() => 2'),
      )
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      hold = false
      while (reads.length > 0) {
        reads.splice(0).forEach((release) => release())
        await new Promise((r) => setTimeout(r, 1))
      }
      await compiling
      host.caches.stale.take(CLIENT.name, { held: true })
      expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(
        factsOf(await memoryHost(host.files).compile('/app/x.ts', planners())),
      )
    },
  )

  // The same fold, and the resolver checks the files while `a.ts` is gone
  // (it finds `a/index.ts`) and answers after `a.ts` is back and its one
  // change was applied. No compile is restarted.
  // Source: design 3 final review, finding 2 (form b).
  it('a twin answered after the change that brought its file back is asked again', async () => {
    const asks: Array<() => void> = []
    let hold = false
    /** The files as the resolver checked them when a held ask began, by importer and specifier. */
    const checked = new Map<string, Record<string, string>>()
    const host: MemoryHost = new MemoryHost({
      files: {
        '/app/a.ts': SERVER_ONLY,
        '/app/a/index.ts': 'export const make = 1\n',
        '/app/w.ts': IMPORTER,
        '/app/x.ts': IMPORTER,
      },
      recognizer: RECOGNIZER,
      onResolve: (specifier, importer) => {
        if (hold && specifier === './a') {
          hold = false
          checked.set(`${importer} ${specifier}`, { ...host.files })
          return new Promise<void>((r) => asks.push(r))
        }
        return undefined
      },
      resolve: (specifier, importer, files) => {
        const seen = checked.get(`${importer} ${specifier}`) ?? files
        checked.delete(`${importer} ${specifier}`)
        const dir = importer.slice(0, importer.lastIndexOf('/'))
        const joined = `${dir}/${specifier.slice(2)}`
        return (
          [`${joined}.ts`, `${joined}/index.ts`].find((id) => id in seen) ??
          null
        )
      },
    })
    await host.compile('/app/w.ts', planners())
    delete host.files['/app/a.ts']
    hold = true
    const compiling = host.compile('/app/x.ts', planners())
    while (asks.length === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    host.write('/app/a.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    asks.splice(0).forEach((release) => release())
    await compiling
    host.caches.stale.take(CLIENT.name, { held: true })
    expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/x.ts', planners())),
    )
  })

  // The same fold, and what found the twin while `a.ts` was gone is a plan
  // of `x.ts` saved to another text before `a.ts` is back: at the change no
  // plan holds a row under the twin and no compile runs. `x.ts` is saved
  // back to its import of `./a`, and its compile asks the resolver, not the
  // answer given while `a.ts` was gone.
  // Source: design 3 final review, finding 2 (form c; the property (b) row
  // seed 1732051583 with twins and folded removals, where the SSR `m5.ts`
  // kept `./m2 -> m2/index.ts`).
  it('a twin found by a plan replaced before the change that brought its file back is asked again', async () => {
    const host = memoryHost({
      '/app/a.ts': SERVER_ONLY,
      '/app/a/index.ts': 'export const make = 1\n',
      '/app/w.ts': IMPORTER,
      '/app/x.ts': IMPORTER,
    })
    // (the caches know `a.ts`: another module read it)
    await host.compile('/app/w.ts', planners())
    delete host.files['/app/a.ts']
    await host.compile('/app/x.ts', planners())
    host.write('/app/x.ts', 'export const use = 1\n')
    await invalidate(host.caches, { path: '/app/x.ts', kind: 'change' }, host)
    await host.compile('/app/x.ts', planners())
    host.write('/app/a.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    host.write('/app/x.ts', IMPORTER)
    await invalidate(host.caches, { path: '/app/x.ts', kind: 'change' }, host)
    host.caches.stale.take(CLIENT.name, { held: true })
    expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/x.ts', planners())),
    )
  })

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
