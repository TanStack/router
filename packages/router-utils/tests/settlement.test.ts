/**
 * Kept as the sole coverage of the request lifetime no public input reaches
 * deterministically (settlement design, step 1): what a request settles on
 * (`settleModule`) and whether it is still current while its host acts on it,
 * across the overlaps the key's generation orders. A request's `use` waits
 * on a gate while newer requests and events land, then reads `current()`.
 * Hosts write shared state only for a current answer: an older untouched
 * answer that is no longer current clears nothing (C6-02a), an older answer
 * of the text the file has again (A, B, A), of a file removed and created
 * again with the same bytes, or judged before a dependency-only change is no
 * longer current, and sibling outputs of one text all are. A derived id of an
 * untouched module settles as the empty module (C6-19).
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  toyEnvPlanner,
  toySplitPlanner,
  toySummaryPlanner,
} from './helpers'
import { RECOGNIZER, gate, overtakenReader } from './race-helpers'
import type { Planner, Settlement } from '../src/compiler'

const planners = (): Array<Planner> => [toySummaryPlanner(), toyEnvPlanner()]

/**
 * Settles `id` and holds the request open: `settled` resolves with the
 * settlement once the answer is taken; `close()` ends the request, giving
 * what `current()` read then.
 */
function held(host: MemoryHost, id: string, code?: string) {
  const taken = gate()
  const closing = gate()
  let settlement!: Settlement
  const done = host.settle(
    id,
    planners(),
    async (s) => {
      settlement = s
      taken.open()
      await closing.opened
      return s.current()
    },
    code === undefined ? {} : { code },
  )
  return {
    settled: taken.opened.then(() => settlement),
    close: () => {
      closing.open()
      return done
    },
  }
}

/** Whether a request of `id` (its text as the file has it, or `code`) is current when answered. */
const currentNow = (host: MemoryHost, id: string, code?: string) =>
  host.settle(
    id,
    planners(),
    (s) => s.current(),
    code === undefined ? {} : { code },
  )

const A = "import { make } from './b'\nexport const use = make\n"
const B = "import { make } from './c'\nexport const use = make\n"
const PLAIN = 'export const use = 1\n'

const memoryHost = (files: Record<string, string>) =>
  new MemoryHost({ files, recognizer: RECOGNIZER })

/** A host whose first resolution of `./b` waits before its answer: `holding` resolves once it waits, `release()` lets it finish. */
function holdingB(files: Record<string, string>) {
  let hold: (() => void) | null = null
  const holding = gate()
  const host = new MemoryHost({
    files,
    recognizer: RECOGNIZER,
    onResolve: (specifier) => {
      if (specifier === './b' && hold === null) {
        return new Promise<void>((r) => {
          hold = r
          holding.open()
        })
      }
      return undefined
    },
  })
  return { host, holding: holding.opened, release: () => hold!() }
}

describe('a settlement while its request is open', () => {
  it('an answer nothing newer overtook is current', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
    })
    const older = held(host, '/app/a.ts')
    expect((await older.settled).kind).toBe('compiled')
    expect(await older.close()).toBe(true)
  })

  // C6-02a: the older request's text names nothing the planners take
  // (untouched); a request of the file's newer text arrives while the older
  // answer's host acts on it. Source: whole-PR review C6-02 (a) (Astra's
  // session probe, `order.mjs`).
  it('C6-02a: an older untouched answer is not current once a newer text is requested', async () => {
    const host = memoryHost({
      '/app/a.ts': PLAIN,
      '/app/b.ts': 'export const make = 1\n',
    })
    const older = held(host, '/app/a.ts')
    expect((await older.settled).kind).toBe('untouched')
    expect(await currentNow(host, '/app/a.ts', A)).toBe(true)
    expect(await older.close()).toBe(false)
  })

  // A, B, A: the older answer's text is the file's text again.
  // Source: Astra's review of the settlement design, change 2.
  it('an older answer of the text the file has again (A, B, A) is not current', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
      '/app/c.ts': 'export const make = 2\n',
    })
    const older = held(host, '/app/a.ts')
    await older.settled
    await host.compile('/app/a.ts', planners(), { code: B })
    expect(await currentNow(host, '/app/a.ts', A)).toBe(true)
    expect(await older.close()).toBe(false)
  })

  it('an older answer of a file removed and created again with the same bytes is not current', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
    })
    const older = held(host, '/app/a.ts')
    await older.settled
    delete host.files['/app/a.ts']
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'unlink' }, host)
    host.write('/app/a.ts', A)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'add' }, host)
    expect(await currentNow(host, '/app/a.ts')).toBe(true)
    expect(await older.close()).toBe(false)
  })

  it('an older answer judged before a dependency-only change is not current', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
    })
    const older = held(host, '/app/a.ts')
    await older.settled
    host.write('/app/b.ts', 'export function make() {}\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(await currentNow(host, '/app/a.ts')).toBe(true)
    expect(await older.close()).toBe(false)
  })
})

