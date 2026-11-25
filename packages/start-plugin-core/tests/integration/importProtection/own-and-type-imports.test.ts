/**
 * A client entry's own server-only marker is a violation whatever its form
 * and whatever the host's TypeScript makes of it (SWC drops
 * `export {} from`), and an import of type specifiers only that
 * `verbatimModuleSyntax` keeps is one in a module that keeps nothing else
 * (a module of types, one whose export is inlined) (SPEC J6.4). Each case
 * built with protection on and off (off: the initializer ships), Vite and
 * Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { db, outcome, timeout } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'
import type { StartBundler } from '../../build-harness'

const cases: Array<
  KeptCase & {
    on: Array<string> | null | Record<StartBundler, Array<string> | null>
    off?: Record<StartBundler, boolean>
  }
> = [
  {
    // (Oxc drops it whatever verbatimModuleSyntax says; SWC keeps
    // `export {} from`)
    name: 'a re-export of type names only kept by verbatimModuleSyntax in a module whose export is inlined',
    files: {
      ...db,
      'src/types.ts': `export { type User } from './db.server'\nexport const label = 'l'\n`,
      'src/entry.ts': `import { label } from './types'\nexport const read = () => label\n`,
    },
    verbatim: true,
    on: { vite: null, rsbuild: ['src/types.ts'] },
    off: { vite: false, rsbuild: true },
  },
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
        on: {
          failedAt: c.on === null || Array.isArray(c.on) ? c.on : c.on[bundler],
          shipped: false,
        },
        off: { failedAt: null, shipped: c.off?.[bundler] ?? true },
      })
    },
    timeout,
  )
})
