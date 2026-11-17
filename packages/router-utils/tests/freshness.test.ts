/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of dev races no public input
 * reaches deterministically: a compile in flight while a save, an event that
 * makes a failed import resolve, or a file removed and created again within
 * one change lands; an older text's request answered after the newer text's
 * compile. Each sequence ends with the outputs a cold compile of the final
 * files gives, and the caches keep nothing of files gone.
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
})

const SERVER_ONLY = dedent(`
  import { createServerOnlyFn } from 'toy-start'
  export const make = createServerOnlyFn(() => 1)
`)

describe('events that move the file set', () => {
  const IMPORTER = "import { make } from './a'\nexport const use = make\n"
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

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
})

describe('a request of an older text', () => {
  const OLD = "import { make as inner } from './l'\nexport const make = inner\n"
  const NEW = "import { make as inner } from './m'\nexport const make = inner\n"
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

  // A bundler requests `a.ts` again (a page reload) while its text still
  // imports `l.ts`: the plan hit asks its resolutions again (a touch moved
  // the file set), and the answer takes a moment. Meanwhile `a.ts` is saved
  // to import `m.ts`, and the request of that text compiles it. The older
  // request then answers its own text, and the newer text's plan keeps its
  // dependencies: an edit of `m.ts` re-plans `a.ts`.
  // Source: phase-end gates F-PEG-2 (property (b) rows seed 169216 with
  // stretch 1, jitter 8, where the SSR `m2.ts` kept `./m0` as a server
  // function, and seed 167651 with stretch 1, jitter 12, SSR `m5.ts`).
  it("an older text's request answered after the newer text's compile leaves the newer plan's dependencies", async () => {
    let holding = false
    let release!: () => void
    let held!: () => void
    const asked = new Promise<void>((r) => (held = r))
    const host = new MemoryHost({
      files: {
        '/app/l.ts': 'export const make = 1\n',
        '/app/m.ts': 'export const make = 2\n',
        '/app/a.ts': OLD,
      },
      recognizer: RECOGNIZER,
      onResolve: (specifier) => {
        if (holding && specifier === './l') {
          holding = false
          held()
          return new Promise<void>((r) => (release = r))
        }
        return undefined
      },
    })
    await host.compile('/app/a.ts', planners())
    await invalidate(host.caches, { path: '/app/l.ts', kind: 'change' }, host)
    holding = true
    const older = host.compile('/app/a.ts', planners())
    await asked
    host.write('/app/a.ts', NEW)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    const newer = await host.compile('/app/a.ts', planners())
    release()
    expect(factsOf(await older)).toEqual(
      factsOf(
        await memoryHost({ ...host.files, '/app/a.ts': OLD }).compile(
          '/app/a.ts',
          planners(),
        ),
      ),
    )
    expect(factsOf(newer)).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/a.ts', planners())),
    )
    host.write('/app/m.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/m.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/a.ts'])
    expect(factsOf(await host.compile('/app/a.ts', planners()))).toEqual(
      factsOf(await memoryHost(host.files).compile('/app/a.ts', planners())),
    )
  })
})