describe('a settlement while its request is open: the generation it was taken at', () => {
  // The older request's compile waits on a resolution while a request of
  // another text arrives and is answered: the older answer is of a text that
  // is no longer the latest (the old `superseded` case).
  // Source: Fable's review of settlement step 1, P4.
  it('an answer of a text a newer request arrived for while it compiled is not current', async () => {
    const { host, holding, release } = holdingB({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
      '/app/c.ts': 'export const make = 2\n',
    })
    const older = host.settle('/app/a.ts', planners(), (s) => s.current())
    await holding
    expect(await currentNow(host, '/app/a.ts', B)).toBe(true)
    release()
    expect(await older).toBe(false)
  })

  // A derived id's request waits on the file's modification time (the
  // check that its text differs from the published plan's) while a request
  // of another text arrives and is answered; the derived request then settles
  // untouched: of a text that is no longer the latest.
  // Source: Fable's review of settlement step 1, P4 (a wait before the
  // answer is taken).
  it('an answer taken after a newer text arrived during its wait is not current', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
      '/app/c.ts': 'export const make = 2\n',
    })
    await host.compile('/app/a.ts', planners())
    const waiting = gate()
    const release = gate()
    Object.assign(host, {
      modifiedAt: async () => {
        waiting.open()
        await release.opened
        return 0
      },
    })
    const older = host.settle(
      '/app/a.ts?tsr-split=component',
      planners(),
      (s) => s.current(),
      { code: PLAIN },
    )
    await waiting.opened
    Object.assign(host, { modifiedAt: undefined })
    expect(await currentNow(host, '/app/a.ts', B)).toBe(true)
    release.open()
    expect(await older).toBe(false)
  })

  // A dependency's save changes no fact the open request read (a comment):
  // its plan stays published, nothing is stale, no newer answer is coming.
  // Source: Fable's review of settlement step 1, P1.
  it('an answer stays current across a comment-only save of a dependency', async () => {
    const host = memoryHost({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
    })
    const older = held(host, '/app/a.ts')
    await older.settled
    host.write('/app/b.ts', '// a note\nexport const make = 1\n')
    await invalidate(host.caches, { path: '/app/b.ts', kind: 'change' }, host)
    expect(host.caches.stale.take('client')).toEqual([])
    expect(await older.close()).toBe(true)
  })

  // Two requests share one compile; the first's host, acting on the answer,
  // applies a change that evicts the plan (a route-registry change). The second request's answer is
  // the same pre-eviction answer: not current.
  // Source: Astra's review of settlement step 1, finding 1.
  it('a request sharing a compile whose plan an earlier sharer saw evicted is not current', async () => {
    const { host, holding, release } = holdingB({
      '/app/a.ts': A,
      '/app/b.ts': 'export const make = 1\n',
    })
    const evicted = gate()
    const first = host.settle('/app/a.ts', planners(), async (s) => {
      const current = s.current()
      // (a registry change of the file evicts its plan in the turn it is told)
      const event = invalidate(
        host.caches,
        { path: '/app/a.ts', kind: 'registry' },
        host,
      )
      evicted.open()
      await event
      return current
    })
    await holding
    const second = host.settle('/app/a.ts', planners(), async (s) => {
      await evicted.opened
      return s.current()
    })
    release()
    expect(await Promise.all([first, second])).toEqual([true, false])
  })
})

