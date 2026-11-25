/**
 * A build decides a violation on the mock alone (SPEC J6.4): an import is a
 * violation when its mock survives tree-shaking, whatever the denied module
 * itself would do; a bare import (`import './x.server'`) is one wherever its
 * importer is evaluated. A denied module the client graph imports whose mocks
 * all were dropped is no violation (no `onViolation`, no failure under
 * `behavior: 'error'`): the build warns once per denied module, naming it and
 * an importer, and nothing of it ships. Dev reports every mock it serves, so
 * it reports such an import once, as a violation. Vite and Rsbuild builds,
 * Vite dev. The shapes the removed effect model judged wrong:
 * `dropped-imports-shapes.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  rejection,
  reportedViolations,
  startProtectedDevServer,
} from '../../importProtection/start-apps'
import {
  barrelApp,
  effectful,
  outcome,
  timeout,
  warningsNaming,
} from './dropped-imports-apps'

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'an unused re-export of a denied module with a top-level effect builds under behavior "error", warns once naming the module, and ships nothing of it',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...barrelApp(effectful),
          // a second importer whose mock is dropped too: still one warning
          'src/lib/admin.ts': `export { listUsers as listAdmins } from './users.server'\nexport const title = () => 'admin'\n`,
          'src/entry.ts': `import { label } from './lib'
import { title } from './lib/admin'
export const read = () => [label(), title(), (globalThis as Record<string, unknown>).connected ?? 'none'].join('|')
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
      })
      expect(await outcome(build)).toEqual({
        violations: [],
        shipped: [],
        read: 'client|admin|none',
      })
      expect(warningsNaming(build, 'src/lib/users.server.ts')).toHaveLength(1)
    },
    timeout,
  )

  test(
    'a bare import of a denied module without effects fails the build, at the importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/lib/setup.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
            'src/entry.ts': `import './lib/setup.server'\nexport const read = () => 'client'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/entry\.ts/),
        },
      ])
    },
    timeout,
  )

  test(
    'a denied module one importer uses and another drops is reported once, as the violation',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...barrelApp(effectful),
          'src/entry.ts': `import { label } from './lib'
import { listUsers } from './lib/users.server'
export const read = () => [label(), listUsers()].join('|')
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
      })
      expect(reportedViolations(build)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/entry\.ts/),
        },
      ])
      expect(warningsNaming(build, 'src/lib/index.ts')).toEqual([])
    },
    timeout,
  )
})

test(
  'vite dev: an unused re-export of a denied module is reported once, as the violation of its importer',
  async () => {
    const server = await startProtectedDevServer(barrelApp(effectful))
    await server.load('/src/entry.ts')
    expect(reportedViolations(server)).toEqual([
      {
        environment: 'client',
        importer: expect.stringMatching(/^src\/lib\/index\.ts/),
      },
    ])
  },
  timeout,
)
