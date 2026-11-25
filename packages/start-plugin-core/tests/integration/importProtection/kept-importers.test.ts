/**
 * An import of a denied module that a package module the compiler does not
 * compile writes is judged by
 * what the build keeps (SPEC J6.4): a surviving `import()` that reads
 * nothing of it is a violation (in a chunk of its own or folded into its
 * importer's), and so is a bare import in a module the build keeps (also one
 * that keeps nothing else, and one of a `sideEffects: false` package, whose
 * bare import the bundler drops); an importer the build drops (an unused
 * module of a `sideEffects: false` package, a package only a dead `import()`
 * loads) reports nothing, as protection off ships nothing of it. Each case built
 * with protection on and off, Vite and Rsbuild.
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../../build-harness'
import { dep, marked, outcome, timeout } from './kept-importer-cases'
import type { KeptCase } from './kept-importer-cases'

const cases: Array<KeptCase & { on: Array<string> | null; off: boolean }> = [
  {
    name: 'a kept module of a sideEffects: false package importing a marked file bare',
    files: {
      ...dep(
        {
          'index.js': `import './guard.js'\nexport const x = () => globalThis.q ?? 'dep'\n`,
          'guard.js': marked,
        },
        { sideEffects: false },
      ),
      'src/entry.ts': `import { x } from 'dep'\nexport const read = () => x()\n`,
    },
    on: ['node_modules/dep/index.js'],
    off: false,
  },
  {
    name: 'an import() of a marked file a package module also re-exports unused, reading nothing of it',
    files: {
      ...dep({
        'index.js': `export { secret } from './marked.js'\nexport const load = () => import('./marked.js').then(() => 'loaded')\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { load } from 'dep'\nexport const read = () => load()\n`,
    },
    on: ['node_modules/dep/index.js'],
    off: true,
  },
  {
    // (a dead import() beside the same re-export: no chunk loads it; the
    // package's own unused re-export gets no warning, not the app's to change)
    name: 'an import() of a marked file in a branch the client build drops, beside an unused re-export of it',
    files: {
      ...dep({
        'index.js': `export { secret } from './marked.js'\nexport const load = () => (import.meta.env.SSR ? import('./marked.js') : 'none')\n`,
        'marked.js': marked,
      }),
      'src/entry.ts': `import { load } from 'dep'\nexport const read = () => load()\n`,
    },
    on: null,
    off: true,
  },
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
