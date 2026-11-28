/**
 * An import of a denied file another plugin adds after Start's compile (the
 * compiler never reads it) is judged by what the build keeps (SPEC J6.4): a
 * bare import in a kept module is a violation, also in a module that keeps
 * nothing else or whose export is inlined (the mock keeps it evaluated as
 * the real file would), and so is a surviving `import()` that reads nothing.
 * Each case built with protection on (error and mock mode) and off, Vite
 * and Rsbuild, every case a directory of one app per protection state
 * (`outcomesOfCases`).
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { db, inCase, outcomesOfCases } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> | null; off: boolean }> = [
  {
    name: 'a bare import of a denied file another plugin adds to a module that keeps nothing else',
    files: {
      ...db,
      'src/late.js': `export {}\n`,
      'src/entry.ts': `import './late.js'\nexport const read = () => 'client'\n`,
    },
    late: `import './db.server';\n`,
    on: ['src/late.js'],
    off: true,
  },
  {
    name: 'a bare import of a denied file another plugin adds to a module whose export is inlined',
    files: {
      ...db,
      'src/late.js': `export const k = 1\n`,
      'src/entry.ts': `import { k } from './late.js'\nexport const read = () => k\n`,
    },
    late: `import './db.server';\n`,
    on: ['src/late.js'],
    off: true,
  },
  {
    name: 'an import() of a denied file another plugin adds, reading nothing of it',
    files: {
      ...db,
      'src/late.js': `export const late = () => 'late'\n`,
      'src/entry.ts': `import { late } from './late.js'\nexport const read = () => late()\n`,
    },
    late: `import('./db.server').then(() => 'loaded');\n`,
    on: ['src/late.js'],
    off: true,
  },
]

describe.each(startBundlers)('%s build', (bundler) => {
  // (every case in one app per protection state: `outcomesOfCases`)
  let outcomes: ReturnType<typeof outcomesOfCases> | undefined
  test.each(cases.map((c, i) => ({ ...c, i })))(
    '$name: protection on and off',
    async ({ i, name, on, off }) => {
      const outcome = (await (outcomes ??= outcomesOfCases(bundler, cases))).of(
        i,
      )
      const expectedOn = on?.map((file) => inCase(name, file)) ?? null
      expect({
        on: { failedAt: outcome.failedAt, shipped: outcome.mocked.shipped },
        mockReported: outcome.mocked.reported,
        off: { shipped: outcome.offShipped },
      }).toEqual({
        on: { failedAt: expectedOn, shipped: false },
        mockReported: expectedOn ?? [],
        off: { shipped: off },
      })
    },
  )

  // (a build's failure is the whole app's: the refusing cases' app fails
  // with exactly their client importers, each once, and nothing on the
  // server: the complete list, duplicates kept)
  test("the refusing cases' error-mode build fails with their importers, and no other", async () => {
    expect(
      (await (outcomes ??= outcomesOfCases(bundler, cases))).refused,
    ).toEqual(
      cases
        .flatMap(({ name, on }) =>
          (on ?? []).map((file) => `client ${inCase(name, file)}`),
        )
        .sort(),
    )
  })
})
