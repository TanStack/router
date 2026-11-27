/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of dev races no public input
 * reaches deterministically: a compile in flight while a save, an event that
 * makes a failed import resolve, or a file removed and created again within
 * one change lands; an older text's request answered after the newer text's
 * compile. Each sequence ends with the outputs a cold compile of the final
 * files gives, and the caches keep nothing of files gone. Added for the
 * settlement design's step 0 (2026-11-25): a check (hit, attempt, restore)
 * whose read waits while an event lands, and the facts version moving during
 * an attempt's check (step 6a: one `stable(snapshot)`; step 6b: nothing else
 * restarts a compile); a restored plan and an untouched compile of its module
 * (C6-09).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  expireVirtual,
  invalidate,
  restorePlans,
  revision,
} from '../src/compiler'
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
    const factsOf = (out: CompileOutput | null) => out?.facts.planners
    const cold = factsOf(
      await memoryHost(host.files).compile('/app/x.ts', planners()),
    )
    // the restarted compile answers the resolved import, and so does the next
    expect(factsOf(await compiling)).toEqual(cold)
    expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(cold)
  })
})

const SERVER_ONLY = dedent(`
  import { createServerOnlyFn } from 'toy-start'
  export const make = createServerOnlyFn(() => 1)
`)
/** `make` of `SERVER_ONLY`, as an export resolution reads it. */
const SERVER_ONLY_MAKE = { t: 'envOnlyResult', kind: 'server' }

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
      const cold = factsOf(
        await memoryHost(host.files).compile('/app/x.ts', planners()),
      )
      expect(factsOf(await compiling)).toEqual(cold)
      host.caches.stale.take(CLIENT.name)
      expect(factsOf(await host.compile('/app/x.ts', planners()))).toEqual(cold)
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

/** A promise and the function that settles it. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((r) => (open = r))
  return { opened, open }
}

// Settlement design, step 0 (design-settlement.md §4, §6): a plan reused or
// published after a check that waited on the resolver (or a read) while an
// event changed what the check reads. Each row ends with what a cold compile
// of the final files gives: one `stable(snapshot)` accepted in the
// caller's turn, and the generation rule (step 6a).
describe('a check that waits while an event lands', () => {
  const PAGE = '/app/page.ts'
  const files = {
    [PAGE]: "import { make } from './w'\nexport const use = make\n",
    '/app/a.ts': SERVER_ONLY,
    '/app/b.ts': 'export const make = 1\n',
  }
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

  /**
   * A host whose `./w` resolves to `target.id` (an alias),
   * and whose next `./w` resolution, once `arm`ed, answers what it read
   * only after `release`: a resolver that read the files before an event
   * and answers after it.
   */
  function aliasHost(target: { id: string }) {
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      resolve: (specifier) => (specifier === './w' ? target.id : null),
    })
    const resolve = host.resolve.bind(host)
    let armed: { reached: () => void; release: Promise<void> } | null = null
    host.resolve = async (specifier, importer) => {
      const answer = await resolve(specifier, importer)
      if (armed && specifier === './w') {
        const held = armed
        armed = null
        held.reached()
        await held.release
      }
      return answer
    }
    const release = gate()
    const arm = () =>
      new Promise<void>((reached) => {
        armed = { reached, release: release.opened }
      })
    return { host, arm, release: release.open }
  }

  const cold = async () =>
    factsOf(await aliasHost({ id: '/app/b.ts' }).host.compile(PAGE, planners()))

  // C6-03. An upstream plugin prepends a banner to the file's text; the
  // file's change event (its own save, read without the banner) lands
  // while the compile of that save waits on a resolution. No newer request
  // exists: the host builds the file again if the compile was not kept (its
  // stale set), and afterwards a change of what the file reads reaches the
  // host as a rebuild of the file.
  // Source: whole-PR review C6-03 (Astra's current-input probe); Astra's
  // review of settlement step 0, finding 6.
  it("C6-03: after the event of a file's own save, a change of what it reads still rebuilds it", async () => {
    const { host, arm, release } = aliasHost({ id: '/app/b.ts' })
    const banner = `/* a plugin's banner */\n${files[PAGE]}`
    const reached = arm()
    const compiling = host.compile(PAGE, planners(), { code: banner })
    await reached
    await invalidate(host.caches, { path: PAGE, kind: 'change' }, host)
    release()
    expect(factsOf(await compiling)).toEqual(await cold())
    if (host.caches.stale.take(CLIENT.name).includes(PAGE)) {
      // (the host builds the file again)
      await host.compile(PAGE, planners(), { code: banner })
    }
    host.write('/app/b.ts', SERVER_ONLY)
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
  })

  // A route-registry digest the plan read changes while the hit's check
  // waits on the resolver: a watch build publishes the generator's view
  // with no file event the caches see.
  // Source: Astra's review of the settlement design, change 1
  // (`registry-during-hit.mjs`).
  it('a plan hit whose route-registry digest changed during its check answers the new digest', async () => {
    let digest = 'first'
    const routePlanner = (): Planner => ({
      name: 'toy-route',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        // (as the router planner reads a route file's entry)
        ctx.ledger.record({ kind: 'route-registry', path: PAGE, digest })
        const value = digest
        await ctx.resolve('./w')
        ctx.set(value)
      },
      plan(ctx) {
        ctx.setFacts('toy-route', ctx.prefetched.get('toy-route') ?? null)
      },
    })
    const withRoutes = (host: MemoryHost) =>
      Object.assign(host, {
        routes: { lookup: () => null, digestFor: () => digest },
      })
    const { host, arm, release } = aliasHost({ id: '/app/b.ts' })
    withRoutes(host)
    await host.compile(PAGE, [routePlanner()])
    host.write('/app/c.ts', 'export const c = 1\n')
    await invalidate(host.caches, { path: '/app/c.ts', kind: 'add' }, host)
    const reached = arm()
    const hit = host.compile(PAGE, [routePlanner()])
    await reached
    digest = 'second'
    release()
    const fresh = withRoutes(aliasHost({ id: '/app/b.ts' }).host)
    expect(factsOf(await hit)).toEqual(
      factsOf(await fresh.compile(PAGE, [routePlanner()])),
    )
  })
})

