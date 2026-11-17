/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of two paths no oracle test
 * reaches yet: a planner's lazy module (Start's handler module) whose region
 * is a function passed to a call, and a destructured binding that only a call
 * every output erases reads, inside a split option. To become behaviour tests
 * of start-plugin-core and router-plugin.
 */
import { describe, expect, it } from 'vitest'
import {
  MemoryHost,
  compileLog,
  dedent,
  envInfo,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'
import type { EnvInfo, Planner } from '../src/compiler'

// every compile of this file is logged: the last test reads their reports
compileLog.enabled = true

async function split(
  code: string,
  opts: {
    keys?: Array<string>
    groups?: Array<Array<string>>
    env?: 'client' | 'server'
    identifierEdits?: boolean
    imported?: Array<string>
    files?: Record<string, string>
    mode?: 'build' | 'dev'
  } = {},
) {
  const host = new MemoryHost({
    files: { '/app/route.tsx': code, ...opts.files },
  })
  const planners = [
    toyEnvPlanner(),
    toySplitPlanner({
      keys: opts.keys,
      groups: opts.groups,
      identifierEdits: opts.identifierEdits,
      imported: opts.imported,
    }),
  ]
  const env = envInfo({
    ...(opts.env === 'server' && { name: 'ssr', type: 'server' }),
    ...(opts.mode !== undefined && { mode: opts.mode }),
  })
  const main = await host.compile('/app/route.tsx', planners, { env })
  const chunks: Record<string, string> = {}
  const chunkKeys = new Set(
    (opts.keys ?? ['component']).map(
      (key) => opts.groups?.find((g) => g.includes(key))?.join('---') ?? key,
    ),
  )
  for (const key of chunkKeys) {
    const c = await host.compile(`/app/route.tsx?tsr-split=${key}`, planners, {
      env,
    })
    chunks[key] = c?.code ?? ''
  }
  return { host, env: main?.code ?? '', chunks, main }
}

describe('a declaration only a chunk reads moves with its initialiser', () => {
  it('drops a destructured binding only a call every output erases reads inside a split option, with the import its default reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { secret } from './db'
      const { picked = secret(), kept } = source
      export const k = kept
      export const Route = createFileRoute('/')({
        component: () => wrapServer(() => picked),
      })
    `)
    const r = await split(code, {
      files: { '/app/db.ts': `export const secret = () => 's'\n` },
    })
    expect(r.env).toContain('const { kept } = source')
    expect(r.env).not.toContain('secret')
    expect(r.chunks.component).not.toContain('secret')
  })
})

// What a function a declaration or an option value holds, passes to a call
// or calls at load does decides nothing: placement reads names, references
// and assignments. Source: review of 2026-11-10, F1 (F1-1,
// F1-2, F1-3a, F1-5a, Q2).
describe('functions held, passed or called at load', () => {
  const files = {
    '/app/lib.ts':
      'export const open = () => ({})\nexport const wrap = (x: unknown) => x\nexport const define = (x: unknown) => x\nexport const f = (x: unknown) => x\n',
  }
  async function compile(
    code: string,
    planners: Array<Planner> = [toySplitPlanner()],
    env: EnvInfo = envInfo({ mode: 'build' }),
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code, ...files } })
    const main = await host.compile('/app/route.tsx', planners, { env })
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      { env },
    )
    return {
      main,
      env: main?.code ?? '',
      chunk: chunk?.code ?? '',
    }
  }

  // a custom region in an exported declaration's call argument (a server
  // fn's handler) falls back for nothing
  it.each([['a function passed to a call', '() => String(n)', false]])(
    'reports no fallback for a custom region that is %s',
    async (_, argument, reason) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { f } from './lib'
        let n = 0
        export function inc() { n++ }
        export const job = f(${argument})
        export const Route = createFileRoute('/')({ component: () => null })
      `)
      const region: Planner = {
        name: 'toy-region',
        tier: 1,
        gate: () => true,
        plan(ctx) {
          const start = ctx.analysis.source.code.indexOf(argument)
          const range = { start, end: start + argument.length }
          ctx.region(range, 'custom')
          ctx.setFacts('toy-region', {
            fallback: ctx.fallbackAt(range) !== undefined,
          })
        },
      }
      const r = await compile(code, [toySplitPlanner(), region])
      expect(r.main?.facts.planners['toy-region']).toEqual({
        fallback: reason,
      })
    },
  )
})
