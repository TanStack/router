/**
 * A real browser page (Playwright's headless Chromium) for tests of what a
 * dev server serves to a page: the page runs the dev server's own HMR client
 * over its WebSocket, so hot updates, refresh runtimes and full reloads
 * happen as in an app. The test reads the page's DOM and how many times it
 * loaded.
 *
 * One browser per test process, launched on first use, and kept for the
 * process (also across test files when the project does not isolate them).
 * What one process opens in it is bounded (under heavy load,
 * an unbounded number of pages and in-flight module requests made Chromium
 * fail requests with `ERR_INSUFFICIENT_RESOURCES`):
 * - `runInPage` runs on a pool of at most `runPageLimit` pages, which runs
 *   of concurrent tests share; a run beyond that waits for a free page. The
 *   pool and its browser context are the test file's: they close when the
 *   file ended (`closeRunPages`, `./test-scope-setup`), so that a later file
 *   inherits none of their memory (renderers and HTTP cache grew with every
 *   module a page loaded), cache or page state;
 * - `openPage` keeps at most `openPageLimit` pages (each with its own
 *   browser context) open at once; a test asking for more waits until one
 *   closes.
 */
import { SettleTimeout } from './outcome'
import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Page,
} from '@playwright/test'

export interface BrowserPage {
  /** The Playwright page. */
  page: Page
  /**
   * How many times the page loaded (its first load included): a full reload
   * of the page loads it again.
   */
  loads: () => number
  /** Uncaught errors of the page and what it logged with `console.error`. */
  errors: Array<string>
  /** Every console message of the page, as `type: text`, in order. */
  console: Array<string>
  /** Text content of the first element matching `selector` (default `body`). */
  text: (selector?: string) => Promise<string>
  /**
   * Waits until the text content of `selector` (default `body`) matches
   * `expected` (a substring, or a pattern), for at most `timeout` ms
   * (default 15 000). Throws with the page's text, errors and console
   * otherwise.
   */
  waitForText: (
    expected: string | RegExp,
    options?: { selector?: string; timeout?: number },
  ) => Promise<void>
  /** Closes the page and its browser context. */
  close: () => Promise<void>
}

/** Pages `runInPage` runs on in one test process, at most. */
export const runPageLimit = 4
/** Pages `openPage` keeps open in one test process at once, at most. */
export const openPageLimit = 16

/**
 * The Chromium executable to launch, when Playwright's own build cannot run
 * on the platform (Alpine Linux: Playwright ships no musl build; the CI job
 * installs the distribution's Chromium and names it here).
 */
const chromiumExecutable = process.env.TANSTACK_COMPILER_TESTS_CHROMIUM

let browser: Promise<Browser> | undefined

/**
 * The process's browser, launched on first use (Playwright loads then too:
 * every file's setup imports this module); a launch that failed is tried
 * again on the next use.
 */
function launch() {
  if (!browser) {
    const launching = import('@playwright/test').then(({ chromium }) =>
      chromium.launch({
        headless: true,
        ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
      }),
    )
    browser = launching
    launching.catch(() => {
      if (browser === launching) {
        browser = undefined
      }
    })
  }
  return browser
}

/**
 * A counting semaphore: `acquire()` resolves once fewer than `limit` holders
 * hold it (first come, first served), with the function that releases it.
 */
function semaphore(limit: number) {
  let held = 0
  const waiting: Array<() => void> = []
  return async (): Promise<() => void> => {
    if (held >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    } else {
      held++
    }
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      const next = waiting.shift()
      if (next) {
        next()
      } else {
        held--
      }
    }
  }
}

/**
 * Whether a console error is the 404 of the browser's own `/favicon.ico`
 * request, which no test app serves (full Chromium requests it, e.g.
 * Alpine's; Playwright's headless shell does not): not the page's error.
 */