// The facts version moving during a check (design-settlement.md §4, p1),
// green through the snapshot alone (its check asks again when the facts
// version moved during it). `a.ts` read
// `b.ts`'s export; `b.ts` is saved, and its event (the file set moved)
// waits on its read of `b.ts`; the attempt reaches its check, which asks
// `./b` again and waits; the event applies; the resolver answers.
// Source: Fable's settlement design probe `p1-facts-move-during-check.mjs`;
// the comment-only edit is its control.
describe('a dependency saved while a compile checks its snapshot', () => {
  /** `waited`, or nothing after `ms` (a compiler that does not wait there goes on). */
  const atMost = (waited: Promise<void>, ms = 2_000) =>
    Promise.race([waited, new Promise<void>((r) => setTimeout(r, ms))])

  /**
   * The compile of `a.ts` while `b.ts` is saved as `saved` in the timeline
   * above; its answer, a cold compile's of the final files, and how many
   * attempts the compile took.
   */
  async function duringSave(saved: string) {
    const files = {
      '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
      '/app/b.ts': 'export const make = 1\n',
    }
    // each hold waits once, from when it is armed
    let holdEventRead = false
    let holdCheck = false
    let holdPrefetch = true
    let attempts = 0
    const eventRead = gate()
    const eventReading = gate()
    const checkResolve = gate()
    const checkResolving = gate()
    const read = gate()
    const proceed = gate()
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      // (the event's read of the saved file)
      onRead: async (path) => {
        if (path === '/app/b.ts' && holdEventRead) {
          holdEventRead = false
          eventReading.open()
          await eventRead.opened
        }
      },
      // (the compile's next resolution after its first read: its check's)
      onResolve: async () => {
        if (holdCheck) {
          holdCheck = false
          checkResolving.open()
          await checkResolve.opened
        }
      },
    })
    const planner = (): Planner => ({
      name: 'toy',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        attempts++
        const target = await ctx.resolve('./b')
        const found = await ctx.resolver.resolve(target!, 'make')
        if (holdPrefetch) {
          holdPrefetch = false
          read.open()
          await proceed.opened
        }
        ctx.set(found.k === 'found' ? found.value : found.k)
      },
      plan(ctx) {
        ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
      },
    })
    const compiling = host.compile('/app/a.ts', [planner()])
    await read.opened
    host.write('/app/b.ts', saved)
    holdEventRead = true
    const event = invalidate(
      host.caches,
      { path: '/app/b.ts', kind: 'change' },
      host,
    )
    await atMost(eventReading.opened)
    holdCheck = true
    proceed.open()
    await atMost(checkResolving.opened)
    holdCheck = false
    eventRead.open()
    await event
    checkResolve.open()
    const out = await compiling
    const tried = attempts
    const cold = await new MemoryHost({
      files: host.files,
      recognizer: RECOGNIZER,
    }).compile('/app/a.ts', [planner()])
    return { out, cold, attempts: tried }
  }

  it.for([
    ['a change of the export', 'export function make() {}\n'],
    ['a comment-only edit', '// a note\nexport const make = 1\n'],
  ] as const)(
    '%s: the compile answers the saved dependency',
    async ([, saved]) => {
      const { out, cold } = await duringSave(saved)
      expect(out!.facts.planners).toEqual(cold!.facts.planners)
    },
  )

  // The control's cost: the comment changes no fact the compile read, so its
  // attempt stands (one attempt): the snapshot alone decides (step 6b).
  // Source: Astra's re-check of settlement step 0 (round 3), finding 7.
  it('a comment-only edit: the compile is not attempted again', async () => {
    const { attempts } = await duringSave('// a note\nexport const make = 1\n')
    expect(attempts).toBe(1)
  })
})

// The same-text rule of the settlement design (§2, §8.2): a compile whose
// every attempt was overtaken (a dependency saved during each) answers
// without publishing and leaves its file for the host to build again; that
// rebuild, of the same text, compiles the file as it now is and publishes
// (a later change of the dependency rebuilds the file). Whether the first
// answer is still current while its caller acts on it is the session's
// question (step 1's `current()`), not reachable here.
// Source: Fable's review of settlement step 0 (narrowing 3, tried at the
// core).
describe('a compile whose attempts were all overtaken, and the rebuild of its text', () => {
  it('the rebuild answers the dependency as it is and publishes', async () => {
    const files = {
      '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
      '/app/b.ts': 'export const make = 1\n',
    }
    const host = memoryHost(files)
    /** Attempts still to hold after they read `b.ts`'s export. */
    let holds = 3
    const held: Array<() => void> = []
    const planner = (): Planner => ({
      name: 'toy',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const target = await ctx.resolve('./b')
        const found = await ctx.resolver.resolve(target!, 'make')
        if (holds > 0) {
          holds--
          await new Promise<void>((r) => held.push(r))
        }
        ctx.set(found.k === 'found' ? found.value : found.k)
      },
      plan(ctx) {
        ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
      },
    })
    const until = async (done: () => boolean) => {
      for (let n = 0; !done(); n++) {
        if (n > 2_000) {
          throw new Error('test: no attempt read the dependency')
        }
        await new Promise((r) => setTimeout(r, 1))
      }
    }
    const first = host.compile('/app/a.ts', [planner()])
    // each attempt read `b.ts`; it is saved before the attempt ends
    for (let save = 1; save <= 3; save++) {
      await until(() => held.length > 0)
      host.write(
        '/app/b.ts',
        save % 2 === 1
          ? 'export function make() {}\n'
          : 'export const make = 1\n',
      )
      await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
      held.shift()!()
    }
    await first
    // (the host is told to build the file again)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/a.ts'])
    const rebuilt = await host.compile('/app/a.ts', [planner()])
    expect(rebuilt!.facts.planners).toEqual(
      (await memoryHost(host.files).compile('/app/a.ts', [planner()]))!.facts
        .planners,
    )
    host.write('/app/b.ts', 'export const make = 2\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/a.ts'])
  })
})

// The cache knobs (`TSR_COMPILER_NO_CACHE`) change how much is reused, never
// what an event reaches: a dependency saved broken (it stops parsing: its
// importers' decisions stand), with other exports, or with a comment only,
// stales the same importers under every knob. The knobs are read when the
// caches are created.
// Source: Fable's re-check of settlement step 0 (round 3), finding 2
// (`getTarget` built past the entry with `targets` off).
describe('a cache knob and what a dependency save reaches', () => {
  const reader = (): Planner => ({
    name: 'reads-target',
    tier: 0,
    gate: (t0) => t0.hasImportOrExport,
    plan() {},
    async policy(_plan, output, edges, ctx) {
      for (const e of edges[output] ?? []) {
        const target = await ctx.resolve(e.specifier)
        if (target !== null) {
          await ctx.targetFacts(target)
        }
      }
    },
  })
  it.for(
    ['', 'plans', 'facts', 'targets', 'registry', 'all'].flatMap((knob) =>
      (
        [
          ['broken', 'export const make = \n', []],
          ['with other exports', 'export const other = 1\n', ['/app/a.ts']],
          ['with a comment only', '// note\nexport const make = 1\n', []],
        ] as const
      ).map(([name, saved, stale]) => [knob, name, saved, stale] as const),
    ),
  )('knob "%s": the dependency saved %s', async ([knob, , saved, stale]) => {
    const before = process.env.TSR_COMPILER_NO_CACHE
    process.env.TSR_COMPILER_NO_CACHE = knob
    try {
      const host = new MemoryHost({
        files: {
          '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
          '/app/b.ts': 'export const make = 1\n',
        },
      })
      await host.compile('/app/a.ts', [reader()])
      host.write('/app/b.ts', saved)
      await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
      expect(host.caches.stale.take(CLIENT.name)).toEqual(stale)
    } finally {
      if (before === undefined) {
        delete process.env.TSR_COMPILER_NO_CACHE
      } else {
        process.env.TSR_COMPILER_NO_CACHE = before
      }
    }
  })
})

