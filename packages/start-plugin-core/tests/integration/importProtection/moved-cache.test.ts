/**
 * Relocation of an Rsbuild persistent cache (SPEC G4; design 4 §5, F5-5): a
 * portable cache (Rspack's `cache.portable`) written by a build of the app
 * at one path, read by a build of the same app at another path, the first
 * one gone (a moved checkout, a CI cache restored into another workspace).
 * The second build compiles correctly: an import `allowImport` allows gets
 * the real module, a denied one its mock, and it is reported. (Rspack 2.3.1
 * restores no module of the app at the new path; the test holds whether it
 * does or not.)
 */
import { mkdtempSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import path from 'node:path'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
import { expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { importersIn } from './v2-hosts'
import type { StartBuild } from '../../build-harness'

const timeout = 120_000

const files = {
  'src/lib/allowed.server.ts': `export const allowed = () => 'MARK_ALLOWED'\n`,
  'src/lib/denied.server.ts': `export const denied = () => 'MARK_DENIED'\n`,
  'src/entry.ts': `import { allowed } from './lib/allowed.server'
import { denied } from './lib/denied.server'
const text = (value: unknown) =>
  typeof value === 'string' && value.startsWith('MARK_') ? value : 'mock'
export const read = () => [text(allowed()), text(denied())]
`,
}

test(
  'rsbuild: a persistent cache moved to another path builds the app correctly',
  async () => {
    const cacheDirectory = mkdtempSync(path.join(runDirectory(), 'cache-'))
    const build = () =>
      buildStart({
        bundler: 'rsbuild',
        files,
        entry: 'src/entry.ts',
        rsbuildConfig: {
          performance: { buildCache: { cacheDirectory } },
          // (Rspack's cache of paths relative to the project)
          tools: {
            rspack: (config) => {
              if (
                typeof config.cache === 'object' &&
                config.cache.type === 'persistent'
              ) {
                config.cache.portable = true
              }
            },
          },
        },
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            allowImport: (info) => info.specifier.includes('allowed'),
          },
        },
      })
    const outcome = async (built: StartBuild) => ({
      read: (await built.client.run(`return entry.read()`)).result,
      reported: importersIn(built, 'client'),
      where: built.client.where('MARK_DENIED'),
    })
    const expected = {
      read: ['MARK_ALLOWED', 'mock'],
      reported: ['src/entry.ts'],
      where: 'nowhere',
    }
    const first = await build()
    expect(await outcome(first)).toEqual(expected)
    // the first path gone while the second build reads its cache
    const moved = `${first.root}-moved`
    await rename(first.root, moved)
    try {
      expect(await outcome(await build())).toEqual(expected)
    } finally {
      await rename(moved, first.root)
    }
  },
  timeout,
)
