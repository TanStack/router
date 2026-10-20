/**
 * Thin page glue for policy fixtures that expose values instead of a UI.
 * Vite serves an actual HTML entry and Rsbuild serves its generated HTML,
 * so the real host loads its runtime, dependencies and initial/async chunks.
 */
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { diagnosticsOf } from '@tanstack/compiler-test-utils/diagnostics'
import { mergeRsbuildConfig } from '@rsbuild/core'
import { startDevServer } from '../../dev-server'
import { startProtectedDevServer } from '../../importProtection/start-apps'
import {
  startRsbuildDevServer,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import type { Plugin } from 'vite'
import type {
  MergedEnvironmentConfig,
  ModifyEnvironmentConfigUtils,
} from '@rsbuild/core'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

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

async function observe(browser: BrowserPage, script: string) {
  const result = await browser.page.evaluate(`(async () => {\n${script}\n})()`)
  const messages = [...browser.console]
  const diagnostics = messages.flatMap((message) => {
    const [, level, text = ''] = /^(\w+): ([\s\S]*)$/.exec(message) ?? []
    return diagnosticsOf(
      text,
      level === 'error'
        ? 'error'
        : level === 'warning' || level === 'warn'
          ? 'warning'
          : 'info',
    )
  })
  return { result, diagnostics, messages }
}

async function pageAt(url: string) {
  const browser = await openPage('about:blank')
  try {
    // The fixture has no favicon; its absence is not a runtime diagnostic.
    await browser.page.route('**/favicon.ico', (route) =>
      route.fulfill({ status: 204 }),
    )
    await browser.page.goto(url)
    return browser
  } catch (error) {
    await browser.close()
    throw error
  }
}

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
  const browser = await pageAt(url.href)
  try {
    // These value fixtures allow Vite's dependency-optimizer reload. Retry
    // only a navigation that interrupts the browser observation; execution
    // errors and policy failures still fail immediately. HMR/no-reload rows
    // use their persistent page hosts instead.
    for (let attempt = 0; ; attempt++) {
      try {
        await browser.page.waitForFunction(
          'window.__ipEntry !== undefined || window.__ipLoadError !== undefined',
        )
        return await observe(
          browser,
          `
if (window.__ipLoadError) { throw new Error(window.__ipLoadError) }
const entry = window.__ipEntry
${script}`,
        )
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
  } finally {
    await browser.close()
  }
}

async function consumeRsbuild(
  server: Pick<RsbuildDevServer, 'url'>,
  script: string,
) {
  if (!server.url) {
    throw new Error('The client policy fixture needs browser: true')
  }
  // Rsbuild's generated HTML loads its declared entry and initial chunks.
  const browser = await pageAt(new URL('/index.html', server.url).href)
  try {
    return await observe(browser, script)
  } finally {
    await browser.close()
  }
}

export async function runInClient(
  server: Pick<RsbuildDevServer, 'url'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  try {
    const { result } = await consumeRsbuild(server, script)
    return { result }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function runRsbuildClient(
  server: Pick<RsbuildDevServer, 'url'>,
  options: { levels?: boolean } = {},
) {
  const { messages } = await consumeRsbuild(server, '')
  return messages.map((message) =>
    options.levels
      ? message.replace(/^warning:/, 'warn:')
      : message.replace(/^\w+: /, ''),
  )
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
  return startRsbuildDevServer({ ...args[0], browser: true, hmr: false })
}

/** Policy fixtures declare an HTML client entry instead of a router-rendered page. */
export function startBrowserRsbuildStartDevServer(
  options: Parameters<typeof startRsbuildStartDevServer>[0],
) {
  return startRsbuildStartDevServer({
    ...options,
    browser: true,
    config: mergeRsbuildConfig(options.config ?? {}, {
      plugins: [
        {
          name: 'ip-fixture-html-entry',
          setup(api) {
            api.modifyEnvironmentConfig({
              order: 'post',
              handler(
                config: MergedEnvironmentConfig,
                { name }: ModifyEnvironmentConfigUtils,
              ) {
                if (name === 'client') {
                  const entry = config.source.entry?.index
                  if (
                    entry &&
                    typeof entry === 'object' &&
                    !Array.isArray(entry)
                  ) {
                    entry.html = true
                  }
                }
              },
            })
          },
        },
      ],
    }),
  })
}