// C6-09. A restored plan's module is compiled again (the bundler's request,
// of a text with nothing to compile): the latest answer is untouched, so
// nothing of the module depends on what the restored plan read, and a
// change of that dependency stales nothing.
// Source: whole-PR review C6-09 (Astra).
describe('a restored plan, and an untouched compile of its module', () => {
  it('a change of what the restored plan read stales nothing', async () => {
    const files = {
      '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
      '/app/b.ts': 'export const make = 1\n',
    }
    const first = new MemoryHost({ files, recognizer: RECOGNIZER })
    const persisted = (await first.compile('/app/a.ts', [toySummaryPlanner()]))!
      .persisted!
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    expect(await restorePlans(host.caches, [persisted], host)).toEqual([])
    expect(
      await host.compile('/app/a.ts', [toySummaryPlanner()], {
        code: 'export const x = 1\n',
      }),
    ).toBeNull()
    host.write('/app/b.ts', 'export function make() {}\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([])
  })

  // The control: with no compile of the module, the restored plan is what
  // the module depends on, and the change stales it.
  // Source: Fable's review of settlement step 6a, finding 5.
  it('without a compile, a change of what the restored plan read stales its module', async () => {
    const files = {
      '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
      '/app/b.ts': 'export const make = 1\n',
    }
    const first = new MemoryHost({ files, recognizer: RECOGNIZER })
    const persisted = (await first.compile('/app/a.ts', [toySummaryPlanner()]))!
      .persisted!
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    expect(await restorePlans(host.caches, [persisted], host)).toEqual([])
    host.write('/app/b.ts', 'export function make() {}\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual(['/app/a.ts'])
  })
})

/**
 * A planner reading `./b`'s `make` export whose next prefetch, once `hold`
 * is called, waits after its reads until `proceed`; it counts attempts.
 */
function heldReader() {
  let attempts = 0
  let armed: { reached: () => void; proceed: Promise<void> } | null = null
  const planner = (): Planner => ({
    name: 'toy',
    tier: 1,
    gate: () => true,
    async prefetch(_t0, ctx) {
      attempts++
      const target = await ctx.resolve('./b')
      const found = await ctx.resolver.resolve(target!, 'make')
      if (armed) {
        const held = armed
        armed = null
        held.reached()
        await held.proceed
      }
      ctx.set(found.k)
    },
    plan(ctx) {
      ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
    },
  })
  const hold = () => {
    const proceed = gate()
    const reached = new Promise<void>((r) => {
      armed = { reached: r, proceed: proceed.opened }
    })
    return { reached, proceed: proceed.open }
  }
  return { planner, hold, attempts: () => attempts }
}

// Step 6a review, finding 1 (Fable, Astra, Gemini): a plan hit of an older
// text fails its check while the newer text's compile publishes in the same
// turn rank; the refusal is acted on in the turn it was judged, so the
// newer plan stays and its answer stays current.
// Source: Fable's `p2-moved-gap.probe.ts`.
describe('an older text whose plan hit fails while the newer text publishes', () => {
  // (`together`: both resolver answers at once; `newer first`: the newer
  // text publishes before the older hit's check reads its answer)
  it.for(['together', 'newer first'] as const)(
    'the newer plan stays published and its answer current (%s)',
    async (order) => {
      const PAGE = '/app/page.ts'
      const OLD = "import { make } from './w'\nexport const use = make\n"
      const NEW =
        "import { make } from './v'\nexport const use = make\nexport const more = 1\n"
      const target = { w: '/app/a.ts' }
      const host = new MemoryHost({
        files: {
          [PAGE]: OLD,
          '/app/a.ts': SERVER_ONLY,
          '/app/b.ts': 'export const make = 1\n',
          '/app/tsconfig.json': '{}\n',
        },
        recognizer: RECOGNIZER,
        resolve: (specifier) =>
          specifier === './w'
            ? target.w
            : specifier === './v'
              ? '/app/b.ts'
              : null,
      })
      const inner = host.resolve.bind(host)
      const armed = new Map<
        string,
        { reached: () => void; release: Promise<void> }
      >()
      host.resolve = async (specifier, importer) => {
        const answer = await inner(specifier, importer)
        const held = armed.get(specifier)
        if (held) {
          armed.delete(specifier)
          held.reached()
          await held.release
        }
        return answer
      }
      const arm = (specifier: string, release: Promise<void>) =>
        new Promise<void>((reached) =>
          armed.set(specifier, { reached, release }),
        )
      let holdPrefetch = false
      const inPrefetch = gate()
      const leavePrefetch = gate()
      const holder = (): Planner => ({
        name: 'holder',
        tier: 1,
        gate: () => true,
        async prefetch(_t0, ctx) {
          await ctx.resolve('./v')
          if (holdPrefetch) {
            holdPrefetch = false
            inPrefetch.open()
            await leavePrefetch.opened
          }
        },
        plan() {},
      })
      const all = () => [toySummaryPlanner(), toyEnvPlanner(), holder()]
      await host.compile(PAGE, all())
      // the alias now names b.ts: asked at the plan's next request
      target.w = '/app/b.ts'
      host.write('/app/tsconfig.json', '{ "x": 1 }\n')
      await invalidate(
        host.caches,
        { path: '/app/tsconfig.json', kind: 'change' },
        host,
      )
      // the older text's request: its hit's check waits on `./w`
      const releaseW = gate()
      const reachedW = arm('./w', releaseW.opened)
      const older = host.settle(PAGE, all(), () => undefined, { code: OLD })
      await reachedW
      // the newer text's request: its check asks `./v` again (the file set
      // moved during its attempt)
      host.write(PAGE, NEW)
      holdPrefetch = true
      let newerCurrent: boolean | undefined
      const newer = host.settle(PAGE, all(), async (s) => {
        await new Promise((r) => setTimeout(r, 5))
        newerCurrent = s.current()
      })
      await inPrefetch.opened
      host.write('/app/c.ts', 'export const c = 1\n')
      await invalidate(host.caches, { path: '/app/c.ts', kind: 'add' }, host)
      const releaseV = gate()
      const reachedV = arm('./v', releaseV.opened)
      leavePrefetch.open()
      await reachedV
      if (order === 'together') {
        releaseW.open()
        releaseV.open()
      } else {
        releaseV.open()
        await new Promise((r) => setTimeout(r, 1))
        releaseW.open()
      }
      await Promise.all([older, newer])
      expect(newerCurrent).toBe(true)
      const cache = host.caches.plans.get(CLIENT.name)!
      expect(cache.keys().map((k) => cache.get(k)?.revision)).toEqual([
        revision(NEW),
      ])
    },
  )
})

// Step 6a review, finding 2 (Gemini, Fable): an own-file event of the
// latest request's text moves nothing: an open settlement of that text
// stays current, and a compile of it in flight takes one attempt.
// Source: Gemini's probes 2a and 2c; Fable's `p1-own-event.probe.ts`.
describe("an own-file event of the latest request's text", () => {
  const OLD = "import { make } from './b'\nexport const x = make\n"
  const NEW = "import { make } from './b'\nexport const y = make\n"
  const files = { '/app/a.ts': OLD, '/app/b.ts': 'export const make = 1\n' }

  it('an open untouched settlement of that text stays current', async () => {
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    const UNTOUCHED = 'export const x = 1\n'
    host.write('/app/a.ts', UNTOUCHED)
    let current: boolean | undefined
    await host.settle('/app/a.ts', [toySummaryPlanner()], async (s) => {
      expect(s.kind).toBe('untouched')
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      current = s.current()
    })
    expect(current).toBe(true)
  })

  it.for([
    ['no plan of the file yet', false],
    ['a plan of the old text', true],
  ] as const)(
    'a compile of that text in flight takes one attempt (%s)',
    async ([, prior]) => {
      const host = new MemoryHost({ files, recognizer: RECOGNIZER })
      const reader = heldReader()
      if (prior) {
        await host.compile('/app/a.ts', [reader.planner()])
      }
      host.write('/app/a.ts', NEW)
      const before = reader.attempts()
      const { reached, proceed } = reader.hold()
      let current: boolean | undefined
      const compiling = host.settle('/app/a.ts', [reader.planner()], (s) => {
        current = s.current()
      })
      await reached
      await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
      proceed()
      await compiling
      expect(reader.attempts() - before).toBe(1)
      expect(current).toBe(true)
    },
  )
})

// Step 6a review, finding 3 (Astra, Gemini, Fable): an event of another
// text than the latest request's, or of a text the compiler cannot compare
// (a module compiled in place: `.vue`, `.mdx`), moves the generation and
// leaves the file in the stale set until a request settles the event's
// text; only a removal clears the latest text.
describe("an own-file event of another text than the latest request's", () => {
  const DEP = 'export const make = 1\n'

  // Source: Fable's `p3-c603.probe.ts` (a).
  it('a module compiled in place: its compile publishes, and a change of what it reads rebuilds it', async () => {
    const PAGE = '/app/page.vue'
    const host = new MemoryHost({
      files: {
        [PAGE]: "import { make } from './b'\nexport const x = make\n",
        '/app/b.ts': DEP,
      },
      recognizer: RECOGNIZER,
    })
    const reader = heldReader()
    const extra = { lang: 'ts', inPlace: true } as const
    const { reached, proceed } = reader.hold()
    const compiling = host.compile(PAGE, [reader.planner()], extra)
    await reached
    await invalidate(host.caches, { path: PAGE, kind: 'change' }, host)
    proceed()
    await compiling
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
    host.write('/app/b.ts', 'export function make() {}\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
  })

  // An answer the bundler acts on when the event lands: not current, even
  // with no plan to evict (an untouched module).
  // Source: Gemini's probe 9; the mutation run of the step 6a fixes.
  it('an open untouched answer is not current after the event', async () => {
    const PAGE = '/app/page.ts'
    const host = new MemoryHost({
      files: { [PAGE]: 'export const x = 1\n', '/app/b.ts': DEP },
      recognizer: RECOGNIZER,
    })
    let current: boolean | undefined
    await host.settle(PAGE, [toySummaryPlanner()], async (s) => {
      expect(s.kind).toBe('untouched')
      host.write(PAGE, 'export const y = 2\n')
      await invalidate(host.caches, { path: PAGE, kind: 'change' }, host)
      current = s.current()
    })
    expect(current).toBe(false)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
  })

  // Source: Gemini's probe 3a, Astra's finding 2.
  it('a compile of the old text in flight, and the event of a new text no request asked for: the file is built again', async () => {
    const PAGE = '/app/page.ts'
    const host = new MemoryHost({
      files: {
        [PAGE]: "import { make } from './b'\nexport const x = make\n",
        '/app/b.ts': DEP,
      },
      recognizer: RECOGNIZER,
    })
    const reader = heldReader()
    const { reached, proceed } = reader.hold()
    const compiling = host.compile(PAGE, [reader.planner()])
    await reached
    host.write(PAGE, "import { make } from './b'\nexport const y = make\n")
    await invalidate(host.caches, { path: PAGE, kind: 'change' }, host)
    proceed()
    await compiling
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
  })
})

// Step 6a review (Astra, finding 3): one attempt reads one answer of a
// fact, however many times it asks. A dependency saved between two reads of
// its exports, and saved back before the check: the attempt's answer and the
// next hit's are a cold compile's (no read of the saved text).
// Source: Astra's `probe.mjs` (`readConflict`).
describe('two reads of one dependency during a save and its revert', () => {
  it('the compile answers what a cold compile does', async () => {
    const OLDER = 'export const older = 1\n'
    const files = {
      '/app/page.ts': "import { older } from './dep'\nexport const x = older\n",
      '/app/dep.ts': OLDER,
    }
    const first = gate()
    const next = gate()
    const second = gate()
    const finish = gate()
    let hold = true
    const reads = (): Planner => ({
      name: 'reads',
      tier: 0,
      gate: () => true,
      plan() {},
      async policy(_plan, _output, _edges, ctx) {
        const a = (await ctx.targetFacts('/app/dep.ts')).exportNames
        const held = hold
        if (held) {
          first.open()
          await next.opened
        }
        const b = (await ctx.targetFacts('/app/dep.ts')).exportNames
        if (held) {
          hold = false
          second.open()
          await finish.opened
        }
        if (a.join() !== b.join()) {
          ctx.diagnostic({
            severity: 'warning',
            by: 'reads',
            code: 'mismatch',
            message: `${a.join()} then ${b.join()}`,
          })
        }
      },
    })
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    const pending = host.compile('/app/page.ts', [reads()])
    await first.opened
    host.write('/app/dep.ts', 'export const newer = 2\n')
    await invalidate(host.caches, { path: '/app/dep.ts', kind: 'change' }, host)
    next.open()
    await second.opened
    host.write('/app/dep.ts', OLDER)
    await invalidate(host.caches, { path: '/app/dep.ts', kind: 'change' }, host)
    finish.open()
    const out = await pending
    const again = await host.compile('/app/page.ts', [reads()])
    const cold = await new MemoryHost({
      files,
      recognizer: RECOGNIZER,
    }).compile('/app/page.ts', [reads()])
    expect(out!.diagnostics).toEqual(cold!.diagnostics)
    expect(again!.diagnostics).toEqual(cold!.diagnostics)
  })
})

// Step 6a review (Gemini, finding 4): a virtual module that read as
// missing, then loads (a Vite watch rebuild: `expireVirtual`, no event
// names it). The plan that read the miss is not reused.
// Source: Gemini's probe 5a.
describe('a virtual module that read as missing and then loads', () => {
  it('a watch rebuild compiles its importer against the loaded module', async () => {
    const files = {
      '/app/a.ts':
        "import { make } from 'virtual:foo'\nexport const x = make\n",
    }
    const virtual: Record<string, string> = {}
    const reader = (): Planner => ({
      name: 'toy',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const found = await ctx.resolver.resolve('virtual:foo', 'make')
        ctx.set(found.k === 'found' ? found.value : found.k)
      },
      plan(ctx) {
        ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
      },
    })
    const host = new MemoryHost({ files, recognizer: RECOGNIZER, virtual })
    expect(
      (await host.compile('/app/a.ts', [reader()]))!.facts.planners,
    ).toEqual({ toy: 'absent' })
    virtual['virtual:foo'] = SERVER_ONLY
    expireVirtual(host.caches, CLIENT.name)
    const out = await host.compile('/app/a.ts', [reader()])
    expect(out!.facts.planners).toEqual({ toy: SERVER_ONLY_MAKE })
  })
})

// Step 6a re-check (Fable p5, Gemini R1a/R1c, Astra's probe): a plan hit
// whose resolution moves during its check: a file the resolver now finds
// first is created while the resolver answers (an alias target elsewhere:
// no event re-checks the plan, its check asks again). The check refuses:
// the plan is evicted (the file is stale, an open answer of it is not
// current), never replaced by a compile of its own text.
describe('a resolution that moves during a check', () => {
  const PAGE = '/app/page.ts'
  const ALT = '/app/alt/w.ts'
  function setup() {
    const host = new MemoryHost({
      files: {
        [PAGE]: "import { make } from './w'\nexport const use = make\n",
        '/app/a.ts': SERVER_ONLY,
      },
      recognizer: RECOGNIZER,
      // (`./w`: the alias target `alt/w.ts` once it exists, else `a.ts`)
      resolve: (specifier, _importer, files) =>
        specifier === './w' ? (ALT in files ? ALT : '/app/a.ts') : null,
    })
    const inner = host.resolve.bind(host)
    let armed: { reached: () => void; release: Promise<void> } | null = null
    host.resolve = async (specifier, importer) => {
      const answer = await inner(specifier, importer)
      if (armed && specifier === './w') {
        const held = armed
        armed = null
        held.reached()
        await held.release
      }
      return answer
    }
    const arm = () => {
      const release = gate()
      const reached = new Promise<void>((r) => {
        armed = { reached: r, release: release.opened }
      })
      return { reached, release: release.open }
    }
    const retarget = async () => {
      host.write(ALT, 'export const make = 1\n')
      await invalidate(host.caches, { path: ALT, kind: 'add' }, host)
    }
    // an event, so that the next hit asks its resolutions again
    const moveFileSet = async () => {
      host.write('/app/c.ts', 'export const c = 1\n')
      await invalidate(host.caches, { path: '/app/c.ts', kind: 'add' }, host)
    }
    return { host, arm, retarget, moveFileSet }
  }
  const cold = async () => {
    const { host, retarget } = setup()
    await retarget()
    return factsOf(await host.compile(PAGE, planners()))
  }
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

  it("an open answer of the plan is not current, and the file's other outputs are built again", async () => {
    const { host, arm, retarget, moveFileSet } = setup()
    await host.compile(PAGE, planners())
    host.caches.stale.take(CLIENT.name)
    const hold = gate()
    let after: boolean | undefined
    const open = host.settle(PAGE, planners(), async (s) => {
      await hold.opened
      after = s.current()
    })
    await new Promise((r) => setTimeout(r, 5))
    await moveFileSet()
    const { reached, release } = arm()
    const hit = host.compile(PAGE, planners())
    await reached
    await retarget()
    release()
    expect(factsOf(await hit)).toEqual(await cold())
    hold.open()
    await open
    expect(after).toBe(false)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
  })

  // The same move during an attempt's check: the check asks again and
  // refuses, and the compile attempts again (the bundler is answered the
  // new target, never the old plan published).
  it('a compile whose resolution moves during its check answers the new target', async () => {
    const { host, arm, retarget } = setup()
    const { reached, release } = arm()
    const compiling = host.compile(PAGE, planners())
    await reached
    await retarget()
    release()
    expect(factsOf(await compiling)).toEqual(await cold())
    expect(factsOf(await host.compile(PAGE, planners()))).toEqual(await cold())
  })

  // And during a restored plan's check: the plan is reported stale (its
  // bundler builds the module again), not restored.
  it('a restored plan whose resolution moves during its check is reported stale', async () => {
    const persisted = (await setup().host.compile(PAGE, planners()))!.persisted!
    const { host, arm, retarget } = setup()
    const { reached, release } = arm()
    const restoring = restorePlans(host.caches, [persisted], host)
    await reached
    await retarget()
    release()
    expect(await restoring).toEqual([persisted.key])
  })

  it('a request of the same text arriving during its compile joins it: one attempt', async () => {
    const { host, arm, retarget, moveFileSet } = setup()
    const reader = heldReaderOf('./w')
    await host.compile(PAGE, [reader.planner()])
    await moveFileSet()
    const { reached, release } = arm()
    const second = host.compile(PAGE, [reader.planner()])
    await reached
    await retarget()
    const held = reader.hold()
    const before = reader.attempts()
    release()
    await held.reached
    const third = host.compile(PAGE, [reader.planner()])
    await new Promise((r) => setTimeout(r, 10))
    held.proceed()
    const [a, b] = await Promise.all([second, third])
    expect(reader.attempts() - before).toBe(1)
    expect(factsOf(a)).toEqual(factsOf(b))
  })
})

/** `heldReader` of another specifier. */
function heldReaderOf(specifier: string) {
  let attempts = 0
  let armed: { reached: () => void; proceed: Promise<void> } | null = null
  const planner = (): Planner => ({
    name: 'toy',
    tier: 1,
    gate: () => true,
    async prefetch(_t0, ctx) {
      attempts++
      const target = await ctx.resolve(specifier)
      const found = await ctx.resolver.resolve(target!, 'make')
      if (armed) {
        const held = armed
        armed = null
        held.reached()
        await held.proceed
      }
      ctx.set(found.k === 'found' ? found.value : found.k)
    },
    plan(ctx) {
      ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
    },
  })
  const hold = () => {
    const proceed = gate()
    const reached = new Promise<void>((r) => {
      armed = { reached: r, proceed: proceed.opened }
    })
    return { reached, proceed: proceed.open }
  }
  return { planner, hold, attempts: () => attempts }
}

// Step 6a re-check (Gemini R2a/R2b, Astra's `marker.mjs`): a virtual module
// read only for its marker, missing, then loading with a marker import.
// Its miss is kept as its text would be, so its expiry (a watch rebuild)
// and its change event (a dev host's update) reach the importer.
describe("a virtual module's marker read as missing, and the module loading", () => {
  const MARKER = 'my-server-only'
  const files = {
    '/app/page.ts': "import 'virtual:generated'\nexport const x = 1\n",
  }
  const markerSpecifiers = { [MARKER]: 'server-only' } as const
  const LOADED = `import '${MARKER}'\nexport const x = 1\n`
  /** A policy reading the virtual module's marker (as an import edge does); `held`: waits once after the read. */
  const markerReader = (held?: () => Promise<void>): Planner => ({
    name: 'marker',
    tier: 0,
    gate: () => true,
    plan() {},
    async policy(_plan, _output, _edges, ctx) {
      const marker = await ctx.targetMarker('virtual:generated')
      await held?.()
      if (marker) {
        ctx.diagnostic({
          severity: 'warning',
          by: 'marker',
          code: 'guard',
          message: marker,
        })
      }
    },
  })
  const messages = (out: CompileOutput | null) =>
    out!.diagnostics.map((d) => d.message)
  /** What a compile against the loaded module reports: its marker. */
  const LOADED_MARKER = ['server-only']

  it('a watch rebuild (`expireVirtual`) compiles the importer against the loaded module', async () => {
    const virtual: Record<string, string> = {}
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      virtual,
      markerSpecifiers,
    })
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual([])
    virtual['virtual:generated'] = LOADED
    expireVirtual(host.caches, CLIENT.name)
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual(LOADED_MARKER)
  })

  // A load that throws is no evidence (a plugin whose `load` failed once,
  // with no hot update naming the module later): the next request after a
  // facts move reads the module again, and sees its marker.
  // Source: Fable's `recheck2/p7-virtual-miss-unannounced.probe.ts`.
  // The thrown load's entry stays: a watch rebuild's expiry finds it.
  // Source: Astra's and Gemini's look at the thrown-load rule
  // (`rejected-event.mjs`).
  it('a watch rebuild after a load that threw and then recovers sees the marker', async () => {
    const loaded: Record<string, string> = {}
    let fail = true
    const virtual = new Proxy(loaded, {
      get(target, id: string) {
        if (fail) {
          fail = false
          throw new Error('the plugin is not ready')
        }
        return target[id]
      },
    })
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      virtual,
      markerSpecifiers,
    })
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual([])
    loaded['virtual:generated'] = LOADED
    expireVirtual(host.caches, CLIENT.name)
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual(LOADED_MARKER)
  })

  it('a load that threw is read again: the next request after a save sees the marker', async () => {
    const loaded: Record<string, string> = {}
    let fail = true
    const virtual = new Proxy(loaded, {
      get(target, id: string) {
        if (fail) {
          fail = false
          throw new Error('the plugin is not ready')
        }
        return target[id]
      },
    })
    const host = new MemoryHost({
      files: { ...files, '/app/other.ts': 'export const o = 1\n' },
      recognizer: RECOGNIZER,
      virtual,
      markerSpecifiers,
    })
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual([])
    loaded['virtual:generated'] = LOADED
    host.write('/app/other.ts', 'export const o = 2\n')
    await invalidate(
      host.caches,
      { path: '/app/other.ts', kind: 'change' },
      host,
    )
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual(LOADED_MARKER)
  })

  // A thrown load announced during the same compile (its host's update
  // names the module): the kept entry lets the event through, and the
  // compile's check reads the module again.
  // Source: Astra's `rejected-event.mjs`, Fable's p8 (c).
  it("a load that threw, announced during the importer's compile, reaches the importer", async () => {
    const loaded: Record<string, string> = {}
    let fail = true
    const virtual = new Proxy(loaded, {
      get(target, id: string) {
        if (fail) {
          fail = false
          throw new Error('the plugin is not ready')
        }
        return target[id]
      },
    })
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      virtual,
      markerSpecifiers,
    })
    const reached = gate()
    const proceed = gate()
    let once = true
    const compiling = host.compile('/app/page.ts', [
      markerReader(async () => {
        if (once) {
          once = false
          reached.open()
          await proceed.opened
        }
      }),
    ])
    await reached.opened
    loaded['virtual:generated'] = LOADED
    await invalidate(
      host.caches,
      { path: 'virtual:generated', kind: 'change' },
      host,
    )
    proceed.open()
    expect(messages(await compiling)).toEqual(LOADED_MARKER)
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual(LOADED_MARKER)
  })

  it("its change event during the importer's compile reaches the importer", async () => {
    const virtual: Record<string, string> = {}
    const host = new MemoryHost({
      files,
      recognizer: RECOGNIZER,
      virtual,
      markerSpecifiers,
    })
    const reached = gate()
    const proceed = gate()
    let once = true
    const compiling = host.compile('/app/page.ts', [
      markerReader(async () => {
        if (once) {
          once = false
          reached.open()
          await proceed.opened
        }
      }),
    ])
    await reached.opened
    virtual['virtual:generated'] = LOADED
    await invalidate(
      host.caches,
      { path: 'virtual:generated', kind: 'change' },
      host,
    )
    proceed.open()
    expect(messages(await compiling)).toEqual(LOADED_MARKER)
    expect(
      messages(await host.compile('/app/page.ts', [markerReader()])),
    ).toEqual(LOADED_MARKER)
  })
})

