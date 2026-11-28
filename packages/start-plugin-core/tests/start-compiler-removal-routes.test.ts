import { beforeAll, describe, expect, test } from 'vitest'
import { createStartHost } from './regression-helpers'
import type { StartHost } from './start-host'

// The dead-code removal rule in route files (R163, SPEC G16): what only the
// route's erased `server` option or the component's erased code names leaves
// the client with the server module, through a type, an ambient declaration
// or a `var` hoisted out of a block; a class only erased code names goes
// too. The client imports the route module and preloads its split component
// on a new document; what it requests must not include the server module. Sources: the merged
// DCE design's route rows (design-dce-merged.md 6, design-dce-merged-v3.md
// 11.6), each naming its case.

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** Route files by name (`src/routes/removal-<name>.tsx`), each with its own server module. */
const routes: Record<string, (db: string) => string> = {
  // T5_route_class_alias_erased_handler: a class only the handler names, through an alias
  'class-alias': (db) => `${head}import { secret } from '${db}'
class ServerRepo { static v = secret() }
type RepoType = typeof ServerRepo
export const Route = createFileRoute('/removal-class-alias')({
  component: () => <p>page</p>,
  server: { handlers: { GET: (r: RepoType) => new Response(String(r)) } },
})
`,
  // T5_declare_module_augmentation_in_route
  augmentation: (db) => `${head}import { getServerDb } from '${db}'
const db = getServerDb()
declare module '@tanstack/react-router' { interface Register { removalDb: typeof db } }
export const Route = createFileRoute('/removal-augmentation')({
  component: () => <p>page</p>,
  server: { handlers: { GET: () => new Response(String(db.query())) } },
})
`,
  // T5_declare_global_in_route
  global: (db) => `${head}import { getServerDb } from '${db}'
const db = getServerDb()
declare global { interface Window { __removalDb: typeof db } }
export const Route = createFileRoute('/removal-global')({
  component: () => <p>page</p>,
  server: { handlers: { GET: () => new Response(String(db.query())) } },
})
`,
  // T7_declare_function_in_route
  'declare-function': (db) => `${head}import { getServerDb } from '${db}'
const db = getServerDb()
declare function lookup(): typeof db
export const Route = createFileRoute('/removal-declare-function')({
  component: () => <p>page</p>,
  server: { handlers: { GET: (_: unknown, c?: ReturnType<typeof lookup>) => new Response(String(c)) } },
})
`,
  // G3_route_split_hoisted_var_plus_erased_handler
  'hoisted-var': (db) => `${head}import { getServerDb } from '${db}'
if ((globalThis as any).removalOn) { var srv = getServerDb(); var shown = 'shown' }
export const Route = createFileRoute('/removal-hoisted-var')({
  component: () => <p>{String(shown)}</p>,
  server: { handlers: { GET: () => new Response(String(srv)) } },
})
`,
  // Z2_route_class_only_erased_reads_hoisted_var
  'class-hoisted-var': (db) => `${head}import { getServerDb } from '${db}'
if (typeof globalThis !== 'undefined') { var db = getServerDb() }
class Repo { static v = () => db }
export const Route = createFileRoute('/removal-class-hoisted-var')({
  component: () => <p>page</p>,
  server: { handlers: { GET: () => new Response(String(Repo.v())) } },
})
`,
  // M5_local_leaf_split_chunk_keeps_env_drops: a split component's local
  // pattern, one leaf of which only its server-only fn reads
  'component-leaf': (
    db,
  ) => `${head}import { createServerOnlyFn } from '@tanstack/react-start'
import { getServerDefault } from '${db}'
function Page() {
  const { shown = 'shown', hidden = getServerDefault() } = (globalThis as any).removalCfg ?? {}
  const f = createServerOnlyFn(() => hidden)
  return <p>{String(shown)}{typeof f}</p>
}
export const Route = createFileRoute('/removal-component-leaf')({ component: Page })
`,
}

const serverModule = `export const secret = () => 's'
export const getServerDb = () => ({ query: () => 'db' })
export const getServerDefault = () => ({ s1: 's' })
`

let host: StartHost
beforeAll(async () => {
  host = await createStartHost({
    files: {
      ...Object.fromEntries(
        Object.entries(routes).flatMap(([name, route]) => [
          [`src/removal-${name}-db.server.ts`, serverModule],
          [
            `src/routes/removal-${name}.tsx`,
            route(`../removal-${name}-db.server`),
          ],
        ]),
      ),
    },
  })
  return () => host.close()
})

describe('route files', () => {
  test.each(Object.keys(routes))(
    'removal-%s: the client loads no server module',
    async (name) => {
      const run = await host.run<string>(
        `(async () => {
  const route = await import('/src/routes/removal-${name}.tsx')
  await route.Route.options.component.preload?.()
  return typeof route.Route.options.component
})()`,
        // (a new document: nothing it requests was loaded before)
        { fresh: true },
      )
      expect(run.errors).toEqual([])
      expect(run.result).toBe('function')
      expect(
        run.requests.filter((path) => path.includes(`removal-${name}.tsx`)),
      ).not.toEqual([])
      expect(
        run.requests.filter((path) =>
          path.includes(`removal-${name}-db.server`),
        ),
      ).toEqual([])
    },
  )
})
