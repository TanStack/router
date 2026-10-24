/**
 * The Vite / Rolldown survival witness and veto fixed point on real
 * production builds (DESIGN §3.14.4, R30, R33; the spike's matrix): an edge
 * is reported (and `onViolation` asked) iff it survives tree-shaking; a veto
 * gives the real module after one more pass of the environment.
 */
import { describe, expect, test } from 'vitest'
import { buildWithVite } from './hosts'
import { byName, expectVerdicts, expectVeto, vetoScenarios } from './scenarios'
import { cases } from './cases'

const timeout = 30_000

describe.concurrent('vite build: reported iff the edge survives', () => {
  test.each(cases.map((c) => [c.name, c] as const))(
    '%s',
    async (_name, c) => {
      expectVerdicts(c, await buildWithVite(c), 'vite')
    },
    timeout,
  )
})

describe.concurrent('vite build: onViolation → false', () => {
  test.each(vetoScenarios.map((s) => [s.name, s] as const))(
    '%s: the real module after one more pass, once per edge',
    async (_name, scenario) => {
      await expectVeto(buildWithVite, scenario)
    },
    timeout,
  )

  test(
    'error behaviour fails the build on a surviving edge, and not when nothing survives',
    async () => {
      const live = await buildWithVite(byName('C1a'), { behavior: 'error' })
      expect(live.error).not.toBeNull()
      expect(live.reported).toEqual(['src/entry.ts -> ./secret.server'])
      const dead = await buildWithVite(byName('C2b'), {
        behavior: 'error',
        runOutput: true,
      })
      expect([dead.error, dead.out, dead.passes]).toEqual([
        null,
        'OUT client',
        1,
      ])
    },
    timeout,
  )
})
