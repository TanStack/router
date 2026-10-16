/**
 * Import protection in a real Start build (Vite): what survives into the
 * client bundle is reported, and invalid markers fail the build.
 */
import { expect, test } from 'vitest'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import { buildStart } from '../build-harness'
import type { ImportProtectionPluginOptions } from '../../src/vite/import-protection-plugin/types'

/**
 * The import protection plugin of a Start build that fails on a violation,
 * denying `files` to the client.
 */
function importProtection(files: Array<string> = []) {
  const getConfig = () => ({
    startConfig: { importProtection: { behavior: 'error', client: { files } } },
    resolvedStartConfig: { srcDirectory: '' },
  })
  return importProtectionPlugin({
    getConfig:
      getConfig as unknown as ImportProtectionPluginOptions['getConfig'],
    framework: 'react',
    environments: [
      { name: 'client', type: 'client' },
      { name: 'ssr', type: 'server' },
    ],
    providerEnvName: 'ssr',
  })
}

// A denied pure re-export barrel whose export the client uses survives into
// the client bundle (as the code it re-exports), so it must be reported.
// Source: issue #8102 (closed without a reproduction: Rolldown may elide the
// barrel from `chunk.modules`); gap IP6b (gaps/start-env.md).
test('a denied re-export barrel the client uses fails the build', async () => {
  await expect(
    buildStart({
      files: {
        'secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
        'barrel.ts': `export { secret } from './secret'\n`,
        'entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
      },
      plugins: [importProtection(['**/barrel.ts'])],
    }),
  ).rejects.toThrow(/Import denied in client environment/)
}, 60_000)

// Source: gap IP5 (gaps/start-env.md).
test('a file with both a server-only and a client-only marker fails the build', async () => {
  await expect(
    buildStart({
      files: {
        'both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const value = 1
`,
        'entry.ts': `import { value } from './both'\nexport const read = () => value\n`,
      },
      plugins: [importProtection()],
    }),
  ).rejects.toThrow(/has both server-only and client-only markers/)
}, 60_000)
