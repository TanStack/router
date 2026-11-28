/**
 * Markers in packages on a Vite dev server and on the server side of a
 * build (node_modules policy, decisions 1 and 12):
 * - a package barrel whose other module reads `@tanstack/react-start/server`
 *   (a server-only-marked module), the client using another export: the dev
 *   server serves the entry as its mock (it does not tree-shake), the
 *   client's export works, and the entry is reported once;
 * - a package's `client-only`-marked module on the server: an export of the
 *   barrel the server does not use builds; a use fails at the barrel's
 *   import, in the server environment.
 * Source: Fable's review of the node_modules policy implementation,
 * finding 8 (`probes/p4.test.ts`, `p1` C).
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest, installPackage } from '../../package-layouts'
import {
  distinct,
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import { runViteClient, startBrowserProtectedDevServer } from './client-pages'
import type { StartBundler } from '../../build-harness'

const reqLib = installPackage('npm', {
  name: 'req-lib',
  declaration: 'peer',
  files: {
    'index.js': `export { host } from './host.js'\nexport const SAFE = 'MARK_SAFE'\n`,
    'host.js': `import { getRequestHeaders } from '@tanstack/react-start/server'\nexport const host = () => getRequestHeaders().get('host')\n`,
  },
})

describe('vite dev, the server entry behind a package barrel', () => {
  test("the client's export works, the entry is served as its mock and reported once", async () => {
    const server = await startBrowserProtectedDevServer(
      {
        ...reqLib.files,
        'package.json': JSON.stringify(appManifest([reqLib])),
        'src/entry.ts': `import { SAFE } from 'req-lib'\nexport const read = () => SAFE\n`,
      },
      { mockAccess: 'off' },
      { config: { optimizeDeps: { exclude: ['req-lib'] } } },
    )
    const { result } = await runViteClient(
      server,
      '/src/entry.ts',
      'return entry.read()',
    )
    expect(result).toBe('MARK_SAFE')
    const reported = distinct(
      reportedViolations(server).map(
        ({ environment, importer }) => `${environment} ${importer}`,
      ),
    )
    expect(reported).toHaveLength(1)
    expect(reported[0]).toMatch(/^client .*react-start\/dist\/esm\/server\.js/)
  })
})

const uiLib = installPackage('npm', {
  name: 'ui-lib',
  declaration: 'peer',
  files: {
    'index.js': `export { chart } from './chart.js'\nexport const SAFE = 'MARK_SAFE'\n`,
    'chart.js': `import '@tanstack/react-start/client-only'\nexport const chart = () => 'MARK_CHART'\n`,
  },
})

describe.each(startBundlers)(
  '%s build, a client-only package module',
  (bundler: StartBundler) => {
    const app = (use: 'SAFE' | 'chart') => ({
      bundler,
      files: {
        ...uiLib.files,
        'src/entry.ts': `export const read = () => 'MARK_CLIENT'\n`,
        'src/ssr-entry.ts': `import { ${use} } from 'ui-lib'\nexport const read = () => String(${use === 'chart' ? 'chart()' : 'SAFE'})\n`,
      },
      packageJson: appManifest([uiLib]),
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
    })

    test('the server using the marked export fails at the barrel, in the server environment', async () => {
      const error = await rejection(buildStart(app('chart')))
      const reported = reportedViolations(error)
      expect(reported).not.toEqual([])
      for (const { environment, importer } of reported) {
        expect(environment).toBe('server')
        expect(importer).toMatch(/^node_modules\/ui-lib\/index\.js:1:/)
      }
    })
  },
)
