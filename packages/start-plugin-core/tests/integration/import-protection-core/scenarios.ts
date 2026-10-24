/**
 * The expectations shared by the Vite and Rsbuild witness tests: the case
 * matrix (which violating edges a build reports) and the veto scenarios of
 * the spike (`onViolation` → false: the real module, to a fixed point).
 */
import { expect } from 'vitest'
import { cases } from './cases'
import type { WitnessCase } from './cases'
import type { BuildOptions, BuildOutcome } from './hosts'

export type Build = (
  c: WitnessCase,
  opts?: BuildOptions,
) => Promise<BuildOutcome>

/** Every edge with a boolean verdict reported iff expected, nothing unexpected reported, `onViolation` once per reported edge. */
export function expectVerdicts(
  c: WitnessCase,
  outcome: BuildOutcome,
  bundler: 'vite' | 'rspack',
): void {
  expect(outcome.error).toBeNull()
  const expected = { ...c.expect, ...(bundler === 'rspack' ? c.rspack : {}) }
  for (const edge of outcome.reported) {
    expect(Object.keys(expected), `unexpected report ${edge}`).toContain(edge)
  }
  const wanted = Object.entries(expected)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort()
  const unwanted = Object.entries(expected)
    .filter(([, v]) => v === false)
    .map(([k]) => k)
  expect(
    outcome.reported
      .filter((e) => !unwanted.includes(e) && expected[e] !== null)
      .sort(),
  ).toEqual(wanted)
  expect(outcome.reported.filter((e) => unwanted.includes(e))).toEqual([])
  // exactly once per surviving edge, never for a dead one
  expect([...outcome.calls].sort()).toEqual([...outcome.reported].sort())
}

export const byName = (name: string): WitnessCase =>
  cases.find((c) => c.name.startsWith(name))!

export const vetoScenarios = [
  {
    name: 'C1a',
    veto: ['src/entry.ts -> ./secret.server'],
    calls: ['src/entry.ts -> ./secret.server'],
    reported: [],
    out: 'OUT MARK_SECRET',
  },
  {
    // the vetoed denied module is real; its own denied import is judged in the next pass
    name: 'C9',
    veto: ['src/entry.ts -> ./secret.server'],
    calls: [
      'src/entry.ts -> ./secret.server',
      'src/secret.server.ts -> ./inner.server',
    ],
    reported: ['src/secret.server.ts -> ./inner.server'],
    out: 'OUT MARK_SECRET[import-protection mock]',
  },
  {
    // a live binding stays live through the allowed edge module
    name: 'S1',
    veto: ['src/entry.ts -> ./counter.server'],
    calls: ['src/entry.ts -> ./counter.server'],
    reported: [],
    out: 'OUT 1',
  },
  {
    // a cycle entered at the target: no TDZ through the allowed edge module
    name: 'S2',
    veto: ['src/a.ts -> ./secret.server'],
    calls: ['src/a.ts -> ./secret.server'],
    reported: [],
    out: 'OUT MARK_SECRET',
  },
] as const

export async function expectVeto(
  build: Build,
  scenario: (typeof vetoScenarios)[number],
): Promise<void> {
  const outcome = await build(byName(scenario.name), {
    veto: [...scenario.veto],
    runOutput: true,
  })
  expect({
    error: outcome.error,
    passes: outcome.passes,
    calls: outcome.calls,
    reported: outcome.reported,
    out: outcome.out,
  }).toEqual({
    error: null,
    passes: 2,
    calls: [...scenario.calls],
    reported: [...scenario.reported],
    out: scenario.out,
  })
}
