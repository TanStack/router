/**
 * An import of a denied module that the compiler does not read (a package
 * module it does not compile, an import another plugin added) is judged by
 * what the build keeps (SPEC J6.4): a surviving `import()` that reads
 * nothing of it is a violation, and so is a bare import in a module the
 * build keeps; an importer the build drops (an unused module of a
 * `sideEffects: false` package, a package only a dead `import()` loads)
 * reports nothing, as protection off ships nothing of it. Each case built
 * with protection on and off, Vite and Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { db, dep, marked, outcome, timeout } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> | null; off: boolean }> = [
  {
    name: 'an import() of a marked file a package module writes, reading nothing of it',
    files: {
      ...dep({
        'index.js': `export const x = () => import('./marked.js').then(() => 'dep')\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: ['node_modules/dep/index.js'],
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
  {
    name: 'an unused module of a sideEffects: false package importing a marked file bare',
    files: {
      ...dep(
        {
          'index.js': `export { x } from './client.js'\nexport { y } from './server.js'\n`,
          'client.js': `export const x = () => 'dep'\n`,
          'server.js': `import './guard.js'\nexport const y = () => 'MARK_SECRET'\n`,
          'guard.js': marked,
        },
        { sideEffects: false },
      ),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: null,
    off: false,
  },
  {
    name: 'a package only a dead import() loads, importing a marked file bare',
    files: {
      ...dep({
        'index.js': `import './marked.js'\nexport const init = () => 'dep'\n`,
        'marked.js': marked,
      }),
      'src/service.ts': `export const lazy = () => import('dep')\nexport const current = () => 'client'\n`,
      'src/entry.ts': `import { current } from './service'\nexport const read = () => current()\n`,
    },
    on: null,
    off: false,
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
