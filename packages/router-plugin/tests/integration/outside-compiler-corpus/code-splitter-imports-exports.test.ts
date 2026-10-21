/**
 * Tool control, outside the compiler corpus (SPEC §8; SYNTHESIS B-other
 * R/integration/code-splitter-imports-exports.test.ts:32): with
 * `verbatimModuleSyntax` in the app's tsconfig, Vite keeps an import that
 * names only a type (`import { type Db } from './db'`) as a side-effect
 * import, in a module the code splitter does not compile. It shows the
 * tsconfig is in effect in this harness; it tests Vite, not the router
 * plugin. The corpus test it controls, which decides the compiler's outcome
 * (the route file's type-only import does not load in the client):
 * ../code-splitter-imports-exports.test.ts.
 * Moved from ../code-splitter-imports-exports.test.ts.
 */
import { expect, it } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../../build-harness'

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

it('a module imported only for a type specifier loads with the module that imports it outside route files, with verbatimModuleSyntax (vite)', async () => {
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