// The summary half of the thrown-load rule (`RawFactsCache.get`): an export
// read through a virtual module whose first load threw.
// Source: Fable's look at the thrown-load rule (p8, the summary row).
describe("a virtual module's exports read when its load threw", () => {
  it('the next request after a save reads the loaded module', async () => {
    const files = {
      '/app/a.ts':
        "import { make } from 'virtual:foo'\nexport const x = make\n",
      '/app/other.ts': 'export const o = 1\n',
    }
    const loaded: Record<string, string> = {}
    let fail = true
    const virtual = new Proxy(loaded, {
      get(target, id: string) {
        if (fail) {
          fail = false
          throw new Error('the plugin is not ready')
        }
        return target[id]
      },
    })
    const reader = (): Planner => ({
      name: 'toy',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const found = await ctx.resolver.resolve('virtual:foo', 'make')
        ctx.set(found.k === 'found' ? found.value : found.k)
      },
      plan(ctx) {
        ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
      },
    })
    const host = new MemoryHost({ files, recognizer: RECOGNIZER, virtual })
    expect(
      (await host.compile('/app/a.ts', [reader()]))!.facts.planners,
    ).toEqual({ toy: 'absent' })
    loaded['virtual:foo'] = SERVER_ONLY
    host.write('/app/other.ts', 'export const o = 2\n')
    await invalidate(
      host.caches,
      { path: '/app/other.ts', kind: 'change' },
      host,
    )
    const out = await host.compile('/app/a.ts', [reader()])
    expect(out!.facts.planners).toEqual({ toy: SERVER_ONLY_MAKE })
  })
})

