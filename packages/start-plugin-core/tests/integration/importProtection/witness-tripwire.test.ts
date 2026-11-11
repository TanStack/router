/**
 * Tripwire of the survival witness (design 4 §5, F5-4): import protection
 * reports an import a production build mocked when the bundler's own graph
 * says the import's mock survived tree-shaking (Rolldown's rendered exports,
 * Rspack's used exports, inner modules of a `ConcatenatedModule` included).
 * Here that structural answer is compared with the emitted text: the mock
 * of an import carries its importer's path, so it is in a chunk exactly when
 * the import was reported. Goes red when the bundler's graph changes shape
 * under the witness (a scope-hoisted module, an async chunk).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { importersIn } from './v2-hosts'

const timeout = 120_000

/** Checked importers of denied files: used, unused, an effect, and the same in an async chunk. */
const files = {
  'src/lib/a.server.ts': `export const a = () => 'MARK_A'
export const unused = 1
`,
  'src/lib/fx.server.ts': `;(globalThis as any).fx = 'MARK_FX'
export const fx = 1
`,
  'src/used.ts': `import { a } from './lib/a.server'
export const used = () => a()
`,
  'src/unused.ts': `import { unused } from './lib/a.server'
export const notUsed = () => unused
`,
  'src/effect.ts': `import './lib/fx.server'
`,
  'src/lazy.ts': `import { a } from './lib/a.server'
export const lazy = () => a()
`,
  'src/lazy-unused.ts': `import { unused } from './lib/a.server'
export const lazyNotUsed = () => unused
export const other = () => 'other'
`,
  'src/entry.ts': `import { used } from './used'
import './unused'
import './effect'
export { used }
export const loadLazy = () => import('./lazy').then((m) => m.lazy())
export const loadOther = () => import('./lazy-unused').then((m) => m.other())
`,
}

const importers = [
  'src/used.ts',
  'src/unused.ts',
  'src/effect.ts',
  'src/lazy.ts',
  'src/lazy-unused.ts',
]

/** The importer's path as a mock of its import holds it (quotes escaped or not). */
const mockOf = (importer: string) =>
  new RegExp(`\\\\?"i\\\\?":\\\\?"${importer.replace(/[.]/g, '\\.')}\\\\?"`)

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
