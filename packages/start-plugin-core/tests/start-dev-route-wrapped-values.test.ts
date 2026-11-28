/**
 * In development, a route component kept in the route module (not split)
 * whose value is in a type wrapper and is a value Start compiles per
 * environment: each environment serves its own compile of it (route HMR
 * gives the component a binding React Refresh registers; that binding holds
 * the compiled value, not the source text).
 */
import { beforeAll, expect, test } from 'vitest'
import { closeAfterAll } from './file-end'
import { createStartHost } from './regression-helpers'
import type { StartHost } from './start-host'

const SECRET = 'MARK_SECRET'

const rows = [
  {
    file: 'src/routes/isomorphic.tsx',
    path: '/isomorphic',
    component: `createIsomorphicFn().server(() => '${SECRET}').client(() => 'client view') as any`,
  },
  {
    file: 'src/routes/server-only.tsx',
    path: '/server-only',
    component: `createServerOnlyFn(() => '${SECRET}') satisfies unknown`,
  },
]

let host: StartHost
const openHost = closeAfterAll()
beforeAll(async () => {
  host = await openHost(() =>
    createStartHost({
      files: Object.fromEntries(
        rows.map(({ file, path, component }) => [
          file,
          `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
export const Route = createFileRoute('${path}')({
  loader: () => 'loader data',
  component: ${component},
})
`,
        ]),
      ),
      start: {
        router: { codeSplittingOptions: { defaultBehavior: [['loader']] } },
      },
    }),
  )
}, 60_000)

test.each(rows)(
  'in development, a component kept in the route module, `$component`, serves the client nothing of its server implementation',
  async ({ file }) => {
    const { host: dev } = host
    expect(await dev.transform(`/${file}`, 'client')).not.toContain(SECRET)
    expect(await dev.transform(`/${file}`, 'ssr')).toContain(SECRET)
  },
)