// Step 6a re-check (Fable, p3 (c)): the file removed and created again with
// the same bytes while its compile is in flight. The removal clears the
// latest text (`PlanCache.removed`): the answer is not current and nothing
// is published until the bundler's request of the recreated file.
describe('a file removed and created again with the same bytes during its compile', () => {
  it('the answer is not current; the rebuild of the file is', async () => {
    const PAGE = '/app/page.ts'
    const TEXT = "import { make } from './b'\nexport const x = make\n"
    const host = new MemoryHost({
      files: { [PAGE]: TEXT, '/app/b.ts': 'export const make = 1\n' },
      recognizer: RECOGNIZER,
    })
    const reader = heldReader()
    const { reached, proceed } = reader.hold()
    let current: boolean | undefined
    const compiling = host.settle(PAGE, [reader.planner()], (s) => {
      current = s.current()
    })
    await reached
    delete host.files[PAGE]
    await invalidate(host.caches, { path: PAGE, kind: 'unlink' }, host)
    host.write(PAGE, TEXT)
    await invalidate(host.caches, { path: PAGE, kind: 'add' }, host)
    proceed()
    await compiling
    expect(current).toBe(false)
    expect(host.caches.stale.take(CLIENT.name)).toEqual([PAGE])
    let rebuilt: boolean | undefined
    await host.settle(PAGE, [reader.planner()], (s) => {
      rebuilt = s.current()
    })
    expect(rebuilt).toBe(true)
  })
})

