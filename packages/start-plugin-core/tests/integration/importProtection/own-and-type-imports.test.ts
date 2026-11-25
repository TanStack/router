/**
 * A client entry's own server-only marker is a violation whatever its form
 * and whatever the host's TypeScript makes of it (SWC drops
 * `export {} from`), and an import of type specifiers only that
 * `verbatimModuleSyntax` keeps is one in a module that keeps nothing else
 * (a module of types, one whose export is inlined) (SPEC J6.4). Each case
 * built with protection on and off (off: the initializer ships), Vite and
 * Rsbuild. Beside a value import of the same file, an import of type
 * specifiers only does not silence the value import's dropped-import
 * warning.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { reportedViolations } from '../../importProtection/start-apps'
import { warningsNaming } from './dropped-imports-apps'
import { db, outcome, timeout } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> }> = [
  {
    name: 'a client entry marked by `export {} from` the server-only marker',
    files: {
      'src/client.ts': `export {} from '@tanstack/react-start/server-only'
;(globalThis as Record<string, unknown>).connected = 'MARK_DB'
`,
      'src/entry.ts': `export const read = () => 'entry'\n`,
    },
    on: ['src/client.ts'],
  },
  {
    name: 'an import of type specifiers only kept by verbatimModuleSyntax in a module of types',
    files: {
      ...db,
      'src/types.ts': `import { type User } from './db.server'\nexport type Name = User['name']\n`,
      'src/entry.ts': `import { type Name } from './types'\nexport const read = (n?: Name) => n ?? 'client'\n`,
    },
    verbatim: true,
    on: ['src/types.ts'],
  },
  {
    name: 'an import of type specifiers only kept by verbatimModuleSyntax in a module whose export is inlined',
    files: {
      ...db,
      'src/types.ts': `import { type User } from './db.server'\nexport type Name = User['name']\nexport const k = 1\n`,
      'src/entry.ts': `import { k } from './types'\nexport const read = () => k\n`,
    },
    verbatim: true,
    on: ['src/types.ts'],
  },
]

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(cases)(
    '$name: protection on and off',
    async (c) => {
      expect({
        on: await outcome(bundler, c, true),
        off: await outcome(bundler, c, false),
      }).toEqual({
        on: { failedAt: c.on, shipped: false },
        off: { failedAt: null, shipped: true },
      })
    },
    timeout,
  )
  test.each([
    { name: 'on: one warning, at the importer', enabled: true },
    { name: 'off (control): none', enabled: false },
  ])(
    'an import of type specifiers only beside an unused value import of the same file, protection $name',
    async ({ enabled }) => {
      const build = await buildStart({
        bundler,
        files: {
          'src/lib/users.server.ts': `export interface User {\n  name: string\n}\nexport const listUsers = () => 'MARK_SECRET'\n`,
          'src/entry.ts': `import { type User } from './lib/users.server'
import { listUsers } from './lib/users.server'
export const read = (u: User) => u.name
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: enabled
            ? { behavior: 'error' }
            : { enabled: false },
        },
      })
      expect(reportedViolations(build)).toEqual([])
      expect(warningsNaming(build, 'src/entry.ts')).toHaveLength(
        enabled ? 1 : 0,
      )
    },
    timeout,
  )
})
