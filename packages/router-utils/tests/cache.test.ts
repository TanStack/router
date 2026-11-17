/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of a dev path no oracle test
 * reaches yet: an import the resolver answers external is asked again when a
 * `package.json` changes. To become a behaviour test of a dev server.
 */
import { describe, expect, it } from 'vitest'

import { MemoryHost, envInfo, staleAfter } from './helpers'
import type { Planner } from '../src/compiler'

const env = envInfo()

describe('an import the resolver answers external', () => {
  const resolving: Planner = {
    name: 'resolving',
    tier: 0,
    gate: () => true,
    plan() {},
    async prefetch(t0, ctx) {
      for (const i of t0.imports) {
        await ctx.resolve(i.specifier)
      }
    },
  }
  const modules = 20
  const setup = () => {
    const files: Record<string, string> = { '/app/package.json': '{}' }
    for (let m = 0; m < modules; m++) {
      files[`/app/m${m}.ts`] =
        `import a from 'pkg-a'\nimport b from 'pkg-b'\nexport const v = ${m}\n`
    }
    let local = false
    const host = new MemoryHost({
      files,
      // packages are external, until one of them is aliased to a project file
      resolve: (specifier) =>
        local && specifier === 'pkg-a'
          ? '/app/local-a.ts'
          : { id: specifier, external: true },
    })
    return { host, aliasToFile: () => (local = true) }
  }

  it('is asked again when a package.json changes, and reports the module it now resolves differently for', async () => {
    const { host, aliasToFile } = setup()
    host.write('/app/local-a.ts', 'export default 1\n')
    await host.compile('/app/m0.ts', [resolving], { env })
    aliasToFile()
    const res = await staleAfter(
      host.caches,
      { path: '/app/package.json', kind: 'change' },
      host,
    )
    expect(res).toEqual(['/app/m0.ts'])
  })
})