describe('outputs of one text', () => {
  const ROUTE = '/app/route.tsx'
  const route = dedent(`
    import { createFileRoute } from 'toy-router'
    export const Route = createFileRoute('/')({ component: () => 'MARK' })
  `)

  // Two outputs of one file in one environment, both requested and open at
  // once (the chunk requested while the env module's host acts on its
  // answer): both are current. Source: the settlement design, §2.
  it('sibling outputs of one text are all current', async () => {
    const host = memoryHost({ [ROUTE]: route })
    const split = [toySplitPlanner()]
    const read = gate()
    const answer = (id: string) => {
      const entered = gate()
      const done = host.settle(id, split, async (s) => {
        entered.open()
        await read.opened
        return [s.kind, s.current()]
      })
      return { entered: entered.opened, done }
    }
    const env = answer(ROUTE)
    await env.entered
    const chunk = answer(`${ROUTE}?tsr-split=component`)
    await chunk.entered
    read.open()
    expect(await Promise.all([env.done, chunk.done])).toEqual([
      ['compiled', true],
      ['compiled', true],
    ])
  })

  // A sibling request arrives while the first one's host still acts on its
  // answer: of a published plan (the sibling is a plan hit), of an untouched
  // text, of a text that does not parse. Both are current.
  // Source: Fable's review of settlement step 1, P2.
  it.for([
    ['a published plan (a plan hit)', A],
    ['an untouched text', PLAIN],
    ['a text that does not parse', 'export const = ;\n'],
  ] as const)('a late sibling of %s: both are current', async ([, code]) => {
    const host = memoryHost({
      '/app/a.ts': code,
      '/app/b.ts': 'export const make = 1\n',
    })
    const first = held(host, '/app/a.ts')
    await first.settled
    expect(await currentNow(host, '/app/a.ts')).toBe(true)
    expect(await first.close()).toBe(true)
  })

  // C6-19: a derived id of a module the planners leave untouched is the
  // empty module, not the module's text.
  it('a derived id of an untouched module settles as the empty module', async () => {
    const host = memoryHost({ '/app/plain.ts': PLAIN })
    const out = await host.settle(
      '/app/plain.ts?tsr-split=component',
      [toySplitPlanner()],
      (s) => (s.kind === 'compiled' ? s.output.code : null),
    )
    expect(out).toBe('export {}\n')
  })
})

// The same-text rule of the settlement design (§2 rev 3, §8.2), not built
// (KNOWN-BUGS, accepted limits): a request whose every attempt was
// overtaken (a dependency saved during each) answers unpublished, and its
// host still acts on it while the stale-set rebuild of the same text
// publishes with the current facts: both read current, facts differing.
// Accepted: moving the generation at publication would also end an
// unpublished env-module answer whose split sibling publishes first, which
// writes no server functions (worse).
// Source: Fable's and Gemini's reviews of settlement step 1, question 3.
describe('an answer every attempt of which was overtaken', () => {
  it.fails(
    'is not current once the rebuild of its text publishes',
    async () => {
      // (the first three attempts wait after they read `b.ts`'s export)
      const { planner, nextHeld } = overtakenReader(3)
      const own = () => [planner()]
      const host = memoryHost({
        '/app/a.ts': A,
        '/app/b.ts': 'export const make = 1\n',
      })
      const closing = gate()
      const taken = gate()
      const first = host.settle('/app/a.ts', own(), async (s) => {
        taken.open()
        await closing.opened
        return s.current()
      })
      for (let save = 1; save <= 3; save++) {
        const release = await nextHeld()
        host.write(
          '/app/b.ts',
          save % 2 === 1
            ? 'export function make() {}\n'
            : 'export const make = 1\n',
        )
        await invalidate(
          host.caches,
          { path: '/app/b.ts', kind: 'change' },
          host,
        )
        release()
      }
      await taken.opened
      // (exhausted: the host is told to build the file again, and does; the
      // rebuild is current, or the pin's setup failed)
      const stale = host.caches.stale.take('client')
      if (stale.join() !== '/app/a.ts') {
        throw new Error(`test: the attempts were not exhausted: ${stale}`)
      }
      const rebuilt = await host.settle('/app/a.ts', own(), (s) => s.current())
      if (!rebuilt) {
        throw new Error('test: the rebuild of the text is not current')
      }
      closing.open()
      expect(await first).toBe(false)
    },
  )
})