// One answer per fact is one per importer and specifier: a barrel's `./x`
// is not its importer's `./x`.
// Source: the mutation run of the step 6a re-check fixes (Fable's M26).
describe('one specifier from two importers in one attempt', () => {
  it('each importer gets its own resolution', async () => {
    const files = {
      '/app/page.ts':
        "import { make } from './x'\nimport { make as m } from './lib'\nexport const use = [make, m]\n",
      '/app/x.ts': 'export const make = 1\n',
      '/app/lib/index.ts': "export * from './x'\n",
      '/app/lib/x.ts': SERVER_ONLY,
    }
    const out = await new MemoryHost({ files, recognizer: RECOGNIZER }).compile(
      '/app/page.ts',
      [toySummaryPlanner()],
    )
    const facts = out!.facts.planners['toy-summary'] as Record<string, unknown>
    expect(facts['./lib']).toEqual(SERVER_ONLY_MAKE)
    expect(facts['./x']).not.toEqual(facts['./lib'])
  })
})

// A dependency saved in place (truncated, then written) while a compile
// that resolved it is in flight: the watcher reports one change, at the
// truncation, and none for the write 12 ms later (chokidar's 50 ms change
// throttle). The event reads the file empty and reads it again for a
// moment, since a compile in flight read what resolves to it; the compile
// then reads the saved exports.
// Source: Astra's review of settlement step 6b (`physical-vite-6b.mjs`).
describe('a dependency truncated and written while a compile that resolved it runs', () => {
  const DEP = '/app/dep.ts'
  const importer = "import * as dep from './dep'\nexport const out = dep\n"
  const messages = (out: CompileOutput | null) =>
    out!.diagnostics.map((d) => d.message)
  /** A policy reading `./dep`'s exports; `held`: waits once between the resolution and the read. */
  function exportsReader(held = false) {
    const reached = gate()
    const proceed = gate()
    let hold = held
    const planner = (): Planner => ({
      name: 'exports',
      tier: 0,
      gate: (t0) => t0.imports.some((i) => i.specifier === './dep'),
      plan() {},
      async policy(_plan, _output, _edges, ctx) {
        const id = await ctx.resolve('./dep')
        if (hold) {
          hold = false
          reached.open()
          await proceed.opened
        }
        const { exportNames } = await ctx.targetFacts(id!)
        ctx.diagnostic({
          severity: 'warning',
          by: 'exports',
          code: 'observed',
          message: exportNames.join(','),
        })
      },
    })
    return { planner, reached: reached.opened, proceed: proceed.open }
  }
  /**
   * The in-place save: truncated now, its one event applied, the text
   * written 12 ms after the truncation (`written`).
   */
  async function save(host: MemoryHost) {
    host.write(DEP, '')
    const written = new Promise<void>((r) =>
      setTimeout(() => {
        host.write(DEP, 'export const newValue = 2\n')
        r()
      }, 12),
    )
    await invalidate(host.caches, { path: DEP, kind: 'change' }, host)
    return { written }
  }

  it('the compile reads the saved text, not the empty one', async () => {
    const files = {
      '/app/page.ts': importer,
      [DEP]: 'export const oldValue = 1\n',
    }
    const reader = exportsReader(true)
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    const compiling = host.compile('/app/page.ts', [reader.planner()])
    await reader.reached
    // (the compile goes on once the event applied, as a bundler's does)
    const { written } = await save(host)
    reader.proceed()
    const returned = messages(await compiling)
    await written
    const cold = messages(
      await new MemoryHost({
        files: host.files,
        recognizer: RECOGNIZER,
      }).compile('/app/page.ts', [exportsReader().planner()]),
    )
    expect(cold).toEqual(['newValue'])
    expect(returned).toEqual(cold)
    expect(
      messages(await host.compile('/app/page.ts', [exportsReader().planner()])),
    ).toEqual(cold)
  })

  // The compile that read the dependency is of an older text of its file
  // (a newer request of the file replaced it): what it reads in the window
  // is what another importer then reads.
  // Source: Astra's re-check of settlement step 6b (`physical-vite-superseded.mjs`).
  it('a compile of an older text reading it does not leave the empty text to another importer', async () => {
    const files = {
      '/app/page.ts': importer,
      '/app/other.ts': importer,
      [DEP]: 'export const oldValue = 1\n',
    }
    const reader = exportsReader(true)
    const host = new MemoryHost({ files, recognizer: RECOGNIZER })
    const compiling = host.compile('/app/page.ts', [reader.planner()])
    await reader.reached
    // the page is edited: its newer text imports nothing of `./dep`
    host.write('/app/page.ts', 'export const out = 0\n')
    await invalidate(
      host.caches,
      { path: '/app/page.ts', kind: 'change' },
      host,
    )
    expect(
      await host.compile('/app/page.ts', [exportsReader().planner()]),
    ).toBeNull()
    const { written } = await save(host)
    reader.proceed()
    await compiling
    await written
    const cold = messages(
      await new MemoryHost({
        files: host.files,
        recognizer: RECOGNIZER,
      }).compile('/app/other.ts', [exportsReader().planner()]),
    )
    expect(cold).toEqual(['newValue'])
    expect(
      messages(
        await host.compile('/app/other.ts', [exportsReader().planner()]),
      ),
    ).toEqual(cold)
  })
})

