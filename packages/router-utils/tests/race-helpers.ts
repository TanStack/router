/**
 * Pieces of the race rows (`freshness`, `settlement`): gates that hold a
 * request at a named point (a resolution, a planner's prefetch or policy, a
 * virtual load) while the test lands events, and the planners that read a
 * dependency there. Nothing waits on elapsed time: a row waits for the point
 * it holds, or for a turn (`turn`), in which the memory host's microtasks
 * all run.
 */
import type { MemoryHost } from './helpers'
import type { Planner } from '../src/compiler'

export const RECOGNIZER = {
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

/** A promise and the function that settles it. */
export function gate() {
  let open!: () => void
  const opened = new Promise<void>((r) => (open = r))
  return { opened, open }
}

/**
 * One macrotask turn: the memory host answers in microtasks, so a request
 * goes as far as it can without a timer or a held gate.
 */
export const turn = () => new Promise<void>((r) => setImmediate(r))

/**
 * A planner reading `specifier`'s `make` export (its facts: the export's
 * value, or the resolution's kind) whose next prefetch, once `hold` is
 * called, waits after its reads until `proceed`; it counts attempts.
 */
export function heldReader(specifier = './b') {
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

/**
 * A planner reading `./b`'s `make` export (as `heldReader`) whose first
 * `holds` attempts each wait after the read: `nextHeld()` resolves, once
 * the next one waits, with the function that lets it go on.
 */
export function overtakenReader(holds: number) {
  const waiting: Array<() => void> = []
  const waiters: Array<(release: () => void) => void> = []
  const planner = (): Planner => ({
    name: 'toy',
    tier: 1,
    gate: () => true,
    async prefetch(_t0, ctx) {
      const target = await ctx.resolve('./b')
      const found = await ctx.resolver.resolve(target!, 'make')
      if (holds > 0) {
        holds--
        await new Promise<void>((release) => {
          const waiter = waiters.shift()
          if (waiter) {
            waiter(release)
          } else {
            waiting.push(release)
          }
        })
      }
      ctx.set(found.k === 'found' ? found.value : found.k)
    },
    plan(ctx) {
      ctx.setFacts('toy', ctx.prefetched.get('toy') ?? null)
    },
  })
  const nextHeld = () =>
    new Promise<() => void>((r) => {
      const release = waiting.shift()
      if (release) {
        r(release)
      } else {
        waiters.push(r)
      }
    })
  return { planner, nextHeld }
}

/**
 * Holds `host`'s resolutions: `arm(specifier)` makes the next resolution of
 * `specifier` wait, once it has its answer, until `release`; `reached`
 * resolves when it waits (a resolver that read the files before an event
 * and answers after it).
 */
export function holdResolutions(host: MemoryHost) {
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
  return (specifier: string) => {
    const release = gate()
    const reached = new Promise<void>((r) => {
      armed.set(specifier, { reached: r, release: release.opened })
    })
    return { reached, release: release.open }
  }
}

/**
 * Virtual modules whose first load throws (a plugin that is not ready),
 * then serves `loaded`.
 */
export function throwingOnce() {
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
  return { loaded, virtual }
}

/**
 * A policy reading `./dep`'s exports, reported as a warning of their
 * names; `held`: its first read waits between the resolution and the read
 * until `proceed`, `reached` resolving when it waits.
 */
export function exportsReader(held = false) {
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
