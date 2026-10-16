/**
 * Import protection in a real Start build (Vite and Rsbuild): what survives
 * into the client bundle is reported, and invalid markers fail the build.
 * Import protection checks the modules of the source directory (`src`).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

/**
 * Start's import protection options of a build that fails on a violation,
 * denying `files` to the client.
 */
function importProtection(files: Array<string> = []) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

describe.each(startBundlers)('%s build', (bundler) => {
  // A denied pure re-export barrel whose export the client uses survives
  // into the client bundle (as the code it re-exports), so it must be
  // reported.
  // Source: issue #8102 (closed without a reproduction: Rolldown may elide
  // the barrel from `chunk.modules`); gap IP6b (gaps/start-env.md).
  test('a denied re-export barrel the client uses fails the build', async () => {
    await expect(
      buildStart({
        bundler,
        files: {
          'src/secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
          'src/barrel.ts': `export { secret } from './secret'\n`,
          'src/entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
        },
        entry: 'src/entry.ts',
        start: importProtection(['**/barrel.ts']),
      }),
    ).rejects.toThrow(/Import denied in client environment/)
  }, 60_000)

  // Source: gap IP5 (gaps/start-env.md).
  test('a file with both a server-only and a client-only marker fails the build', async () => {
    await expect(
      buildStart({
        bundler,
        files: {
          'src/both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const value = 1
`,
          'src/entry.ts': `import { value } from './both'\nexport const read = () => value\n`,
        },
        entry: 'src/entry.ts',
        start: importProtection(),
      }),
    ).rejects.toThrow(/has both server-only and client-only markers/)
  }, 60_000)
})
