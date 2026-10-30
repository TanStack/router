/**
 * A Start app in production, served the way a host serves it (SPEC G11):
 * the app is built with Start's own Vite or
 * Rsbuild plugin (`buildStart`), with Start's default entries (the client
 * hydrates the document with `StartClient`, the server entry is
 * `@tanstack/react-start/server-entry`), and `serveStartBuild` serves the
 * client output as static files and hands every other request to the
 * server entry's `fetch`, in this process. A real page (headless Chromium,
 * `openPage`) then loads the server-rendered document, hydrates with the
 * client build and calls server fns over HTTP, as a deployed app does.
 *
 * Thin glue only: the compilers, bundlers, router, React and Start runtime
 * are the real ones; srvx owns HTTP request/response adaptation and the
 * host only selects static output or Start's fetch handler.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { serve } from 'srvx/node'
import { staticMiddleware } from 'srvx/static'
import ts from 'typescript'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { callByIdExports } from '../build-harness'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { StartBuild } from '../build-harness'

/**
 * Start's default entries of a page app, with the test entries' exports on
 * the harness's global for `ssr.run` scripts (`entry`) and, in the page, on
 * `globalThis.__app`: the client entry hydrates the document Start's server
 * entry rendered (`StartClient`) and exposes `src/client-entry.ts`; the
 * server entry is Start's HTTP handler (`fetch`), the default export a host
 * imports, and exposes `src/ssr-entry.ts`.
 */
export const startPageEntries = {
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import * as entry from '../src/client-entry'
;(globalThis as any).__app = entry
hydrateRoot(document, createElement(StartClient))
`,
  'harness/server-entry.ts': `import handler from '@tanstack/react-start/server-entry'
import * as entry from '../src/ssr-entry'
;(globalThis as any).__tssBuildHarnessEntry = entry
export default handler
`,
}

/**
 * The test entries of a page app: the client's exposes the app's router;
 * the SSR one also exposes the harness's `renderPath` and Start's server
 * entry and client RPC for `callByIdPrelude`.
 */
export const pageEntries = {
  'src/client-entry.ts': `export { getRouter } from './router'\n`,
  'src/ssr-entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
${callByIdExports}`,
}

/** `src/router.ts` of a page app: the real router over the generated tree. */
export const routerFile = `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`

/**
 * A root route rendering the document: `HeadContent`, the outlet under
 * `#app`, a hydration marker, links to `to` (each `data-testid="to-<name>"`,
 * the name being the path without its slashes), `Scripts`, and a not-found
 * component.
 */
export function rootDocument(to: Array<string> = []) {
  const links = to
    .map(
      (target) =>
        `<Link to=${JSON.stringify(target)} data-testid=${JSON.stringify(`to-${target.replace(/\//g, '') || 'home'}`)}>${target}</Link>`,
    )
    .join('\n          ')
  return `import { HeadContent, Link, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => <p>MARK_NOT_FOUND</p>,
})
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          ${links}
        </nav>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`
}

export interface ServedStartBuild {
  /** Origin of the host (with a trailing slash). */
  url: string
  /** Sends a request to the host (relative URLs are of its origin). */
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  close: () => Promise<void>
}

/**
 * Node's own `import()`, outside Vitest's module runner: a built server
 * bundle loads its chunks itself (Rspack's by `file:` URL), which the
 * runner would try to resolve.
 */
const nativeImport = createRequire(import.meta.url)(
  '../../../compiler-test-utils/src/native-import.cjs',
) as (specifier: string) => Promise<Record<string, unknown>>

/**
 * The server entry's `fetch` of the SSR build, imported in this process:
 * what a host calls with each request.
 */
async function serverFetch(build: StartBuild) {
  const entryFile = path.join(build.ssr.outDir, build.ssr.entry.fileName)
  const module = (await nativeImport(pathToFileURL(entryFile).href)) as {
    default?: { fetch?: unknown; default?: { fetch?: unknown } }
  }
  const handler = module.default?.fetch
    ? module.default
    : module.default?.default
  if (typeof handler?.fetch !== 'function') {
    throw new Error(`${entryFile} does not export a server entry`)
  }
  return handler.fetch as (request: Request) => Promise<Response>
}

/**
 * Serves `build` on a free local port: a file of the client output
 * directory for a request whose path names one, the server entry for every
 * other request.
 */
export async function serveStartBuild(
  build: StartBuild,
  options: { registerCleanup?: (cleanup: () => Promise<void>) => void } = {},
): Promise<ServedStartBuild> {
  const handle = await serverFetch(build)
  const clientDir = path.resolve(build.client.outDir)
  const server = serve({
    hostname: '127.0.0.1',
    port: 0,
    silent: true,
    middleware: [staticMiddleware({ dir: clientDir })],
    fetch: handle,
  })
  await server.ready()
  const url = server.url!
  const close = () => server.close(true)
  options.registerCleanup?.(close)
  return {
    url,
    fetch: (target, init) => fetch(new URL(target, url), init),
    close,
  }
}

export interface AppPage extends BrowserPage {
  /**
   * Paths of the server fn requests the page sent since it loaded, in
   * order.
   */
  serverFnRequests: Array<string>
  /**
   * URLs (path and query) of the scripts the page requested since it
   * loaded, in order: what a navigation loads on demand.
   */
  scriptRequests: Array<string>
  /** Clicks the link `data-testid="to-<name>"` of `rootDocument`. */
  follow: (name: string) => Promise<void>
}

/**
 * Opens `pathname` of a served app in a page and waits until it hydrated
 * (`rootDocument`'s marker), recording the requests it sends from then on.
 */
export async function openAppPage(
  served: Pick<ServedStartBuild, 'url'>,
  pathname: string,
  options: { registerCleanup?: (cleanup: () => Promise<void>) => void } = {},
): Promise<AppPage> {
  const serverFnRequests: Array<string> = []
  const scriptRequests: Array<string> = []
  const page = await openPage(new URL(pathname, served.url).href, options)
  page.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/_serverFn/')) {
      serverFnRequests.push(url.pathname)
    } else if (request.resourceType() === 'script') {
      scriptRequests.push(url.pathname + url.search)
    }
  })
  await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  return {
    ...page,
    serverFnRequests,
    scriptRequests,
    follow: (name) => page.page.locator(`[data-testid=to-${name}]`).click(),
  }
}

/**
 * Type-checks `files` of the app at `root` with the real declarations the
 * app resolves; returns the diagnostics (empty when it compiles).
 */
export function typeCheck(root: string, files: Array<string>) {
  const program = ts.createProgram(
    files.map((file) => path.join(root, file)),
    {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      jsx: ts.JsxEmit.Preserve,
      skipLibCheck: true,
      types: [],
    },
  )
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const where = diagnostic.file
      ? `${path.relative(root, diagnostic.file.fileName)}:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1}`
      : ''
    return `${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
  })
}
