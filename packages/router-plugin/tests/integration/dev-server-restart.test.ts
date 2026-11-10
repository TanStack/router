/**
 * The router plugin alone on a Vite dev server with inline plugins that
 * restarts (`server.restart()`, as Vite itself does on an `.env` edit): the
 * new server is given the same plugin objects and serves the app as a dev
 * server of its own. A route registry change without a file change (a
 * route added to the virtual route config) re-plans the route file (SPEC
 * J1.10, J2.13) after the restart as before it.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { expect, onTestFinished, test } from 'vitest'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { tanstackRouter } from '../../src/vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
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
    const server = await createDevServer({
      dir: harnessDir,
      prefix: '.router-dev-restart-',
      registerCleanup: onTestFinished,
      listen,
      symlinks: workspacePackageLinks(['@tanstack/virtual-file-routes']),
      files: {
        'routes.ts': virtualRouteConfig(`index('index.tsx')`),
        'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => 'MARK_INDEX' })
`,
        'routes/contact.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/contact')({
  component: () => 'MARK_CONTACT',
})
`,
      },
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          virtualRouteConfig: './routes.ts',
          autoCodeSplitting: true,
        }),
        react(),
      ],
    })
    await server.transform('/routes/index.tsx')
    if (restart) {
      await server.vite.restart()
    }
    // not in the route tree yet: the module keeps its component
    expect(await server.transform('/routes/contact.tsx')).toContain(
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
        last = await server.transform('/routes/contact.tsx')
        return !last.includes('MARK_CONTACT')
      },
      timeout: 20_000,
      describe: () => `the route module is still served as:\n${last}`,
    })
  },
  timeout,
)
