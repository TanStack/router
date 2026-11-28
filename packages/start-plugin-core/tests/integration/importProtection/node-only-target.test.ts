/**
 * A denied file whose own import the environment cannot resolve (a package
 * with only `node` exports, on the client): the normal denial, live or dead,
 * and no resolver error from reading what the mock of the denied file must be.
 */
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import {
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'

const timeout = 60_000

const nodeOnly = {
  'node_modules/node-only-pkg/package.json': JSON.stringify({
    name: 'node-only-pkg',
    version: '1.0.0',
    type: 'module',
    exports: { node: './i.js' },
  }),
  'node_modules/node-only-pkg/i.js': `export const db = () => 'x'\n`,
  'src/s.server.ts': `import { db } from 'node-only-pkg'
export const secret = () => db() + 'MARK_SECRET'
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a live edge to a denied file importing a node-only package fails with the denial',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...nodeOnly,
            'src/entry.ts': `import { secret } from './s.server'
export const read = () => secret()
`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(
        reportedViolations(error).map(({ environment }) => environment),
      ).toContain('client')
      expect(String(error.message)).not.toMatch(/Errored while resolving/)
    },
    timeout,
  )

  test(
    'a dead edge to a denied file importing a node-only package builds, with no report',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...nodeOnly,
          'src/barrel.ts': `export { secret } from './s.server'
export const safe = () => 'MARK_SAFE'
`,
          'src/entry.ts': `export { safe } from './barrel'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(reportedViolations(build)).toEqual([])
      expect(
        findDiagnostics(build.diagnostics, { file: 'src/s.server.ts' }),
      ).toEqual([])
      expect(build.client.where('MARK_SECRET')).toBe('nowhere')
    },
    timeout,
  )
})