function faviconMiss(message: ConsoleMessage) {
  try {
    return new URL(message.location().url).pathname === '/favicon.ico'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// The run pages: a pool per test file, reused by the file's runs

/** The context of the run pages: one HTTP cache for the file's runs. */
let runContext: Promise<BrowserContext> | undefined
/** Run pages no run holds, ready for the next one (each on `about:blank`). */
const idlePages: Array<Page> = []
const runSlot = semaphore(runPageLimit)
const openSlot = semaphore(openPageLimit)

async function takeRunPage(): Promise<Page> {
  const idle = idlePages.pop()
  if (idle && !idle.isClosed()) {
    return idle
  }
  if (!runContext) {
    const context = launch().then((opened) => opened.newContext())
    runContext = context
    // (a context that failed to open is opened again by the next run)
    context.catch(() => {
      if (runContext === context) {
        runContext = undefined
      }
    })
  }
  return (await runContext).newPage()
}

/**
 * Closes the file's run pages and their context, once no run holds a page
 * (it takes every run slot first); the browser stays for the next file.
 */
export async function closeRunPages() {
  const context = runContext
  if (!context) {
    return
  }
  const releases = await Promise.all(
    Array.from({ length: runPageLimit }, () => runSlot()),
  )
  try {
    if (runContext === context) {
      runContext = undefined
      idlePages.length = 0
    }
    await (await context.catch(() => undefined))?.close()
  } finally {
    for (const release of releases) {
      release()
    }
  }
}

/**
 * Takes a run page off the run's document before the run returns: a page
 * still on an app's document follows its dev server, whose HMR client
 * reloads the page when the server sends a full reload (e.g. after the
 * edit a test makes right after the run). A reload starting while the page
 * leaves the document outlives the navigation to `about:blank`, and then
 * interrupts the next run's navigation (seen under load when this happened
 * after the run returned). A page that
 * cannot leave its document (a script holds it, the renderer crashed) is
 * closed instead.
 */
async function leaveRunDocument(page: Page): Promise<boolean> {
  try {
    await page.goto('about:blank', { timeout: 5000 })
    return true
  } catch {
    await page.close().catch(() => {})
    return false
  }
}

export interface PageRun<T = unknown> {
  /** The JSON value the script returned. */
  result: T
  /** Uncaught errors of the page and its `console.error` output. */
  errors: Array<string>
  /** Every console message of the page during the run, as `type: text`. */
  console: Array<string>
}

/**
 * Runs client code in a real browser, fast: a page of the process's run
 * pages, held by this run alone. The page loads
 * `pageUrl` fresh (a new document: no module or global state of an earlier
 * run survives), then, when `moduleUrl` is given, imports that module as
 * the browser imports a module of the page (real ES module linking: a
 * missing export throws), and runs `script`: the body of an async function
 * with the module's namespace as `module` in scope (and the page's
 * `window`, `document`), whose JSON value is the result. A throw of the
 * import or of the script rejects, with the page's errors and console.
 * Runs of concurrent tests run on different pages at once (at most
 * `runPageLimit`); the run returns once its page left the run's document,
 * so it no longer follows the dev server, and another run gets it.
 *
 * Use it for fast-tier client checks on a dev server's served modules
 * (`./plugin-host`); a test of a whole page across reloads opens its own
 * page (`openPage`).
 */
export async function runInPage<T = unknown>(
  input: PageRunInput,
): Promise<PageRun<T>> {
  const release = await runSlot()
  let page: Page | undefined
  try {
    page = await takeRunPage()
    return await runOnPage<T>(page, input)
  } finally {
    // The run returns once its page left the run's document (see
    // `leaveRunDocument`); then another run may have it
    if (page && (await leaveRunDocument(page))) {
      idlePages.push(page)
    }
    release()
  }
}

export interface PageRunInput {
  pageUrl: string
  moduleUrl?: string
  script?: string
  /**
   * Bounds the page's load, and then the import and the script together,
   * each to this long (default 15 000 ms).
   */
  timeout?: number
}

/**
 * A run of `runInPage` on a page the caller holds, which leaves the run's
 * document itself.
 */
export async function runOnPage<T = unknown>(
  page: Page,
  input: PageRunInput,
): Promise<PageRun<T>> {
  const errors: Array<string> = []
  const messages: Array<string> = []
  const onError = (error: Error) => {
    errors.push(error.stack ?? error.message)
  }
  const onConsole = (message: ConsoleMessage) => {
    messages.push(`${message.type()}: ${message.text()}`)
    if (message.type() === 'error' && !faviconMiss(message)) {
      errors.push(message.text())
    }
  }
  const timeout = input.timeout ?? 15_000
  let timer: ReturnType<typeof setTimeout> | undefined
  page.on('pageerror', onError)
  page.on('console', onConsole)
  try {
    await load(page, input.pageUrl, timeout)
    // A string, run as the page's own code: a function would be
    // serialised from this module as the test runner transformed it
    // (its `import()` rewritten for Node)
    const evaluated = page.evaluate(
      `(async () => {\nconst module = ${
        input.moduleUrl === undefined
          ? 'undefined'
          : `await import(${JSON.stringify(input.moduleUrl)})`
      }\n${input.script ?? ''}\n})()`,
    )
    // An import or a script that never settles must not hold the page (and
    // every later run) forever: the run fails after `timeout`, and leaving
    // the document ends the script.
    evaluated.catch(() => {})
    const result = (await Promise.race([
      evaluated,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new SettleTimeout(
                `the import and script did not settle within ${timeout} ms`,
              ),
            ),
          timeout,
        )
      }),
    ])) as T
    return { result, errors, console: messages }
  } catch (error) {
    throw new Error(
      [
        `the page run of ${input.moduleUrl ?? input.pageUrl} failed: ${(error as Error).message}`,
        `errors:\n${errors.join('\n') || '(none)'}`,
        `console:\n${messages.join('\n') || '(none)'}`,
      ].join('\n'),
      { cause: error },
    )
  } finally {
    clearTimeout(timer)
    page.off('pageerror', onError)
    page.off('console', onConsole)
  }
}

