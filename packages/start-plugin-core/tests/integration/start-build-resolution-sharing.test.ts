/**
 * How often the Start compiler asks the bundler to resolve an import for its
 * analysis: a barrel's re-exports are resolved once per environment, however
 * many modules import from the barrel. The value analysis of every module
 * that imports from a barrel follows the barrel's `export *` chain; an app
 * importing a workspace UI kit from a thousand modules would otherwise have
 * the kit's chain resolved a thousand times per environment (measured at
 * +10% build time and +15% peak memory on a monorepo). Counted through
 * Vite's own `resolveId` hook: a `pre` plugin sees every resolution, the
 * bundler's own for the module graph (once per edge and environment) and the
 * compiler's (`this.resolve`).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 60_000

const groups = ['atoms', 'molecules', 'organisms']
const pages = Array.from({ length: 8 }, (_, i) => `page${i}`)

/** `src/kit.ts` re-exports three groups of two leaves; every page imports `make` from the kit. */
function barrelApp(): Record<string, string> {
  const files: Record<string, string> = {
    'src/kit.ts': groups.map((g) => `export * from './${g}'\n`).join(''),
  }
  for (const g of groups) {
    files[`src/${g}.ts`] =
      `export * from './${g}/a'\nexport * from './${g}/b'\n`
    files[`src/${g}/a.ts`] = `export const ${g}A = () => '${g}A'\n`
    files[`src/${g}/b.ts`] =
      g === 'organisms'
        ? `export const make = () => 'MARK_MADE'\n`
        : `export const ${g}B = () => '${g}B'\n`
  }
  for (const [i, page] of pages.entries()) {
    files[`src/${page}.ts`] =
      `import { make } from './kit'\nexport const ${page} = () => make() + ${i}\n`
  }
  files['src/entry.ts'] =
    pages.map((page) => `import { ${page} } from './${page}'\n`).join('') +
    `export const run = () => [${pages.map((page) => `${page}()`).join(', ')}].join(',')\n`
  return files
}

/** The barrel's re-export edges, `importer specifier`. */
const barrelEdges = [
  ...groups.map((g) => `src/kit.ts ./${g}`),
  ...groups.flatMap((g) => [`src/${g}.ts ./${g}/a`, `src/${g}.ts ./${g}/b`]),
]

/** Counts every resolution of a project module's import: `env importer specifier` → times asked. */
function countResolutions(counts: Map<string, number>): Plugin {
  return {
    name: 'test-count-resolutions',
    enforce: 'pre',
    resolveId(source, importer) {
      const at = importer?.indexOf('/src/') ?? -1
      if (importer && at >= 0 && source.startsWith('.')) {
        const key = `${this.environment.name} ${importer.slice(at + 1)} ${source}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      return null
    },
  }
}

describe('resolutions for the analysis (Vite)', () => {
  test(
    "a barrel's re-exports are resolved once per environment, however many modules import from it",
    async () => {
      const counts = new Map<string, number>()
      const build = await buildStart({
        files: barrelApp(),
        entry: 'src/entry.ts',
        viteConfig: { plugins: [countResolutions(counts)] },
      })
      const ran = (await build.client.run('return entry.run()')).result
      expect(ran).toBe(pages.map((_, i) => `MARK_MADE${i}`).join(','))
      for (const env of ['client', 'ssr']) {
        // the pages were analysed in this environment (their own import was asked)
        for (const page of pages) {
          expect(counts.get(`${env} src/${page}.ts ./kit`)).toBeGreaterThan(0)
        }
        // each edge of the chain: once by the bundler for its module graph,
        // at most once more by the compiler, shared by the eight pages
        // (without sharing: once per page, 10 for the kit's first group)
        for (const edge of barrelEdges) {
          const key = `${env} ${edge}`
          expect(counts.get(key), key).toBeDefined()
          expect(counts.get(key), key).toBeLessThanOrEqual(2)
        }
      }
    },
    timeout,
  )
})
