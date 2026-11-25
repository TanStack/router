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
import type { Planner, Settlement } from '../src/compiler'

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

/** A promise and the function that settles it. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((r) => (open = r))
  return { opened, open }
}

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

describe('outputs of one text', () => {
  const ROUTE = '/app/route.tsx'
  const route = dedent(`
    import { createFileRoute } from 'toy-router'
    export const Route = createFileRoute('/')({ component: () => 'MARK' })
  `)

  // Two outputs of one file in one environment, both requested and open at
  // once: both are current. Source: the settlement design, §2.
  it('sibling outputs of one text are all current', async () => {
    const host = memoryHost({ [ROUTE]: route })
    const split = [toySplitPlanner()]
    const open = gate()
    const answer = (id: string) =>
      host.settle(id, split, async (s) => {
        await open.opened
        return [s.kind, s.current()]
      })
    const env = answer(ROUTE)
    const chunk = answer(`${ROUTE}?tsr-split=component`)
    open.open()
    expect(await Promise.all([env, chunk])).toEqual([
      ['compiled', true],
      ['compiled', true],
    ])
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
