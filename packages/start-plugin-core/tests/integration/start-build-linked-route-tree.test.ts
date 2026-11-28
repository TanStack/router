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
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

const RP = '@tanstack/react-router'

describe.each(startBundlers)('a %s build', (bundler) => {
  // The tree's directory under the link, created by the generator when it
  // writes the tree (a clean checkout), or there before. Vite builds from the
  // app's config file, as `vite build` does (its client environment's config
  // is resolved before the first generation).
  // Source: review of the route-set work (Astra, Gemini: the tree's real
  // path was read from its parent directory only).
  test.each([
    { name: 'the linked directory', tree: 'alias' },
    {
      name: 'a directory not created yet under the link',
      tree: 'alias/generated',
    },
  ])(
    'with the route tree in $name leaves a server-only route out of the client',
    async ({ tree }) => {
      const build = await buildStart({
        bundler,
        viteConfigFile: bundler === 'vite',
        // (relative to `srcDirectory`)
        start: { router: { generatedRouteTree: `${tree}/routeTree.gen.ts` } },
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
import { routeTree } from './${tree}/routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/entry.ts': `export { routeTree } from './${tree}/routeTree.gen'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(build.client.where('MARK_PAGE')).not.toBe('nowhere')
      expect(build.client.where('MARK_API_MODULE')).toBe('nowhere')
      expect(build.client.where('MARK_HANDLER')).toBe('nowhere')
    },
  )
})
