/**
 * A Start build whose `generatedRouteTree` is in a linked directory (the
 * bundlers resolve the tree module to its real path): the client still gets
 * the route tree without its server-only routes (SPEC J2.15), so a
 * server-only route's file is not in the client.
 * Source: review G of design-routeset-v4 (follow-up F11: the client tree's
 * test compared the configured path only, and the client got the whole
 * tree).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000
const RP = '@tanstack/react-router'

describe.each(startBundlers)('a %s build', (bundler) => {
  test(
    'with the route tree in a linked directory leaves a server-only route out of the client',
    async () => {
      const build = await buildStart({
        bundler,
        // (relative to `srcDirectory`)
        start: { router: { generatedRouteTree: 'alias/routeTree.gen.ts' } },
        symlinks: { 'src/alias': 'src/actual' },
        files: {
          'src/actual/.keep': '',
          'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
          'src/routes/index.tsx': `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/')({ component: () => <p>MARK_PAGE</p> })
`,
          // (a statement of the module's own: in the client when it imports the file)
          'src/routes/api.tsx': `import { createFileRoute } from '${RP}'
;(globalThis as any).apiModule = 'MARK_API_MODULE'
export const Route = createFileRoute('/api')({
  server: { handlers: { GET: () => new Response('MARK_HANDLER') } },
})
`,
          'src/router.ts': `import { createRouter } from '${RP}'
import { routeTree } from './alias/routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/entry.ts': `export { routeTree } from './alias/routeTree.gen'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(build.client.where('MARK_PAGE')).not.toBe('nowhere')
      expect(build.client.where('MARK_API_MODULE')).toBe('nowhere')
      expect(build.client.where('MARK_HANDLER')).toBe('nowhere')
    },
    timeout,
  )
})
