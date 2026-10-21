/**
 * Rsbuild dev-server harness of the Start compiler: an Rsbuild dev server
 * with Start's whole Rsbuild plugin, the BUILT public entry of this package
 * (`tanStackStartRsbuild` of `@tanstack/start-plugin-core/rsbuild`, with the
 * options `@tanstack/react-start` passes: client and SSR environments, SSR
 * as the server fn provider), on a temporary app, through the shared Rsbuild
 * dev-server harness (`@tanstack/compiler-test-utils/rsbuild-dev-server`).
 * Rspack loads Start's loaders from the package, as in an installed app.
 * `@tanstack/react-start` is the real package (`startRuntimeLinks` of the
 * build harness). `runInClient()` and `runRsbuildClient()` run the emitted
 * client code in a real browser page of the dev server (started with
 * `clientPage`). The temporary apps live in this directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { onTestFinished } from 'vitest'
import { tanStackStartRsbuild } from '@tanstack/start-plugin-core/rsbuild'
import { startRuntimeLinks } from './build-harness'
import type {
  StartCompilerImportTransform,
  TanStackStartInputConfig,
} from '../src'
import type { TanStackStartRsbuildInputConfig } from '../src/rsbuild'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Starts an Rsbuild dev server with Start's whole Rsbuild plugin
 * (`startRsbuildStartDevServer`) on an app of `files` (its entry
 * `src/entry.ts`), with Start's `importProtection` option and its
 * `serverFns.generateFunctionId` option when given: the import-protection
 * and server fn tests' shorthand of `start`.
 */
export function startRsbuildDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    importProtection?: TanStackStartInputConfig['importProtection']
    /** Start's `serverFns.generateFunctionId` option. */
    generateFunctionId?: NonNullable<
      TanStackStartInputConfig['serverFns']
    >['generateFunctionId']
  },
): Promise<RsbuildDevServer> {
  const { importProtection, generateFunctionId, ...devServerOptions } = options
  return startRsbuildStartDevServer({
    ...devServerOptions,
    start: {
      ...(importProtection && { importProtection }),
      ...(generateFunctionId && { serverFns: { generateFunctionId } }),
    },
  })
}

/**
 * What a page loads to start the app: the initial JavaScript files of the
 * `client` environment's entry, by URL path on the dev server, as its last
 * compile emitted them, and whether they are ES modules.
 */
interface ClientEntry {
  files: Array<string>
  module: boolean
}

const clientEntries = new WeakMap<object, ClientEntry>()

function withClientEntry(server: RsbuildDevServer, entry: ClientEntry) {
  clientEntries.set(server, entry)
  return server
}

/**
 * The initial JavaScript files of the `client` environment's entry as its
 * last compile emitted them (Rspack's stats entrypoints, the configured
 * input), relative to the client output directory: the files a page loads
 * first. A dev server of this harness only.
 */
export function clientEntryFiles(
  server: Pick<RsbuildDevServer, 'url'>,
): Array<string> {
  const entry = clientEntries.get(server)
  if (!entry) {
    throw new Error('not a dev server of this harness')
  }
  return entry.files.map((file) => file.replace(/^\/+/, ''))
}

/**
 * The errors a dev server reported on every channel (the compilations, the
 * console, the process streams; SPEC §5.7) since `since` (a length of its
 * `diagnostics`), by text: what "nothing failed" reads.
 */
export function reportedErrors(
  server: Pick<RsbuildDevServer, 'diagnostics'>,
  since = 0,
): Array<string> {
  return server.diagnostics
    .slice(since)
    .filter(({ severity }) => severity === 'error')
    .map(({ text }) => text)
}

/**
 * Records the `ClientEntry` of each compile of the `client` environment,
 * from Rspack's stats (its entrypoints and public path).
 */
function recordClientEntry(entry: ClientEntry): RsbuildPlugin {
  return {
    name: 'test:client-entry',
    setup(api) {
      api.onAfterEnvironmentCompile(({ stats, environment }) => {
        if (environment.name !== 'client' || !stats) {
          return
        }
        const json = stats.toJson({
          all: false,
          entrypoints: true,
          publicPath: true,
        })
        const publicPath =
          json.publicPath && json.publicPath !== 'auto' ? json.publicPath : '/'
        entry.files = Object.values(json.entrypoints ?? {})
          .flatMap((entrypoint) => entrypoint.assets ?? [])
          .map((asset) => asset.name)
          .filter((name) => /\.[cm]?js$/.test(name))
          .map((name) => `${publicPath.replace(/\/?$/, '/')}${name}`)
        entry.module = environment.config.output.module === true
      })
    },
  }
}

