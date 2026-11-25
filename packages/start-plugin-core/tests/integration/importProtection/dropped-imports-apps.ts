/**
 * The apps of `dropped-imports.test.ts` and `dropped-imports-shapes.test.ts`:
 * a barrel the client uses one export of, re-exporting a denied module, and
 * what a build of one shipped, ran and reported.
 */
import { reportedViolations } from '../../importProtection/start-apps'
import type { StartBuild } from '../../build-harness'

export const timeout = 60_000

/** A barrel the client uses `label` of, re-exporting `reexport` (a statement of `src/lib/users.server.ts`). */
export const barrelApp = (
  denied: Record<string, string>,
  reexport = `export { listUsers } from './users.server'\n`,
) => ({
  ...denied,
  'src/lib/index.ts': `${reexport}export const label = () => 'client'\n`,
  'src/entry.ts': `import { label } from './lib'
export const read = () => [label(), (globalThis as Record<string, unknown>).connected ?? 'none'].join('|')
`,
})

/** The denied module with a top-level effect: a call of an imported function. */
export const effectful = {
  'src/lib/db.ts': `export const connect = () => {
  ;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
}
`,
  'src/lib/users.server.ts': `import { connect } from './db'
connect()
export const listUsers = () => 'MARK_SECRET'
`,
}

/** What the client build shipped and ran, and what it reported. */
export async function outcome(build: StartBuild) {
  return {
    violations: reportedViolations(build),
    shipped: ['MARK_SECRET', 'MARK_DB'].filter(
      (mark) => build.client.where(mark) !== 'nowhere',
    ),
    read: (await build.client.run(`return entry.read()`)).result,
  }
}
