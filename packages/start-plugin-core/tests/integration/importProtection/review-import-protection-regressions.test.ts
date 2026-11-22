/**
 * Failing regression tests for Critical & High import-protection bypasses and
 * false positives found during review of PR #8817.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { reportedViolations } from '../../importProtection/start-apps'
import type { StartBuildError } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

const buildVite = (
  files: Record<string, string>,
  importProtection: ImportProtectionOptions = {},
  extra: { packageJson?: Record<string, unknown> } = {},
) =>
  buildStart({
    bundler: 'vite',
    files,
    entry: 'src/entry.ts',
    start: { importProtection },
    ...extra,
  })

async function expectBuildFailure(
  build: Promise<unknown>,
): Promise<StartBuildError> {
  const error = await build.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'expected the client build to fail').toBeInstanceOf(Error)
  return error as StartBuildError
}

describe('PR #8817 import-protection security bypasses on Vite', () => {
  test(
    'multiple # fragments (#a#b?raw) cannot bypass a server-only marker on Vite',
    async () => {
      const error = await expectBuildFailure(
        buildVite({
          'src/secret.ts': `import '@tanstack/react-start/server-only'
export const API_KEY = 'MARK_RAW_SECRET_TEXT'
`,
          'src/entry.ts': `import raw from './secret.ts#a#b?raw'
;(globalThis as any).leaked = raw
`,
        }),
      )
      expect(reportedViolations(error).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'multiple # fragments (#a#b) cannot bypass client.files on Vite for JSON assets',
    async () => {
      const error = await expectBuildFailure(
        buildVite(
          {
            'src/secrets.server.json': `{"apiKey":"MARK_JSON_SECRET"}\n`,
            'src/entry.ts': `import data from './secrets.server.json#a#b'
;(globalThis as any).leaked = data
`,
          },
          { client: { files: ['**/*.server.json'] } },
        ),
      )
      expect(reportedViolations(error).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'bare import of a server-only marker guard module is not tree-shaken out of production builds',
    async () => {
      const error = await expectBuildFailure(
        buildVite({
          'src/lib/server-guard.ts': `import '@tanstack/react-start/server-only'\n`,
          'src/db.ts': `import './lib/server-guard'
export const API_KEY = 'MARK_GUARDED_SECRET'
`,
          'src/entry.ts': `import { API_KEY } from './db'
;(globalThis as any).key = API_KEY
`,
        }),
      )
      expect(reportedViolations(error).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'app package.json with "sideEffects": false does not disable effect detection for side-effectful .server files',
    async () => {
      const error = await expectBuildFailure(
        buildVite(
          {
            'src/init.server.ts': `;(globalThis as any).serverInit = 'MARK_SIDE_EFFECT'
export const unused = 1
`,
            'src/entry.ts': `import './init.server'
export const ok = true
`,
          },
          {},
          {
            packageJson: {
              name: 'test-app',
              type: 'module',
              sideEffects: false,
            },
          },
        ),
      )
      expect(reportedViolations(error).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'purity.ts does not classify object spread over a literal getter as side-effect-free',
    async () => {
      const error = await expectBuildFailure(
        buildVite({
          'src/trap.server.ts': `export const x = {
  ...{
    get trap() {
      ;(globalThis as any).trapRan = 'MARK_GETTER_TRAP'
      return 1
    },
  },
}
export const unused = 2
`,
          'src/barrel.ts': `export { unused } from './trap.server'
export const safe = 1
`,
          'src/entry.ts': `export { safe } from './barrel'\n`,
        }),
      )
      expect(reportedViolations(error).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'export { type Foo } from server-only marker does not falsely mark the re-exporting module as server-only',
    async () => {
      const result = await buildVite({
        'src/types.ts': `export { type ServerOnly } from '@tanstack/react-start/server-only'
export const safeValue = 'ok'
`,
        'src/entry.ts': `import { safeValue } from './types'
;(globalThis as any).v = safeValue
`,
      })
      expect(result.client.where('ok')).not.toBe('nowhere')
    },
    timeout,
  )
})
