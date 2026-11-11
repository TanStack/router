/**
 * Rsbuild dev, files created and deleted: what the compiler keeps stays
 * within the live files. Measured through the documented stats knob
 * (TSR_COMPILER_STATS=1, read when the session starts), in a process of
 * its own (`integration-alone`).
 */
import { describe, expect, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

const timeout = 90_000
const compileTimeout = 30_000

const base = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const fnModule = (name: string) => `import { base } from '../lib/base'
export const ${name} = base.handler(async () => 'MARK_${name}')
`
const entry = (names: Array<string>) =>
  `${names.map((name) => `import { ${name} } from './gen/${name}'`).join('\n')}
console.log('entry'${names.map((name) => `, ${name}`).join('')})
`

/** The collections of the compiler's caches that are kept per path or per plan key. */
const bounded = [
  'plans',
  'restored',
  'keyPaths',
  'trackedKeys',
  'generations',
  'latest',
  'active',
  'inFlight',
  'dependentPaths',
  'dependentKeys',
  'rawFacts',
  'rawFactPaths',
  'seenPaths',
  'invalidationsRunning',
] as const

describe('Rsbuild dev: created and deleted files', () => {
  // 200 modules defining server fns are created with their import, deleted
  // while imported (the importer fails), and their import removed, 20 at a
  // time, after a first round of 20 (the modules the first server fns bring,
  // compiled once). Afterwards every collection is as small as after the
  // first round, and the stale sets are empty: each compilation took what it
  // was to build again.
  // Bug: the stale sets filled and no Rsbuild hook took them.
  // Source: F3-6a (Fable review 2026-11-10; design 3 §5).
  test(
    'keeps nothing of 200 created and deleted files, and no stale path at rest',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: { 'src/lib/base.ts': base, 'src/entry.ts': entry([]) },
      })
      const stats = (): Record<string, number> =>
        compilerStats()['start:rsbuild'] ?? {}
      expect(server.errors).toEqual([])
      let before: Record<string, number> = {}
      for (let round = 0; round <= 10; round++) {
        const names = Array.from({ length: 20 }, (_, i) => `f${round * 20 + i}`)
        await server.edit({
          ...Object.fromEntries(
            names.map((name) => [`src/gen/${name}.ts`, fnModule(name)]),
          ),
          'src/entry.ts': entry(names),
        })
        expect(server.errors).toEqual([])
        await server.edit(
          Object.fromEntries(names.map((name) => [`src/gen/${name}.ts`, null])),
        )
        expect(server.errors).not.toEqual([])
        await server.edit({ 'src/entry.ts': entry([]) })
        expect(server.errors).toEqual([])
        if (round === 0) {
          before = stats()
        }
      }
      const after = stats()
      expect({
        stalePaths: after.stalePaths ?? 0,
        staleHeld: after.staleHeld ?? 0,
      }).toEqual({ stalePaths: 0, staleHeld: 0 })
      for (const key of bounded) {
        expect(after[key] ?? 0, key).toBeLessThanOrEqual(before[key] ?? 0)
      }
    },
    timeout,
  )
})
