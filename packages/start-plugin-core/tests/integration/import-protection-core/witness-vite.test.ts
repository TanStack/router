/**
 * The Vite / Rolldown survival witness and veto fixed point on real
 * production builds (the matrix of `cases.ts`): an edge
 * is reported (and `onViolation` told) iff it survives tree-shaking; an allowed
 * import gets the real module.
 */
import { describe, expect, test } from 'vitest'
import { buildWithVite } from './hosts'
import {
  allowScenarios,
  byName,
  expectAllow,
  expectVerdicts,
} from './scenarios'
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

describe.concurrent('vite build: allowImport → true', () => {
  test.each(allowScenarios.map((s) => [s.name, s] as const))(
    '%s: the real module, reported once per other edge',
    async (_name, scenario) => {
      await expectAllow(buildWithVite, scenario)
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
      expect([dead.error, dead.out]).toEqual([null, 'OUT client'])
    },
    timeout,
  )
})
