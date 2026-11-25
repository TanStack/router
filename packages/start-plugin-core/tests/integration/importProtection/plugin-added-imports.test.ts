/**
 * An import of a denied file another plugin adds after Start's compile (the
 * compiler never reads it) is judged by what the build keeps (SPEC J6.4): a
 * bare import in a kept module is a violation, also in a module that keeps
 * nothing else or whose export is inlined (the mock keeps it evaluated as
 * the real file would), and so is a surviving `import()` that reads nothing.
 * Each case built with protection on and off, Vite and Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { db, outcome, timeout } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> | null; off: boolean }> = [
  {
    name: 'a bare import of a denied file another plugin adds to a module that keeps nothing else',
    files: {
      ...db,
      'src/late.js': `export {}\n`,
      'src/entry.ts': `import './late.js'\nexport const read = () => 'client'\n`,
    },
    late: `import './db.server';\n`,
    on: ['src/late.js'],
    off: true,
  },
  {
    name: 'a bare import of a denied file another plugin adds to a module whose export is inlined',
    files: {
      ...db,
      'src/late.js': `export const k = 1\n`,
      'src/entry.ts': `import { k } from './late.js'\nexport const read = () => k\n`,
    },
    late: `import './db.server';\n`,
    on: ['src/late.js'],
    off: true,
  },
  {
    name: 'an import() of a denied file another plugin adds, reading nothing of it',
    files: {
      ...db,
      'src/late.js': `export const late = () => 'late'\n`,
      'src/entry.ts': `import { late } from './late.js'\nexport const read = () => late()\n`,
    },
    late: `import('./db.server').then(() => 'loaded');\n`,
    on: ['src/late.js'],
    off: true,
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
        off: { failedAt: null, shipped: c.off },
      })
    },
    timeout,
  )
})
