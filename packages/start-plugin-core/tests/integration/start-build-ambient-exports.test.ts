/**
 * An export of an ambient name (`declare const x` beside `export default x`,
 * `export { x }`) is the host's to keep or drop: a `define` global is a value
 * there (Rsbuild's SWC keeps the statement, and the bundler replaces the
 * name), and only Oxc erases it. Start leaves the statement as written;
 * what the declaration's types name is erased text, so a server module only
 * they name leaves the client (SPEC G16). Source: whole-PR review of the
 * declarations lane (Fable's re-check of eeaf6a62b3: the export was deleted,
 * and the Rsbuild build failed with "export 'default' was not found").
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-start'

// (an effect at its top level: the bundler keeps the module where an import
// of it stays)
const db = `;(globalThis as any).dbLoaded = 'MARK_DB_SERVER'
export const getServerDb = () => ({ query: () => 'db' })
`
const head = `import { createServerOnlyFn } from '@tanstack/react-start'
import { getServerDb } from './db'
const db = getServerDb()
export const fn = createServerOnlyFn(() => 1)
`

describe('rsbuild build', () => {
  test('an export default of a define global keeps its value, and what its type names leaves', async () => {
    const build = await buildStart({
      bundler: 'rsbuild',
      files: {
        'src/db.ts': db,
        'src/module.ts': `${head}declare const __DEFINED__: { d: typeof db } | string
export default __DEFINED__
`,
        'src/entry.ts': `export { default as defined } from './module'\n`,
      },
      entry: 'src/entry.ts',
      rsbuildConfig: {
        source: { define: { __DEFINED__: JSON.stringify('MARK_DEFINED') } },
      },
    })
    expect({
      defined: (await build.client.run('return entry.defined')).result,
      db: build.client.where('MARK_DB_SERVER'),
    }).toEqual({ defined: 'MARK_DEFINED', db: 'nowhere' })
  })
})

describe('vite build', () => {
  // (Oxc erases the export of an ambient name: an importer gets nothing
  // from it, on main too)
  test('an export specifier of a declare const builds, and what its type names leaves', async () => {
    const build = await buildStart({
      bundler: 'vite',
      files: {
        'src/db.ts': db,
        'src/module.ts': `${head}declare const ambient: { d: typeof db }
export { ambient }
export const run = () => 1
`,
        'src/entry.ts': `export { run } from './module'\n`,
      },
      entry: 'src/entry.ts',
    })
    expect({
      run: (await build.client.run('return entry.run()')).result,
      db: build.client.where('MARK_DB_SERVER'),
    }).toEqual({ run: 1, db: 'nowhere' })
  })
})
