/**
 * Assumption test (no tripwire: R136 superseded, "Assumption tests",
 * 2026-11-13). The assumption: a bundler's own graph after tree-shaking
 * tells whether a module survived (Rolldown's rendered exports, Rspack's
 * used exports, inner modules of a `ConcatenatedModule` included), which
 * neither bundler documents as a contract. The code relying on it: import
 * protection's survival witness (start-plugin-core `import-protection/
 * witness.ts`, design 4 §5, F5-4), which reports an import a production
 * build mocked when the mock survived. Here that structural answer is
 * compared with the emitted text: each importer imports a denied file of
 * its own, and a production mock carries its denied file's path, so it is
 * in a chunk exactly when the import was reported.
 * Fails when the bundler's graph changes shape under the witness (a
 * scope-hoisted module, an async chunk). No upstream issue.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { importersIn } from './hosts'

const timeout = 120_000

/** The denied file of an importer: `src/lib/<name>.server.ts`. */
const deniedA = `export const a = () => 'MARK_A'
export const unused = 1
`

/**
 * Checked importers of denied files: used, unused, an effect, and the same
 * in an async chunk; and an unused import of a denied file another importer
 * uses (`src/unused-shared.ts`: the witness answers per import, not per
 * denied file; the text cannot tell its mock from `src/used.ts`'s).
 */
const files = {
  'src/lib/used.server.ts': deniedA,
  'src/lib/unused.server.ts': deniedA,
  'src/lib/lazy.server.ts': deniedA,
  'src/lib/lazy-unused.server.ts': deniedA,
  'src/lib/effect.server.ts': `;(globalThis as any).fx = 'MARK_FX'
export const fx = 1
`,
  'src/used.ts': `import { a } from './lib/used.server'
export const used = () => a()
`,
  'src/unused.ts': `import { unused } from './lib/unused.server'
export const notUsed = () => unused
`,
  'src/unused-shared.ts': `import { unused } from './lib/used.server'
export const notUsed = () => unused
`,
  'src/effect.ts': `import './lib/effect.server'
`,
  'src/lazy.ts': `import { a } from './lib/lazy.server'
export const lazy = () => a()
`,
  'src/lazy-unused.ts': `import { unused } from './lib/lazy-unused.server'
export const lazyNotUsed = () => unused
export const other = () => 'other'
`,
  'src/entry.ts': `import { used } from './used'
import './unused'
import './unused-shared'
import './effect'
export { used }
export const loadLazy = () => import('./lazy').then((m) => m.lazy())
export const loadOther = () => import('./lazy-unused').then((m) => m.other())
`,
}

/** The importers of a denied file of their own, told apart in the text. */
const importers = [
  'src/used.ts',
  'src/unused.ts',
  'src/effect.ts',
  'src/lazy.ts',
  'src/lazy-unused.ts',
]

/** The importer's denied file as a mock of its import holds it: the path, quoted. */
const mockOf = (importer: string) =>
  new RegExp(
    `["'\`]${importer.replace(/^src\/(.*)\.ts$/, 'src/lib/$1.server.ts').replace(/[.]/g, '\\.')}["'\`]`,
  )

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    "a mock is in the output exactly when the bundler's graph says it survived",
    async () => {
      const build = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
      })
      const reported = importersIn(build, 'client')
      const inText = importers.filter(
        (importer) => build.client.where(mockOf(importer)) !== 'nowhere',
      )
      const survived = ['src/effect.ts', 'src/lazy.ts', 'src/used.ts']
      expect({ reported, inText: inText.sort() }).toEqual({
        reported: survived,
        inText: survived,
      })
    },
    timeout,
  )
})
