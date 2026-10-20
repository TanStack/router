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
  withRecordedPage,
} from '../../rsbuild-dev-server'
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
import(/* @vite-ignore */ new URLSearchParams(location.search).get('entry')).then(
  (entry) => { window.__ipEntry = entry },
  (error) => { window.__ipLoadError = error.stack ?? String(error) },
)
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
  return withRecordedPage(url.href, {}, async ({ page, record, settled }) => {
    // These value fixtures allow Vite's dependency-optimizer reload. Retry
    // only a navigation that interrupts the browser observation; execution
    // errors and policy failures still fail immediately. HMR/no-reload rows
    // use their persistent page hosts instead.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.waitForFunction(
          'window.__ipEntry !== undefined || window.__ipLoadError !== undefined',
        )
        await settled()
        const result = await page.evaluate(`(async () => {
if (window.__ipLoadError) { throw new Error(window.__ipLoadError) }
const entry = window.__ipEntry
${script}
})()`)
        const { calls } = await record()
        const messages = calls.map(({ level, text }) => `${level}: ${text}`)
        const diagnostics = calls.flatMap(({ level, text }) =>
          diagnosticsOf(
            text,
            level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
          ),
        )
        return { result, diagnostics, messages }
      } catch (error) {
        if (
          attempt >= 2 ||
          !/Execution context was destroyed|Cannot find context with specified id/.test(
            String(error),
          )
        ) {
          throw error
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
