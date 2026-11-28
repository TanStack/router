/**
 * The shapes the removed effect model judged wrong (whole-PR review,
 * VERIFY-core V-01, V-04; S6 Astra #2), decided on the mock alone (SPEC
 * J6.4): an unused re-export of a denied module builds under `behavior:
 * 'error'` whatever the module holds, with no report; nothing of the module
 * ships or runs. Vite and Rsbuild builds.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { barrelApp, outcome } from './dropped-imports-apps'

describe.each(startBundlers)('%s build', (bundler) => {
  // VERIFY-core V-01: the type-only re-export of an effectful module
  test('an unused re-export of a denied module holding a type-only re-export builds under behavior "error"', async () => {
    const build = await buildStart({
      bundler,
      files: barrelApp({
        'src/lib/db.ts': `;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
export interface Row {
  id: string
}
`,
        'src/lib/users.server.ts': `export { type Row } from './db'
export const listUsers = () => 'MARK_SECRET'
`,
      }),
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'error' } },
    })
    expect(await outcome(build)).toEqual({
      violations: [],
      shipped: [],
      read: 'client|none',
    })
  })

  // S6 (Astra #2): a JSON dependency of the denied module
  test('an unused re-export of a denied module importing JSON builds under behavior "error"', async () => {
    const build = await buildStart({
      bundler,
      files: barrelApp(
        {
          'src/lib/palette.json': `{ "primary": "MARK_SECRET" }\n`,
          'src/lib/users.server.ts': `import palette from './palette.json'
export { palette }
export const listUsers = () => 'MARK_SECRET'
`,
        },
        `export { palette } from './users.server'\n`,
      ),
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'error' } },
    })
    expect(await outcome(build)).toEqual({
      violations: [],
      shipped: [],
      read: 'client|none',
    })
  })

  // VERIFY-core V-04: effects the bundler keeps in the real module (a
  // template coercion, a JSX member tag) do not run: the client gets the
  // mock, which the bundler drops
  test.each<{ name: string; denied: Record<string, string> }>([
    {
      name: 'a template coercion',
      denied: {
        'src/lib/users.server.ts': `const o = {
  toString() {
    ;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
    return ''
  },
}
const t = \`\${o}\`
export const listUsers = () => t + 'MARK_SECRET'
`,
      },
    },
    {
      name: 'a JSX member tag',
      denied: {
        'src/lib/db.tsx': `export const Card = () => {
  ;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
  return null
}
`,
        'src/lib/users.server.tsx': `import * as db from './db'
const card = <db.Card />
export const listUsers = () => [card, 'MARK_SECRET']
`,
      },
    },
  ])(
    'an export * of a denied module with $name the client uses nothing of builds, and nothing of it runs',
    async ({ denied }) => {
      const build = await buildStart({
        bundler,
        files: barrelApp(denied, `export * from './users.server'\n`),
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
      })
      expect(await outcome(build)).toEqual({
        violations: [],
        shipped: [],
        read: 'client|none',
      })
    },
  )
})
