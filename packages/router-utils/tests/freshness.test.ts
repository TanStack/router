/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of dev races no public input
 * reaches deterministically: a compile in flight while a save, an event that
 * makes a failed import resolve, or a file removed and created again within
 * one change lands; an older text's request answered after the newer text's
 * compile. Each sequence ends with the outputs a cold compile of the final
 * files gives, and the caches keep nothing of files gone. Added for the
 * settlement design's step 0 (2026-11-25): a check (hit, attempt, restore)
 * whose read waits while an event lands, and the facts version moving during
 * an attempt's check (pins of oracle/KNOWN-BUGS.md "A check that waits while
 * an event lands accepts what it read before").
 */
import { describe, expect, it } from 'vitest'
import { invalidate, restorePlans } from '../src/compiler'
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
      host.caches.stale.take(CLIENT.name)
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

/** A promise and the function that settles it. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((r) => (open = r))
  return { opened, open }
}

// Settlement design, step 0 (design-settlement.md §4, §6): a plan reused or
// published after a check that waited on the resolver (or a read) while an
// event changed what the check reads. Each row ends with what a cold compile
// of the final files gives. The `.fails` rows are pins: step 6a (one
// `stable(snapshot)` accepted in the caller's turn, the generation rule)
// turns them green.
describe('a check that waits while an event lands', () => {
  const PAGE = '/app/page.ts'
  const files = {
    [PAGE]: "import { make } from './w'\nexport const use = make\n",
    '/app/a.ts': SERVER_ONLY,
    '/app/b.ts': 'export const make = 1\n',
    '/app/tsconfig.json': '{}\n',
  }
  const factsOf = (out: CompileOutput | null) => out?.facts.planners

  /**
   * A host whose `./w` resolves to `target.id` (a tsconfig `paths` alias),
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

  /** The alias now names `b.ts`: the tsconfig's change, applied. */
  async function retarget(host: MemoryHost, target: { id: string }) {
    target.id = '/app/b.ts'
    host.write(
      '/app/tsconfig.json',
      '{ "compilerOptions": { "paths": { "./w": ["./b.ts"] } } }\n',
    )
    await invalidate(
      host.caches,
      { path: '/app/tsconfig.json', kind: 'change' },
      host,
    )
  }

  const cold = async () =>
    factsOf(await aliasHost({ id: '/app/b.ts' }).host.compile(PAGE, planners()))

  // C6-01 (hit). The plan asks its resolution again (an add moved the file
  // set); the resolver read the alias before the tsconfig's change and
  // answers after it applied. Source: whole-PR review C6-01 (Astra's
  // restore probe, the hit half).
  it.fails(
    'C6-01: a plan hit whose resolution was read before a tsconfig change answers the new target',
    async () => {
      const target = { id: '/app/a.ts' }
      const { host, arm, release } = aliasHost(target)
      await host.compile(PAGE, planners())
      host.write('/app/c.ts', 'export const c = 1\n')
      await invalidate(host.caches, { path: '/app/c.ts', kind: 'add' }, host)
      const reached = arm()
      const hit = host.compile(PAGE, planners())
      await reached
      await retarget(host, target)
      release()
      expect(factsOf(await hit)).toEqual(await cold())
    },
  )

  // C6-01 (attempt), the control: a compile's resolution read before the
  // change; the attempt's own check asks it again and compiles again.
  it('C6-01: a compile whose resolution was read before a tsconfig change answers the new target', async () => {
    const target = { id: '/app/a.ts' }
    const { host, arm, release } = aliasHost(target)
    const reached = arm()
    const compiling = host.compile(PAGE, planners())
    await reached
    await retarget(host, target)
    release()
    expect(factsOf(await compiling)).toEqual(await cold())
  })

  // C6-01 (restore). A persisted plan's check reads the resolution before
  // the change and answers after it: the plan is reported stale (its
  // bundler builds the module again), not restored.
  // Source: whole-PR review C6-01 (Astra's restore probe).
  it.fails(
    'C6-01: a restored plan whose resolution was read before a tsconfig change is reported stale',
    async () => {
      const first = aliasHost({ id: '/app/a.ts' }).host
      const persisted = (await first.compile(PAGE, planners()))!.persisted!
      const target = { id: '/app/a.ts' }
      const { host, arm, release } = aliasHost(target)
      const reached = arm()
      const restoring = restorePlans(host.caches, [persisted], host)
      await reached
      await retarget(host, target)
      release()
      expect(await restoring).toEqual([persisted.key])
    },
  )

  // C6-03. An upstream plugin prepends a banner to the file's text; the
  // file's change event (its own save, read without the banner) lands
  // while the compile of that save waits on a resolution. No newer request
  // exists: the host builds the file again if the compile was not kept (its
  // stale set), and afterwards a change of what the file reads reaches the
  // host as a rebuild of the file.
  // Source: whole-PR review C6-03 (Astra's current-input probe); Astra's
  // review of settlement step 0, finding 6.
  it.fails(
    "C6-03: after the event of a file's own save, a change of what it reads still rebuilds it",
    async () => {
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
    },
  )

  // A route-registry digest the plan read changes while the hit's check
  // waits on the resolver: a watch build publishes the generator's view
  // with no file event the caches see.
  // Source: Astra's review of the settlement design, change 1
  // (`registry-during-hit.mjs`).
  it.fails(
    'a plan hit whose route-registry digest changed during its check answers the new digest',
    async () => {
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
    },
  )
})

// The facts version moving during a check (design-settlement.md §4, p1),
// green on head through the `asked` rows; step 6b removes them, and these
// rows decide whether the snapshot alone keeps them green. `a.ts` read
// `b.ts`'s export; `b.ts` is saved, and its event (the file set moved)
// waits on its read of `b.ts`; the attempt reaches its check, which asks
// `./b` again and waits; the event applies; the resolver answers.
// Source: Fable's settlement design probe `p1-facts-move-during-check.mjs`;
// the comment-only edit is its control.
describe('a dependency saved while a compile checks its snapshot', () => {
  /** `waited`, or nothing after `ms` (a compiler that does not wait there goes on). */
  const atMost = (waited: Promise<void>, ms = 2_000) =>
    Promise.race([waited, new Promise<void>((r) => setTimeout(r, ms))])

  it.for([
    ['a change of the export', 'export function make() {}\n'],
    ['a comment-only edit', '// a note\nexport const make = 1\n'],
  ] as const)(
    '%s: the compile answers the saved dependency',
    async ([, saved]) => {
      const files = {
        '/app/a.ts': "import { make } from './b'\nexport const x = make\n",
        '/app/b.ts': 'export const make = 1\n',
      }
      // each hold waits once, from when it is armed
      let holdEventRead = false
      let holdCheck = false
      let holdPrefetch = true
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
      const cold = await new MemoryHost({
        files: host.files,
        recognizer: RECOGNIZER,
      }).compile('/app/a.ts', [planner()])
      expect(out!.facts.planners).toEqual(cold!.facts.planners)
    },
  )
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