/**
 * Navigates `page` to `url`; a load that runs out of time (Playwright's
 * `timeout`, its default without one) is a `SettleTimeout`.
 */
async function load(page: Page, url: string, timeout?: number) {
  try {
    await page.goto(url, { timeout })
  } catch (error) {
    throw error instanceof Error && error.name === 'TimeoutError'
      ? new SettleTimeout(`the page did not load ${url}: ${error.message}`, {
          cause: error,
        })
      : error
  }
}

/**
 * Opens `url` in a new page of a headless Chromium and resolves once it
 * loaded (after `initScript`, when given, ran first in the page). `close()`
 * closes the page. A page that fails
 * to open is closed before the call rejects.
 */
export async function openPage(
  url: string,
  options: {
    /**
     * Script the page runs before any of its own, on every load (Playwright's
     * `addInitScript`), e.g. to record what the page's code does from its
     * first statement on.
     */
    initScript?: string
    /**
     * The document of `url`, instead of what its server answers (e.g. a page
     * of a dev server that serves no HTML, which loads the client code the
     * dev server serves); the page's other requests reach the server. Not
     * for a check that involves HMR: the given document is
     * none the dev server transformed (no HMR client or refresh preamble it
     * injects), and a dev server's HMR client may not connect from it. Open
     * a document the dev server serves instead (`index.html` of a `browser`
     * dev server, the plugin host's page).
     */
    html?: string
  } = {},
): Promise<BrowserPage> {
  const release = await openSlot()
  let context: BrowserContext
  try {
    context = await (await launch()).newContext()
  } catch (error) {
    release()
    throw error
  }
  let closed: Promise<void> | undefined
  const close = () => {
    closed ??= context.close().finally(release)
    return closed
  }
  let page: Page
  let loads = 0
  const errors: Array<string> = []
  const messages: Array<string> = []
  try {
    if (options.initScript !== undefined) {
      await context.addInitScript(options.initScript)
    }
    const { html } = options
    if (html !== undefined) {
      await context.route(url, (route) =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
    }
    page = await context.newPage()
    page.on('load', () => {
      loads++
    })
    page.on('pageerror', (error) => {
      errors.push(error.stack ?? error.message)
    })
    page.on('console', (message) => {
      messages.push(`${message.type()}: ${message.text()}`)
      if (message.type() === 'error' && !faviconMiss(message)) {
        errors.push(message.text())
      }
    })
    // How many of the page's requests have not finished yet, for page code that
    // waits for the code it requested. A new document ends the old one's
    // requests, whether or not the browser reports them as finished or failed.
    const inFlight = new Set<unknown>()
    page.on('request', (request) => inFlight.add(request))
    page.on('requestfinished', (request) => inFlight.delete(request))
    page.on('requestfailed', (request) => inFlight.delete(request))
    page.on('framenavigated', (frame) => {
      if (frame === frame.page().mainFrame()) {
        inFlight.clear()
      }
    })
    await page.exposeFunction('__harnessInFlight', () => inFlight.size)
    await load(page, url)
  } catch (error) {
    await close().catch(() => {})
    throw error
  }

  const text = async (selector = 'body', timeout?: number) =>
    (await page
      .locator(selector)
      .first()
      .textContent(timeout === undefined ? {} : { timeout })) ?? ''

  return {
    page,
    loads: () => loads,
    errors,
    console: messages,
    text: (selector) => text(selector),
    waitForText: async (expected, waitOptions = {}) => {
      const selector = waitOptions.selector ?? 'body'
      const timeout = waitOptions.timeout ?? 15_000
      const matches = (current: string) =>
        typeof expected === 'string'
          ? current.includes(expected)
          : expected.test(current)
      const deadline = Date.now() + timeout
      let current = ''
      for (;;) {
        try {
          // (within the wait's bound: Playwright's own default is 30 s)
          current = await text(selector, Math.max(1, deadline - Date.now()))
        } catch {
          // The page is reloading
          current = ''
        }
        // (a text read after the bound counts for nothing)
        if (matches(current) && Date.now() <= deadline) {
          return
        }
        if (Date.now() > deadline) {
          throw new SettleTimeout(
            [
              `the page's ${selector} did not show ${String(expected)} within ${timeout} ms`,
              `it shows: ${JSON.stringify(current)}`,
              `page loads: ${loads}`,
              `errors:\n${errors.join('\n') || '(none)'}`,
              `console:\n${messages.join('\n') || '(none)'}`,
            ].join('\n'),
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    },
    close,
  }
}
