/**
 * Glue of the V2 import-protection tests (`v2-*.test.ts`) that run an app on
 * a real host: what a dev server or build reports through `onViolation`,
 * and the Rsbuild dev server's SSR output run in Node.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { startServerEntryFiles } from '../../dev-server'
import { reportedImporters } from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'
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
 * `server`) in `recorded` (what `onViolation` received), each once, sorted.
 */
export function importersIn(
  recorded: Recorded,
  environment: 'client' | 'server',
): Array<string> {
  const prefix = `${environment} `
  return [
    ...new Set(
      reportedImporters(recorded)
        .filter((reported) => reported.startsWith(prefix))
        .map((reported) => reported.slice(prefix.length)),
    ),
  ].sort()
}

/** What `recorded` received from the `since`th violation on. */
export const recordedSince = (recorded: Recorded, since: number): Recorded => ({
  root: recorded.root,
  violations: recorded.violations.slice(since),
})

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
 * Explicit output contract of the Node fixture entry: the entry file is
 * `ip-node-entry.cjs`, split chunks get names of their own.
 */
export const ssrNodeOutput = {
  environments: {
    ssr: {
      output: { filename: { js: 'ip-node-entry.cjs' }, distPath: { js: '' } },
      tools: {
        rspack: { output: { chunkFilename: 'ip-node-chunk-[id].cjs' } },
      },
    },
  },
}

/**
 * Load the declared SSR entry from Rsbuild's writeToDisk output with Node.
 * Node owns globals, dependencies, module identity and split chunk loading.
 */
export async function runRsbuildSsr(
  server: Pick<RsbuildDevServer, 'rsbuild' | 'root'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  const config = server.rsbuild.getNormalizedConfig({ environment: 'ssr' })
  const entry = path.resolve(
    server.root,
    config.output.distPath.root,
    'ip-node-entry.cjs',
  )
  const { stdout } = await runNodeProgram(
    `
let outcome
try {
  await import(${JSON.stringify(pathToFileURL(entry).href)})
  outcome = { result: await (async () => {\n${script}\n})() }
} catch (error) {
  outcome = { error: error instanceof Error ? error.message : String(error) }
}
console.log('IP_NODE_RESULT:' + JSON.stringify(outcome))
`,
    { cwd: server.root },
  )
  const result = stdout
    .split('\n')
    .reverse()
    .find((line) => line.startsWith('IP_NODE_RESULT:'))
  if (!result) {
    throw new Error(`Node returned no SSR result: ${stdout}`)
  }
  return JSON.parse(result.slice('IP_NODE_RESULT:'.length)) as
    | { result: unknown }
    | { error: string }
}