// The in-place-save wait (`maySave`) is a code file's: a file the compiler
// does not read (an asset: no language) reads as '' after its event and
// waits for nothing; and an empty code file whose event already waited
// for its text in vain is empty: no reader waits again for that event.
// Source: the re-checks of settlement step 6b (Astra's `maysave-cost.mjs`,
// Gemini's `recheck2-probes-gemini.mjs`).
describe("an empty read after a file's event", () => {
  /** A policy reading the marker of what `spec` resolves to. */
  const markerOf = (spec: string): Planner => ({
    name: 'reader',
    tier: 0,
    gate: () => true,
    plan() {},
    async policy(_plan, _output, _edges, ctx) {
      const id = await ctx.resolve(spec)
      await ctx.targetMarker(id!)
    },
  })

  /** A policy reading `./dep`'s exports; `hold`: waits once between the resolution and the read. */
  function exportsOf(hold?: { reached: () => void; proceed: Promise<void> }) {
    let held = hold
    return (): Planner => ({
      name: 'exports',
      tier: 0,
      gate: (t0) => t0.imports.some((i) => i.specifier === './dep'),
      plan() {},
      async policy(_plan, _output, _edges, ctx) {
        const id = await ctx.resolve('./dep')
        if (held) {
          const h = held
          held = undefined
          h.reached()
          await h.proceed
        }
        const { exportNames } = await ctx.targetFacts(id!)
        ctx.diagnostic({
          severity: 'warning',
          by: 'exports',
          code: 'observed',
          message: exportNames.join(','),
        })
      },
    })
  }
  const own = (): Planner => ({
    name: 'own',
    tier: 0,
    gate: () => true,
    plan(ctx) {
      ctx.setFacts('own', true)
    },
  })
  /**
   * The file emptied with its own plan published (its event waits for its
   * text in vain: the file is empty, and the plan is retired).
   */
  async function emptied(host: MemoryHost) {
    await host.compile('/app/dep.ts', [own()])
    host.write('/app/dep.ts', '')
    await invalidate(host.caches, { path: '/app/dep.ts', kind: 'change' }, host)
  }

  // A later in-place save (truncated, its one event, written 12 ms later)
  // while an importer that resolved the file is in flight: that event is
  // not the one that waited in vain, so the importer waits for the text.
  // Source: Gemini's re-check of settlement step 6b (`recheck3-probes-gemini.mjs`, probe A).
  it('a later in-place save of a file emptied before: the importer reads the saved text', async () => {
    const host = new MemoryHost({
      files: {
        '/app/dep.ts': 'export const oldValue = 1\n',
        '/app/page.ts': "import * as dep from './dep'\nexport const x = dep\n",
      },
      recognizer: RECOGNIZER,
    })
    await emptied(host)
    const reached = gate()
    const proceed = gate()
    const compiling = host.compile('/app/page.ts', [
      exportsOf({ reached: reached.open, proceed: proceed.opened })(),
    ])
    await reached.opened
    host.write('/app/dep.ts', '')
    const written = new Promise<void>((r) =>
      setTimeout(() => {
        host.write('/app/dep.ts', 'export const newValue = 2\n')
        r()
      }, 12),
    )
    await invalidate(host.caches, { path: '/app/dep.ts', kind: 'change' }, host)
    proceed.open()
    const first = await compiling
    await written
    expect(first!.diagnostics.map((d) => d.message)).toEqual(['newValue'])
  })

  // What an event's wait in vain confirmed (the file empty) ends with a read
  // that finds text: the event is no longer evidence for a later read.
  it('a read that finds text ends what an event confirmed empty', async () => {
    const host = new MemoryHost({
      files: {
        '/app/dep.ts': 'export const oldValue = 1\n',
        '/app/page.ts': "import * as dep from './dep'\nexport const x = dep\n",
      },
      recognizer: RECOGNIZER,
    })
    await emptied(host)
    expect(host.rawFacts.stats(false).emptyReadPaths).toBe(1)
    // written with no event of its own (the watcher's throttle), then read
    host.write('/app/dep.ts', 'export const newValue = 2\n')
    const out = await host.compile('/app/page.ts', [exportsOf()()])
    expect(out!.diagnostics.map((d) => d.message)).toEqual(['newValue'])
    expect(host.rawFacts.stats(false).emptyReadPaths).toBe(0)
  })

  it("an asset's next read after its event schedules no wait", async () => {
    const host = new MemoryHost({
      files: {
        '/app/page.ts': "import './style.css'\nexport const ok = 1\n",
        '/app/style.css': 'body { color: red }\n',
      },
      recognizer: RECOGNIZER,
    })
    await host.compile('/app/page.ts', [markerOf('./style.css')])
    host.write('/app/style.css', 'body { color: blue }\n')
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const event = invalidate(
        host.caches,
        { path: '/app/style.css', kind: 'change' },
        host,
      )
      const compiling = event.then(() =>
        host.compile('/app/page.ts', [markerOf('./style.css')]),
      )
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setImmediate(r))
      }
      // (a wait would be a pending timer)
      expect(vi.getTimerCount()).toBe(0)
      await vi.runAllTimersAsync()
      await compiling
    } finally {
      vi.useRealTimers()
    }
  })

  it('an empty code file is read once per event, its retries included', async () => {
    let reads = 0
    const host = new MemoryHost({
      files: {
        '/app/page.ts': "import './empty'\nexport const ok = 1\n",
        '/app/empty.ts': 'export const v = 1\n',
      },
      recognizer: RECOGNIZER,
      onRead: (path) => {
        if (path === '/app/empty.ts') {
          reads++
        }
      },
    })
    await host.compile('/app/page.ts', [markerOf('./empty')])
    host.write('/app/empty.ts', '')
    reads = 0
    await invalidate(
      host.caches,
      { path: '/app/empty.ts', kind: 'change' },
      host,
    )
    await host.compile('/app/page.ts', [markerOf('./empty')])
    // the event's read and its ten retries (`SAVE_RETRIES`): a second wait
    // would read it ten more times (the target-facts knob, which reuses
    // no marker, reads it once more)
    expect(reads).toBeGreaterThanOrEqual(11)
    expect(reads).toBeLessThan(11 + 10)
  })
})