/**
 * Starts an Rsbuild dev server with Start's whole Rsbuild plugin
 * (`tanStackStartRsbuild`, with the options `@tanstack/react-start` passes):
 * client and SSR environments, SSR as the server fn provider, and the
 * generated server fn resolver. Both entries import `src/entry.ts`; the
 * server entry is Start's default one (`@tanstack/react-start/server-entry`,
 * the app's HTTP handler, which reaches the server fns through Start's own
 * resolver). `src/router.ts` and `src/routes/__root.tsx` are stubs unless
 * the app has them. With `framework: 'solid'`, Start's plugin gets the
 * Solid framework and the built `@tanstack/solid-start` and
 * `@tanstack/solid-router` are linked (Solid's JSX plugins come from
 * `config`).
 */
export function startRsbuildStartDevServer(
  options: Omit<RsbuildDevServerOptions, 'dir' | 'plugins'> & {
    /**
     * External import transforms of the Start compiler, which a framework
     * package passes to Start's plugin (e.g. React's RSC CSS transform).
     */
    compilerTransforms?: Array<StartCompilerImportTransform>
    /** The app's Start options (`tanStackStart(options)`). */
    start?: TanStackStartRsbuildInputConfig
    /** The Start framework package of the app (default `react`). */
    framework?: 'react' | 'solid'
  },
): Promise<RsbuildDevServer> {
  const {
    files,
    compilerTransforms,
    start,
    framework = 'react',
    ...devServerOptions
  } = options
  const entry: ClientEntry = { files: [], module: false }
  return createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.start-rsbuild-start-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    symlinks: {
      ...startRuntimeLinks(),
      ...(framework === 'solid' &&
        workspacePackageLinks([
          '@tanstack/solid-start',
          '@tanstack/solid-router',
        ])),
      ...devServerOptions.symlinks,
    },
    files: {
      'harness/client-entry.ts': `import '../src/entry'\n`,
      'harness/server-entry.ts': `import '../src/entry'
export { default } from '@tanstack/${framework}-start/server-entry'
`,
      'harness/start.ts': `export const startInstance = undefined\n`,
      'src/router.ts': `export const getRouter = () => undefined\n`,
      'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
      ...files,
    },
    plugins: ({ root }) => [
      tanStackStartRsbuild(
        {
          framework,
          defaultEntryPaths: {
            client: path.join(root, 'harness/client-entry.ts'),
            server: path.join(root, 'harness/server-entry.ts'),
            start: path.join(root, 'harness/start.ts'),
          },
          providerEnvironmentName: 'ssr',
          ssrIsProvider: true,
          compilerTransforms,
        },
        start,
      ),
      recordClientEntry(entry),
    ],
  }).then((server) => withClientEntry(server, entry))
}

/**
 * Options of a dev server whose client code a test runs (`runInClient`,
 * `runRsbuildClient`): the dev server serves the app to real browser pages
 * over HTTP (`browser`), without HMR, as the other tests of its output
 * expect (a test of hot updates sets `hmr: true` after these).
 */
export const clientPage = { browser: true, hmr: false } as const

/**
 * Runs in the page before its own code: records what the page's code logs
 * through `console` (by method; an argument with a `message`, e.g. an
 * error, by its message) and the errors it does not catch.
 */
const recorderScript = `(() => {
  const text = (arg) =>
    typeof arg === 'object' && arg !== null && 'message' in arg
      ? String(arg.message)
      : String(arg)
  const calls = []
  const uncaught = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level].bind(console)
    console[level] = (...args) => {
      calls.push({ level, text: args.map(text).join(' ') })
      original(...args)
    }
  }
  addEventListener('error', (event) => {
    uncaught.push(text(event.error ?? event.message))
  })
  addEventListener('unhandledrejection', (event) => {
    uncaught.push(text(event.reason))
  })
  Object.defineProperty(globalThis, '__clientRun', {
    value: { calls, uncaught },
  })
})()`

export interface ClientRun {
  calls: Array<{ level: string; text: string }>
  uncaught: Array<string>
}

