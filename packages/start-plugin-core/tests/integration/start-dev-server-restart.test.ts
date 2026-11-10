/**
 * A Vite dev server with inline plugins that restarts (`server.restart()`,
 * as Vite itself does on an `.env` edit): the new server is given the same
 * Start plugin objects, and serves the app as a dev server of its own.
 */
import { expect, test } from 'vitest'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { startDevServer } from '../dev-server'

const timeout = 60_000

const virtualRouteConfig = (children: string) =>
  `import { index, rootRoute, route } from '@tanstack/virtual-file-routes'
export const routes = rootRoute('__root.tsx', [${children}])
`

test.each([
  { restart: false, listen: false },
  { restart: true, listen: false },
  { restart: true, listen: true },
])(
  'a route added to the virtual route config is served as a route (restarted first: $restart, listening: $listen)',
  async ({ restart, listen }) => {
    const server = await startDevServer({
      listen,
      start: {
        router: {
          virtualRouteConfig: './routes.ts',
          // only the route `/contact` is split, by its id in the route tree
          codeSplittingOptions: {
            defaultBehavior: [],
            splitBehavior: ({ routeId }) =>
              routeId === '/contact' ? [['component']] : undefined,
          },
        },
      },
      symlinks: workspacePackageLinks(['@tanstack/virtual-file-routes']),
      files: {
        'routes.ts': virtualRouteConfig(`index('index.tsx')`),
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })
`,
        'src/routes/contact.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/contact')({
  component: () => 'MARK_CONTACT',
})
`,
      },
    })
    await server.transform('/src/routes/index.tsx')
    if (restart) {
      await server.vite.restart()
    }
    // not in the route tree yet: the module keeps its component
    expect(await server.transform('/src/routes/contact.tsx')).toContain(
      'MARK_CONTACT',
    )
    await server.write({
      'routes.ts': virtualRouteConfig(
        `index('index.tsx'), route('/contact', 'contact.tsx')`,
      ),
    })
    // in the route tree now: its component is split out of the route module
    let last = ''
    await waitForOutcome({
      applied: async () => {
        last = await server.transform('/src/routes/contact.tsx')
        return !last.includes('MARK_CONTACT')
      },
      timeout: 20_000,
      describe: () => `the route module is still served as:\n${last}`,
    })
  },
  timeout,
)
