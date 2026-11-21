/**
 * Thin page glue for policy fixtures that expose values instead of a UI, on
 * the one client runner of the dev-server tests (`withRecordedPage` of
 * `../../rsbuild-dev-server`: a real Chromium page recording what the page's
 * code logs and the errors it does not catch). Vite serves an actual HTML
 * entry through its own HTML pipeline (`clientFixturePlugin`); Rsbuild's
 * page loads the initial files of the client entry, as an app's HTML does
 * (`runInClient`, `runRsbuildClient`), so the real host loads its runtime,
 * dependencies and initial/async chunks.
 */
import { diagnosticsOf } from '@tanstack/compiler-test-utils/diagnostics'
import { startDevServer } from '../../dev-server'
import { startProtectedDevServer } from '../../importProtection/start-apps'
import {
  clientPage,
  startRsbuildDevServer,
  startRsbuildStartDevServer,
  throwUncaught,
  withRecordedPage,
} from '../../rsbuild-dev-server'
import type { ClientRun } from '../../rsbuild-dev-server'
import type { Plugin } from 'vite'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

export { runInClient, runRsbuildClient } from '../../rsbuild-dev-server'

/** Mounted before Start's SSR fallback, using Vite's actual HTML pipeline. */
export const clientFixturePlugin: Plugin = {
  name: 'ip-fixture-page',
  configureServer(server) {
    server.middlewares.use('/__ip-fixture.html', async (req, res, next) => {
      try {
        const html = await server.transformIndexHtml(
          req.originalUrl!,
          `<!doctype html><link rel="icon" href="data:,"><div id="root"></div>
<script type="module">
import(/* @vite-ignore */ new URLSearchParams(location.search).get('entry'))
  .then(
    (entry) => { window.__ipEntry = entry },
    (error) => { window.__ipLoadError = error.stack ?? String(error) },
  )
  .then(() => dispatchEvent(new Event('ip-entry')))
</script>`,
        )
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      } catch (error) {
        next(error)
      }
    })
  },
}

export function startBrowserStartDevServer(
  options: Parameters<typeof startDevServer>[0],
) {
  return startDevServer({
    ...options,
    browser: true,
    plugins: (app) => [
      clientFixturePlugin,
      ...(typeof options.plugins === 'function'
        ? options.plugins(app)
        : (options.plugins ?? [])),
    ],
  })
}

/**
 * Loads `entry` in the fixture page of a Vite dev server started with
 * `clientFixturePlugin` and `browser: true`, then runs `script` (the body
 * of an async function, with the module as `entry`). Returns what it
 * returns (`result`), and what the page's code logged meanwhile
 * (`messages`, `level: text`, and as `diagnostics`). Fails when the entry
 * does not load, the page's code throws an error it does not catch, or the
 * script throws.
 */
export async function runViteClient(
  server: Pick<DevServer, 'url'>,
  entry: string,
  script: string,
) {
  if (!server.url) {
    throw new Error('The client policy fixture needs browser: true')
  }
  const url = new URL('/__ip-fixture.html', server.url)
  url.searchParams.set('entry', entry)
  return withRecordedPage(url.href, {}, async ({ page }) => {
    // The page may reload at any time while it loads: Vite sends a
    // `full-reload` (an edit, the dependency optimizer), and keeps one sent
    // while no page is connected for the next page that connects. So one
    // evaluation, in whichever document is current, waits for that
    // document's entry, a turn of its event loop (what its load scheduled
    // ran), and runs `script`: every value comes from one document. A reload
    // during it destroys the evaluation's context; that alone is retried.
    // Load errors, the errors the page's code did not catch while it loaded
    // and the script's own errors still fail immediately. HMR/no-reload rows
    // use their persistent page hosts instead.
    for (let attempt = 0; ; attempt++) {
      try {
        const run = await page.evaluate<{
          uncaught: ClientRun['uncaught']
          calls?: ClientRun['calls']
          result?: unknown
        }>(
          `(async () => {
if (window.__ipEntry === undefined && window.__ipLoadError === undefined) {
  await new Promise((resolve) => addEventListener('ip-entry', resolve, { once: true }))
}
await new Promise((resolve) => setTimeout(resolve))
const { uncaught, calls } = globalThis.__clientRun
if (uncaught.length > 0) {
  return { uncaught: [...uncaught] }
}
if (window.__ipLoadError) { throw new Error(window.__ipLoadError) }
const entry = window.__ipEntry
const result = await (async () => {
${script}
})()
return { uncaught: [], calls, result }
})()`,
        )
        throwUncaught(run)
        const { result, calls = [] } = run
        const messages = calls.map(({ level, text }) => `${level}: ${text}`)
        const diagnostics = calls.flatMap(({ level, text }) =>
          diagnosticsOf(
            text,
            level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
          ),
        )
        return { result, diagnostics, messages }
      } catch (error) {
        // A dependency the optimizer bundled again while the page loaded:
        // the document still imports the previous bundle, and Vite reloads
        // it (a user's browser reloads too); load the current document.
        const staleDependency = /\/node_modules\/\.vite\/deps\//.test(
          String(error),
        )
        if (
          attempt >= 2 ||
          !(
            staleDependency ||
            /Execution context was destroyed|Cannot find context with specified id/.test(
              String(error),
            )
          )
        ) {
          throw error
        }
        if (staleDependency) {
          await page.reload()
        }
      }
    }
  })
}

export async function startBrowserProtectedDevServer(
  ...args: Parameters<typeof startProtectedDevServer>
) {
  return startProtectedDevServer(args[0], args[1], {
    ...args[2],
    browser: true,
    plugins: [clientFixturePlugin, ...(args[2]?.plugins ?? [])],
  })
}

export async function startBrowserRsbuildDevServer(
  ...args: Parameters<typeof startRsbuildDevServer>
) {
  return startRsbuildDevServer({ ...args[0], ...clientPage })
}

export function startBrowserRsbuildStartDevServer(
  options: Parameters<typeof startRsbuildStartDevServer>[0],
) {
  return startRsbuildStartDevServer({ ...options, ...clientPage })
}
