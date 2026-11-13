/**
 * What Start compiles in dev doesn't depend on where the app keeps Vite's
 * dependency cache (`cacheDir`): a pre-bundled dependency that uses nothing
 * of Start is no module of the compiler's, whether the cache is Vite's
 * default (`node_modules/.vite`), a directory of the app (`.vite-cache`) or
 * one outside it. Measured through the documented stats knob
 * (TSR_COMPILER_STATS=1: the plans the dev server's compiler holds) around a
 * page import of the dependency, against the same import of an app module;
 * a dependency whose text names a Start API is read in every layout.
 * This file runs in a process of its own (project `integration-alone`).
 */
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { createStartHost } from '../start-host'
import type { StartHost } from '../start-host'

const timeout = 60_000

/** A dependency without anything of Start, pre-bundled by Vite's optimizer. */
const plainLibrary = {
  'node_modules/plain-lib/package.json': JSON.stringify({
    name: 'plain-lib',
    type: 'module',
    main: './index.js',
  }),
  'node_modules/plain-lib/index.js': `export const plain = () => 'MARK_PLAIN'\n`,
  // a dependency whose text names a Start API: the compiler reads it, wherever
  // its bundle is
  'node_modules/named-lib/package.json': JSON.stringify({
    name: 'named-lib',
    type: 'module',
    main: './index.js',
  }),
  'node_modules/named-lib/index.js': `export const named = () => 'MARK_NAMED works with createIsomorphicFn'\n`,
}

const plans = () => compilerStats()['start:vite']?.plans ?? 0

/** The plans a page import of a new case adds, and what the page read. */
async function importCase(host: StartHost, module: string) {
  const before = plans()
  const c = await host.case({ 'module.tsx': module })
  const run = await c.client<string>('return module.value()')
  return { added: plans() - before, result: run.result }
}

describe.each([
  ['Vite’s default', undefined],
  ['a directory of the app', '.vite-cache'],
  ['a directory outside the app', '../outside-vite-cache'],
])('a dev server whose cacheDir is %s', (_, cacheDir) => {
  test(
    'compiles no pre-bundled dependency that does not use Start',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const host = await createStartHost({
        files: plainLibrary,
        config: {
          ...(cacheDir && { cacheDir }),
          optimizeDeps: { include: ['plain-lib', 'named-lib'] },
        },
      })
      onTestFinished(() => host.close())
      // the page itself, and the framework's own pre-bundled dependencies
      await importCase(host, `export const value = () => 'MARK_WARM'`)
      const own = await importCase(
        host,
        `export const value = () => 'MARK_OWN'`,
      )
      const plain = await importCase(
        host,
        `import { plain } from 'plain-lib'\nexport const value = plain`,
      )
      const named = await importCase(
        host,
        `import { named } from 'named-lib'\nexport const value = named`,
      )
      expect(own.result).toBe('MARK_OWN')
      expect(plain.result).toBe('MARK_PLAIN')
      // the dependency's bundle is no module of the compiler's
      expect(plain.added).toBe(own.added)
      expect(named.result).toMatch(/^MARK_NAMED/)
      expect(named.added).toBe(own.added + 1)
    },
    timeout,
  )
})
