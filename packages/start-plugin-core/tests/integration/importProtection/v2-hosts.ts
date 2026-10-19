/**
 * Glue of the V2 import-protection tests (`v2-*.test.ts`) that run an app on
 * a real host: what a dev server or build reports, read through the
 * violation report adapter (`violation-report.ts`), and the Rsbuild dev
 * server's SSR output run in Node.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { startServerEntryFiles } from '../../dev-server'
import { reportedViolations } from '../../importProtection/start-apps'
import type { ReportOutput } from '../../importProtection/violation-report'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

// ---------------------------------------------------------------------------
// The V2-14 page app (v2-edits-page.test.ts on Vite, v2-edits-page-rsbuild
// .test.ts on Rsbuild): a Start app a browser opens (Start's default server
// and client entries, the real router over the generated route tree) whose
// index route renders `Widget` on the client only (`ssr: false`).

export const secretServerModule = `export const secret = () => 'MARK_SECRET'\n`

/**
 * `src/widget.tsx` at `step`; `live`: also uses the denied import live
 * (and gives it to the page, `window.liveSecret`).
 */
export const pageWidget = (
  step: number,
  live: boolean,
) => `import { createIsomorphicFn } from '@tanstack/react-start'
import { secret } from './secret.server'
const read = createIsomorphicFn()
  .server(() => secret())
  .client(() => 'MARK_CLIENT_BRANCH')
export function Widget() {
${
  live
    ? `  ;(window as unknown as Record<string, unknown>).liveSecret = secret
  return <p data-testid="widget">{read() + ' ' + String(secret()) + ' step-${step}'}</p>`
    : `  return <p data-testid="widget">{read() + ' step-${step}'}</p>`
}
}
`

export const pageApp = {
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
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
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widget } from '../widget'
export const Route = createFileRoute('/')({ ssr: false, component: Widget })
`,
  'src/secret.server.ts': secretServerModule,
  'src/widget.tsx': pageWidget(1, false),
}

/** The steps of the page: allowed, denied (live use), allowed again. */
export const pageSteps = [
  { step: 1, live: false },
  { step: 2, live: true },
  { step: 3, live: false },
] as const

/**
 * The importers of the violations reported for `environment` (`client` or
 * `server`) in `output` (text, log entries, or an Rsbuild dev server's
 * `diagnostics`), without their locations, each once, sorted.
 */
export function reportedImporters(
  output: ReportOutput,
  environment: 'client' | 'server',
): Array<string> {
  return [
    ...new Set(
      reportedViolations(output)
        .filter((violation) => violation.environment === environment)
        .map(({ importer }) => importer.replace(/:\d+:\d+$/, '')),
    ),
  ].sort()
}

/**
 * `settle()` on both sides of a turn of the event loop. Rspack's
 * MultiCompiler starts the compile of a dependent environment (Start's
 * `ssr` after `client`) through its queue on the tick after its parent's
 * compile ended, which `settle()` cannot see yet: a write landing while that
 * compile runs is reported late, and a removal never (FOLLOWUPS "UPSTREAM
 * (W3-harness2)"). Yielding a turn lets the queue start it; the second
 * `settle()` waits for it. Not a timer.
 */
export async function settledAcrossTurn(
  server: Pick<RsbuildDevServer, 'settle'>,
): Promise<void> {
  await server.settle()
  await new Promise<void>((resolve) => setImmediate(resolve))
  await server.settle()
}

/**
 * Runs the SSR output of an Rsbuild dev server with Start's plugin (a
 * CommonJS bundle for Node) in a fresh VM context, as Node loads the
 * server, then `script` (the body of an async function) in the same
 * context. Returns what the script returns (`result`), or the message of
 * what it throws (`error`). The context's console is this process's.
 */
export async function runRsbuildSsr(
  server: Pick<RsbuildDevServer, 'outputs' | 'root'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  const commonJs = { exports: {} }
  const context = vm.createContext({
    console,
    module: commonJs,
    exports: commonJs.exports,
    require: createRequire(path.join(server.root, 'index.js')),
  })
  context.globalThis = context
  for (const code of Object.values(await server.outputs('ssr'))) {
    vm.runInContext(code, context)
  }
  try {
    const run = vm.runInContext(
      `(async () => {\n${script}\n})`,
      context,
    ) as () => Promise<unknown>
    return { result: await run() }
  } catch (error) {
    // errors of the VM context are not `instanceof Error` here
    return {
      error:
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error),
    }
  }
}
