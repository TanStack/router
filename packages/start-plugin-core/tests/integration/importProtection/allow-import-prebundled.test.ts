/**
 * Vite dev: an import of a denied specifier that `allowImport` allows, of a
 * dependency Vite's optimizer pre-bundles (a CommonJS package): the client
 * gets the dependency as every other importer does, through its pre-bundled
 * module (SPEC J6.1; docs: guide/import-protection.md, `allowImport`).
 * Source: review round 3 (R3-G6-3).
 */
import { expect, test } from 'vitest'
import { runViteClient, startBrowserProtectedDevServer } from './client-pages'

const timeout = 60_000

test(
  'an allowed import of a pre-bundled CommonJS dependency gets its exports',
  async () => {
    const server = await startBrowserProtectedDevServer(
      {
        'node_modules/some-lib/package.json': JSON.stringify({
          name: 'some-lib',
          main: './index.js',
        }),
        'node_modules/some-lib/index.js': `exports.track = () => 'MARK_TRACK'\n`,
        'src/lib/analytics.ts': `import { track } from 'some-lib'
export const read = () => track()
`,
        'src/entry.ts': `export { read } from './lib/analytics'\n`,
      },
      {
        client: { specifiers: ['some-lib'] },
        allowImport: (info) => info.importer.endsWith('/src/lib/analytics.ts'),
      },
    )
    const { result } = await runViteClient(
      server,
      '/src/entry.ts',
      'return String(entry.read())',
    )
    expect(result).toBe('MARK_TRACK')
  },
  timeout,
)
