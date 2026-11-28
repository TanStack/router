/**
 * A `declare` of a name before its definition (SPEC G16; v4.1 group E of the
 * merged DCE design, review round 1 F1): the definition runs, so live code
 * that reads it keeps it, and the `declare`'s own type is a name only when
 * removed code reads the value. Vite 8's Oxc rejects these spellings; Rsbuild
 * (SWC) builds them, so they reach users there. The v4 build removed the
 * live function (a `ReferenceError` at load).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-start'

const timeout = 60_000

const dbServer = `export const getServerDb = () => ({ query: () => 'MARK_DB_SERVER' })\n`
const head = `import { createServerOnlyFn } from '@tanstack/react-start'
import { getServerDb } from './db'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
`

describe('rsbuild build', () => {
  test.each([
    {
      name: 'declare var before a function live code calls, erased code names by typeof',
      module: `${head}declare var App: () => number
function App() { return 42 }
export const fn = createServerOnlyFn((x: typeof App) => x)
export const run = () => [App(), seen.length]
`,
      serverModule: 'kept',
    },
    {
      name: 'declare namespace before a const live code reads',
      module: `${head}declare namespace App { const remote: typeof db }
const App = 42
export const fn = createServerOnlyFn(() => App)
export const run = () => [App, seen.length]
`,
      serverModule: 'gone',
    },
  ])(
    '$name',
    async ({ module, serverModule }) => {
      const build = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/db.ts': dbServer,
          'src/module.ts': module,
          'src/entry.ts': `export { run } from './module'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect((await build.client.run('return entry.run()')).result).toEqual([
        42, 1,
      ])
      if (serverModule === 'gone') {
        expect(build.client.where('MARK_DB_SERVER')).toBe('nowhere')
      }
    },
    timeout,
  )
})