/** A page `withRecordedPage` opened, recording from its first statement on. */
export interface RecordedPage {
  page: BrowserPage['page']
  /** What the page's code logged and did not catch so far. */
  record: () => Promise<ClientRun>
  /**
   * Waits a turn of the page's event loop (what its load scheduled ran),
   * then rejects with the errors the page's code did not catch so far.
   */
  settled: () => Promise<void>
}

/** Throws the errors the page's code did not catch so far, if any. */
export function throwUncaught({ uncaught }: Pick<ClientRun, 'uncaught'>) {
  if (uncaught.length > 0) {
    throw new Error(
      `the client code threw while the page loaded:\n${uncaught.join('\n')}`,
    )
  }
}

/**
 * The one client runner of the Start dev-server tests (Vite and Rsbuild):
 * opens `url` in a real browser (Chromium) page that records what its code
 * logs through `console` and the errors it does not catch, from its first
 * statement on (`recorderScript`), runs `run` on it and closes it. `html`:
 * the document of `url` instead of what the server answers.
 */
export async function withRecordedPage<T>(
  url: string,
  options: { html?: string },
  run: (page: RecordedPage) => Promise<T>,
): Promise<T> {
  const browser = await openPage(url, {
    initScript: recorderScript,
    html: options.html,
  })
  const record = () =>
    browser.page.evaluate<ClientRun>('globalThis.__clientRun')
  try {
    return await run({
      page: browser.page,
      record,
      settled: async () => {
        throwUncaught(
          await browser.page.evaluate<ClientRun>(
            `new Promise((resolve) => setTimeout(() => resolve(globalThis.__clientRun)))`,
          ),
        )
      },
    })
  } finally {
    await browser.close()
  }
}

/**
 * Opens a page of a dev server started with `clientPage` (by this harness)
 * (`withRecordedPage`), runs `run` on it once it loaded, and closes it. The
 * page's document loads the initial files of the `client` environment's
 * entry from the dev server, in order, as the HTML of an app does (Start's
 * dev server renders the app's HTML with its server entry, which the
 * harness's apps do not have). Rejects with the errors the page's code did
 * not catch while the page loaded, and when a file did not load.
 */
async function withClientPage<T>(
  server: Pick<RsbuildDevServer, 'url'>,
  run: (page: RecordedPage) => Promise<T>,
): Promise<T> {
  const entry = clientEntries.get(server)
  if (server.url === undefined || !entry) {
    throw new Error(
      'the client code runs in a browser page: start the dev server with `clientPage`, through this harness',
    )
  }
  if (entry.files.length === 0) {
    throw new Error('the client environment emitted no entry file')
  }
  const scripts = entry.files
    .map(
      (file) =>
        `<script src="${file}"${entry.module ? ' type="module"' : ''} onerror="__clientRun.uncaught.push('could not load ' + this.src)"></script>`,
    )
    .join('\n')
  return withRecordedPage(
    new URL('/__client-run', server.url).href,
    {
      html: `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body><div id="root"></div>
${scripts}
</body></html>`,
    },
    async (page) => {
      await page.settled()
      return run(page)
    },
  )
}

/**
 * Runs `script` (the body of an async function) in the page of the dev
 * server (`withClientPage`; the server started with `clientPage`), once the
 * page loaded the client code. Returns what the script returns (`result`:
 * plain data the page hands over), or the message of what it throws
 * (`error`). (A script must not await an import-protection mock: the mock
 * is a thenable that resolves to itself, which never settles.)
 */
export function runInClient(
  server: Pick<RsbuildDevServer, 'url'>,
  script: string,
): Promise<{ result: unknown } | { error: string }> {
  return withClientPage(server, ({ page }) =>
    page.evaluate<{ result: unknown } | { error: string }>(`(async () => {
  try {
    return { result: await (async () => {\n${script}\n})() }
  } catch (error) {
    return {
      error:
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error),
    }
  }
})()`),
  )
}

/**
 * Loads the client code in the page of the dev server (`withClientPage`; the
 * server started with `clientPage`) and returns what the page's code logged
 * to the console meanwhile, one message per call (an argument with a
 * `message`, e.g. an error, by its message), each prefixed with its console
 * method (`warn: ...`) when `options.levels`.
 */
export function runRsbuildClient(
  server: Pick<RsbuildDevServer, 'url'>,
  options: { levels?: boolean } = {},
): Promise<Array<string>> {
  return withClientPage(server, async ({ record }) => {
    const { calls } = await record()
    return calls.map(
      ({ level, text }) => (options.levels ? `${level}: ` : '') + text,
    )
  })
}
