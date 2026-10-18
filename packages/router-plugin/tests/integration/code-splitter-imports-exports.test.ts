import { describe, expect, it } from 'vitest'
import { build, clientMountEntry, routeApp } from '../build-harness'
import { head } from '../regression-helpers'

describe('TypeScript-only syntax', () => {
  // With `verbatimModuleSyntax`, TypeScript keeps `import { type Db } from
  // './db'` as `import './db'`. A module a route file imports only for types
  // need not load in the client (ruling L3, 2026-10-17; same as the Start
  // client in start-plugin-core known-bugs-start-compiler.test.ts "a
  // server-only module imported only for a type specifier"). Only Vite reads
  // the app's tsconfig in this harness.
  describe('a module imported only for a type specifier, with verbatimModuleSyntax (vite)', () => {
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true, jsx: 'react-jsx' },
      }),
      'db.ts': `;(globalThis as any).dbLoaded = 'MARK_DB_LOADED_END'
export type Db = { name: string }
`,
    }
    const route = `${head}import { type Db } from '../db'
function Page(props: { db?: Db }) {
  return <p>{props.db ? props.db.name : 'page'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`

    // Control: the tsconfig is in effect (the same import, in a module the
    // code splitter does not compile, loads `db.ts`).
    it('loads with the module that imports it outside route files', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, {
          env: 'client',
          files: {
            ...files,
            'entry.ts': `import { type Db } from './db'\n${clientMountEntry}`,
          },
        }),
      })
      expect(app.where('MARK_DB_LOADED_END')).toBe('eager')
    }, 60_000)

    it('does not load in the client of a split route file, which renders', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, { env: 'client', files }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)
return globalThis.dbLoaded ?? null`,
      )
      expect({
        where: app.where('MARK_DB_LOADED_END'),
        loaded: run.result,
        html: run.html,
      }).toEqual({
        where: 'nowhere',
        loaded: null,
        html: '<div id="root"><p>page</p></div>',
      })
    }, 60_000)
  })
})
