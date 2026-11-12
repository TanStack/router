/**
 * The server-code check (R132): server-only text a planner records
 * (`rewrites.serverOnly`) never reaches an output of the compile, the
 * derived ones included. A hit fails the compile: it throws in our test
 * runs (self-checks on) and is an error for the module in users' runs.
 * Toy planners stand in for Start's: each case records one range and
 * removes it, or fails to, the way a planner bug would.
 */
import { describe, expect, it, vi } from 'vitest'
import { rangeOf } from './engine'
import {
  MemoryHost,
  dedent,
  envInfo,
  findRouteOptions,
  toySplitPlanner,
} from './helpers'
import type { PlanContext, Planner } from '../src/compiler'

const PATH = '/app/src/route.tsx'
const SECRET = `() => 'SERVER_SECRET'`
const CODE = dedent(`
  import { createFileRoute } from 'toy-router'
  import { onServer } from 'toy-start'
  const h = () => 'other'
  export const Route = createFileRoute('/')({
    component: () => onServer(${SECRET}) + onServer(h),
  })
`)
const SUBJECT = 'the toy handler'
const CHUNK = `${PATH}?tsr-split=component`

/** The server-only text: the argument of the first `onServer(…)`. */
const secret = (code: string) => rangeOf(code, SECRET)

const recording = (plan: (ctx: PlanContext) => void): Planner => ({
  name: 'toy-server-only',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    if (findRouteOptions(ctx)) {
      plan(ctx)
    }
  },
})

const record = (
  ctx: PlanContext,
  range = secret(ctx.analysis.source.code),
  placeholder?: [{ k: 'text'; parts: Array<string> }],
) =>
  ctx.rewrites.serverOnly({
    range,
    subject: SUBJECT,
    by: 'toy-server-only',
    placeholder,
  })

const CASES: Array<{
  name: string
  plan: (ctx: PlanContext) => void
  /** The output holding the text, null when none does. */
  leaksInto: string | null
}> = [
  {
    name: 'its placeholder replaces it in every output',
    plan: (ctx) => record(ctx, undefined, [{ k: 'text', parts: ['stub()'] }]),
    leaksInto: null,
  },
  {
    name: 'an edit of an enclosing range removes it',
    plan: (ctx) => {
      record(ctx)
      const call = rangeOf(ctx.analysis.source.code, `onServer(${SECRET})`)
      ctx.rewrites.edit({
        range: call,
        body: [{ k: 'text', parts: ['stub()'] }],
        by: 'toy-server-only',
      })
    },
    leaksInto: null,
  },
  {
    name: 'nothing removes it',
    plan: (ctx) => record(ctx),
    leaksInto: CHUNK,
  },
  {
    // (the split chunk renders the claimed component's text, where an
    // env-scoped placeholder does not stand)
    name: 'only the env output replaces it',
    plan: (ctx) => {
      record(ctx)
      ctx.rewrites.placeholder({
        range: secret(ctx.analysis.source.code),
        body: [{ k: 'text', parts: ['stub()'] }],
        scope: ['env'],
        by: 'toy-server-only',
      })
    },
    leaksInto: CHUNK,
  },
  {
    // a reference rendered for the output (an import, a renamed binding)
    // is server-only text as well
    name: 'a reference in it renders, rewritten',
    plan: (ctx) => {
      const code = ctx.analysis.source.code
      const h = rangeOf(code, 'onServer(h)')
      const ident = { start: h.start + 'onServer('.length, end: h.end - 1 }
      record(ctx, ident)
      const node = ctx.t1.nodeAt(ident.start)!
      const binding = ctx.analysis.file.referenceOf(node)!.binding!
      ctx.rewrites.edit({
        range: ident,
        body: [
          {
            k: 'ref',
            range: ident,
            to: { sym: ctx.symbols.ofBinding(binding) },
            ctx: 'plain',
          },
        ],
        by: 'toy-server-only',
      })
    },
    leaksInto: CHUNK,
  },
]

const compileAll = async (
  host: MemoryHost,
  planner: Planner,
): Promise<
  Array<Awaited<ReturnType<MemoryHost['compile']>> & { code: string }>
> => {
  const planners = [toySplitPlanner(), planner]
  const env = { env: envInfo({ mode: 'build' }) }
  const out = []
  for (const id of [PATH, CHUNK]) {
    out.push((await host.compile(id, planners, env))!)
  }
  return out
}

describe('the server-code check', () => {
  it.each(CASES)(
    'server-only text recorded by a planner: $name',
    async ({ plan, leaksInto }) => {
      const host = new MemoryHost({ files: { [PATH]: CODE } })
      const compiled = compileAll(host, recording(plan))
      if (leaksInto === null) {
        const outputs = await compiled
        for (const out of outputs) {
          expect(out.code).not.toContain('SERVER_SECRET')
          expect(out.diagnostics).toEqual([])
        }
      } else {
        await expect(compiled).rejects.toThrow(
          `server code in a client output: ${leaksInto} holds ${SUBJECT}`,
        )
      }
    },
  )

  // Source: R132 (an error in users' builds, where self-checks are off).
  it("fails the module in users' runs, naming the file (absolute: the host has no root), the place and the output", async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const users = await import('./helpers')
      const host = new users.MemoryHost({ files: { [PATH]: CODE } })
      const env = { env: users.envInfo({ mode: 'build' }) }
      const out = await host.compile(
        PATH,
        [users.toySplitPlanner(), recording((ctx) => record(ctx))],
        env,
      )
      expect(out!.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'server-code-in-client',
          by: 'core',
          range: secret(CODE),
          message:
            'Internal compiler error in /app/src/route.tsx: the toy handler would be included in the client output /app/src/route.tsx?tsr-split=component, so the build stops. Please report it at https://github.com/TanStack/router/issues with this file.',
        },
      ])
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
