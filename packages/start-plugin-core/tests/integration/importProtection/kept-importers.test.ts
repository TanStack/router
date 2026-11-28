/**
 * An import of a denied module that a package module the compiler does not
 * compile writes is judged by what the final client bundle holds (SPEC
 * J6.4): the file is mocked under its own id, and its mock runs under the
 * package's own `sideEffects`, so a surviving `import()` that reads nothing
 * of it is a violation (in a chunk of its own or folded into its importer's);
 * an importer the build drops (an unused module of a `sideEffects: false`
 * package, a package only a dead `import()` loads) reports nothing, as
 * protection off ships nothing of it. So does a bare import the bundler
 * drops in a used module of a `sideEffects: false` package; an unused
 * import in a package module that runs is a violation (its mock runs, as
 * the file does with protection off). Each case built with protection on
 * and off, Vite and Rsbuild, every case a directory of one app per
 * protection state (`outcomesOfCases`).
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import {
  dep,
  inCase,
  marked,
  outcomesOfCases,
  timeout,
} from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> | null; off: boolean }> = [
  {
    name: 'an import() of a marked file a package module also re-exports unused, reading nothing of it',
    files: {
      ...dep({
        'index.js': `export { secret } from './marked.js'\nexport const load = () => import('./marked.js').then(() => 'loaded')\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { load } from 'dep'\nexport const read = () => load()\n`,
    },
    on: ['node_modules/dep/index.js'],
    off: true,
  },
  {
    name: 'an import() of a marked file a package module writes, reading nothing of it',
    files: {
      ...dep({
        'index.js': `export const x = () => import('./marked.js').then(() => 'dep')\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: ['node_modules/dep/index.js'],
    off: true,
  },
  {
    name: 'an unused module of a sideEffects: false package importing a marked file bare',
    files: {
      ...dep(
        {
          'index.js': `export { x } from './client.js'\nexport { y } from './server.js'\n`,
          'client.js': `export const x = () => 'dep'\n`,
          'server.js': `import './guard.js'\nexport const y = () => 'MARK_SECRET'\n`,
          'guard.js': marked,
        },
        { sideEffects: false },
      ),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: null,
    off: false,
  },
  {
    name: 'a package only a dead import() loads, importing a marked file bare',
    files: {
      ...dep({
        'index.js': `import './marked.js'\nexport const init = () => 'dep'\n`,
        'marked.js': marked,
      }),
      'src/service.ts': `export const lazy = () => import('dep')\nexport const current = () => 'client'\n`,
      'src/entry.ts': `import { current } from './service'\nexport const read = () => current()\n`,
    },
    on: null,
    off: false,
  },
  {
    name: 'a used module of a sideEffects: false package importing a marked file bare',
    files: {
      ...dep(
        {
          'index.js': `export { x } from './client.js'\n`,
          'client.js': `import './guard.js'\nexport const x = () => 'dep'\n`,
          'guard.js': marked,
        },
        { sideEffects: false },
      ),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: null,
    off: false,
  },
  {
    name: 'an unused import of a marked file in a package module that runs',
    files: {
      ...dep({
        'index.js': `import { secret } from './marked.js'\nexport const x = () => 'dep'\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: ['node_modules/dep/index.js'],
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
    timeout,
  )

  // (a build's failure is the whole app's: the refusing cases' app fails
  // with exactly their client importers, each once, and nothing on the
  // server: the complete list, duplicates kept)
  test(
    "the refusing cases' error-mode build fails with their importers, and no other",
    async () => {
      expect(
        (await (outcomes ??= outcomesOfCases(bundler, cases))).refused,
      ).toEqual(
        cases
          .flatMap(({ name, on }) =>
            (on ?? []).map((file) => `client ${inCase(name, file)}`),
          )
          .sort(),
      )
    },
    timeout,
  )
})
