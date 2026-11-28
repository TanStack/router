/**
 * A React Start app with RSC enabled on a dev server, configured the way an
 * app's `vite.config.ts` / `rsbuild.config.ts` configures it, through public
 * entry points only:
 * - Vite: `tanstackStart({ rsc: { enabled: true } })` of the built
 *   `@tanstack/react-start/plugin/vite`, Vite's RSC plugin
 *   (`@vitejs/plugin-rsc`) and `@vitejs/plugin-react`;
 * - Rsbuild: `@rsbuild/plugin-react` and
 *   `tanstackStart({ rsc: { enabled: true } })` of the built
 *   `@tanstack/react-start/plugin/rsbuild`, run in the app's directory as
 *   `rsbuild dev` is.
 * The packages an RSC app installs (`@tanstack/react-start`,
 * `@tanstack/react-start-rsc`, and from the latter's own dependencies
 * `@vitejs/plugin-rsc` and `react-server-dom-rspack`) are linked into the
 * app's `node_modules`, as an installation puts them there. Both servers
 * listen on a port: Start's own dev middleware answers the app's requests
 * (SSR, server functions).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { pluginReact } from '@rsbuild/plugin-react'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { closedOnFailure, closedWithTest } from '../test-close'
import {
  rscDependency,
  rscPluginFactory,
  startPluginFactory,
  startRsbuildPluginFactory,
} from '../start-plugins'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'

/** The temporary apps stand in for apps in `tests/`, like the other harnesses'. */
const appsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** The router entry and a root route rendering the document. */
export const rscAppFiles = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <Scripts />
      </body>
    </html>
  )
}
`,
}

const appLinks = () => ({
  ...workspacePackageLinks([
    '@tanstack/react-start',
    '@tanstack/react-start-rsc',
  ]),
  'node_modules/@vitejs/plugin-rsc': rscDependency('@vitejs/plugin-rsc'),
  'node_modules/react-server-dom-rspack': rscDependency(
    'react-server-dom-rspack',
  ),
})

/** A Vite dev server on the RSC app of `files` (over `rscAppFiles`). */
export function startViteRscApp(
  files: Record<string, string>,
): Promise<DevServer> {
  return closedWithTest(async (registerCleanup) => {
    const start = await startPluginFactory('react')
    const rsc = await rscPluginFactory()
    return createDevServer({
      dir: appsDir,
      prefix: '.start-rsc-warnings-vite-',
      registerCleanup,
      listen: true,
      files: { ...rscAppFiles, ...files },
      symlinks: appLinks(),
      // Start serves the pages (SSR through its dev middleware)
      config: { appType: 'custom' },
      plugins: [start({ rsc: { enabled: true } }), rsc(), react()],
    })
  })
}

/** An Rsbuild dev server on the RSC app of `files` (over `rscAppFiles`). */
export function startRsbuildRscApp(
  files: Record<string, string>,
  options: RsbuildRscAppOptions = {},
): Promise<RsbuildDevServer> {
  return closedWithTest((register) =>
    openRsbuildRscApp(files, options, register),
  )
}

/** `startRsbuildRscApp` for a server several tests share: the caller closes it. */
export function startRsbuildRscAppShared(
  files: Record<string, string>,
  options: RsbuildRscAppOptions = {},
): Promise<RsbuildDevServer> {
  return closedOnFailure((register) =>
    openRsbuildRscApp(files, options, register),
  )
}

interface RsbuildRscAppOptions {
  /** The app's Rsbuild `tools` (Start's pages need no `htmlPlugin`). */
  tools?: Record<string, unknown>
  /** The app's Rsbuild `dev` options. */
  dev?: RsbuildConfig['dev']
  /** The app's Rsbuild `environments` options. */
  environments?: RsbuildConfig['environments']
  /** More Rsbuild plugins of the app, after Start's. */
  plugins?: Array<RsbuildPlugin>
  /** The app's React plugin (default `pluginReact()`). */
  react?: RsbuildPlugin
}

async function openRsbuildRscApp(
  files: Record<string, string>,
  options: RsbuildRscAppOptions,
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<RsbuildDevServer> {
  const start = await startRsbuildPluginFactory('react')
  const cwd = process.cwd()
  try {
    return await createRsbuildDevServer({
      dir: appsDir,
      prefix: '.start-rsc-warnings-rsbuild-',
      registerCleanup,
      browser: true,
      // Start's plugin defines the entries of its environments
      entry: 'src/router.tsx',
      files: { ...rscAppFiles, ...files },
      symlinks: appLinks(),
      config: {
        tools: {
          // Start serves the pages, not an HTML template
          htmlPlugin: false,
          ...options.tools,
        },
        ...(options.dev && { dev: options.dev }),
        ...(options.environments && { environments: options.environments }),
      },
      plugins: [
        options.react ?? pluginReact(),
        {
          name: 'rsc-warning-app:working-directory',
          setup(api) {
            // `rsbuild dev` runs in the app's directory
            process.chdir(api.context.rootPath)
          },
        },
        start({ rsc: { enabled: true } }),
        ...(options.plugins ?? []),
      ],
    })
  } finally {
    process.chdir(cwd)
  }
}
