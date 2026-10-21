/**
 * A React Start app with RSC enabled on a dev server, configured the way an
 * app's `vite.config.ts` / `rsbuild.config.ts` configures it, through public
 * entry points only:
 * - Vite: `tanstackStart({ rsc: { enabled: true } })` of the built
 *   `@tanstack/react-start/plugin/vite`, Vite's RSC plugin
 *   (`@vitejs/plugin-rsc`) and `@vitejs/plugin-react`;
 * - Rsbuild: `tanstackStart({ rsc: { enabled: true } })` of the built
 *   `@tanstack/react-start/plugin/rsbuild` (React's JSX runtime configured
 *   as `@rsbuild/plugin-react` does), run in the app's directory as
 *   `rsbuild dev` is.
 * The packages an RSC app installs (`@tanstack/react-start`,
 * `@tanstack/react-start-rsc`, and from the latter's own dependencies
 * `@vitejs/plugin-rsc` and `react-server-dom-rspack`) are linked into the
 * app's `node_modules`, as an installation puts them there. Both servers
 * listen on a port: Start's own dev middleware answers the app's requests
 * (SSR, server functions).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import { onTestFinished } from 'vitest'
import type { PluginOption } from 'vite'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

/** The temporary apps live in `tests/`, like the other harnesses'. */
const appsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/**
 * The file a package's `package.json` exports for `subpath` (its `import`
 * condition), as Node resolves an app's import of it.
 */
function exportedFile(root: string, subpath: string): string {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    exports: Record<string, string | { import?: unknown; default?: unknown }>
  }
  const entry = manifest.exports[subpath]!
  const target =
    typeof entry === 'string'
      ? entry
      : typeof entry.import === 'string'
        ? entry.import
        : ((entry.import as { default?: string } | undefined)?.default ??
          (entry.default as string))
  return path.join(root, target)
}

/** A dependency of `@tanstack/react-start-rsc`, by its package root. */
function rscDependency(name: string): string {
  const rscPackage = workspacePackage('@tanstack/react-start-rsc')
  return path.dirname(
    createRequire(path.join(rscPackage, 'package.json')).resolve(
      `${name}/package.json`,
    ),
  )
}

type StartPlugin = (options?: Record<string, unknown>) => unknown

/** `tanstackStart` of the built `@tanstack/react-start/plugin/<bundler>`. */
async function tanstackStart(bundler: 'vite' | 'rsbuild') {
  const entry = exportedFile(
    workspacePackage('@tanstack/react-start'),
    `./plugin/${bundler}`,
  )
  return (
    (await import(pathToFileURL(entry).href)) as {
      tanstackStart: StartPlugin
    }
  ).tanstackStart
}

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
export async function startViteRscApp(
  files: Record<string, string>,
): Promise<DevServer> {
  const start = await tanstackStart('vite')
  const { default: rsc } = (await import(
    pathToFileURL(exportedFile(rscDependency('@vitejs/plugin-rsc'), '.')).href
  )) as { default: () => PluginOption }
  return createDevServer({
    dir: appsDir,
    prefix: '.start-rsc-warnings-vite-',
    registerCleanup: onTestFinished,
    listen: true,
    files: { ...rscAppFiles, ...files },
    symlinks: appLinks(),
    // Start serves the pages (SSR through its dev middleware)
    config: { appType: 'custom' },
    plugins: [
      start({ rsc: { enabled: true } }) as PluginOption,
      rsc(),
      react(),
    ],
  })
}

/** An Rsbuild dev server on the RSC app of `files` (over `rscAppFiles`). */
export async function startRsbuildRscApp(
  files: Record<string, string>,
): Promise<RsbuildDevServer> {
  const start = await tanstackStart('rsbuild')
  const cwd = process.cwd()
  try {
    return await createRsbuildDevServer({
      dir: appsDir,
      prefix: '.start-rsc-warnings-rsbuild-',
      registerCleanup: onTestFinished,
      browser: true,
      // Start's plugin defines the entries of its environments
      entry: 'src/router.tsx',
      files: { ...rscAppFiles, ...files },
      symlinks: appLinks(),
      config: {
        tools: {
          // Start serves the pages, not an HTML template
          htmlPlugin: false,
          swc: {
            jsc: {
              transform: {
                react: { runtime: 'automatic', development: true },
              },
            },
          },
        },
      },
      plugins: [
        {
          name: 'rsc-warning-app:working-directory',
          setup(api) {
            // `rsbuild dev` runs in the app's directory
            process.chdir(api.context.rootPath)
          },
        },
        start({ rsc: { enabled: true } }) as never,
      ],
    })
  } finally {
    process.chdir(cwd)
  }
}
