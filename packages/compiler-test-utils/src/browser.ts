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
 *   of concurrent tests share; a run beyond that waits for a free page;
 * - `openPage` keeps at most `openPageLimit` pages (each with its own
 *   browser context) open at once; a test asking for more waits until one
 *   closes.
 */
import { chromium } from '@playwright/test'
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

function launch() {
  browser ??= chromium.launch({
    headless: true,
    ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
  })
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
// The run pages: a pool per test process (one Vitest worker), reused

/** The context of the run pages: one HTTP cache for every run. */
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
  runContext ??= launch().then((opened) => opened.newContext())
  return (await runContext).newPage()
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
export async function runInPage<T = unknown>(input: {
  pageUrl: string
  moduleUrl?: string
  script?: string
  /**
   * Bounds the page's load, and then the import and the script together,
   * each to this long (default 15 000 ms).
   */
  timeout?: number
}): Promise<PageRun<T>> {
  const release = await runSlot()
  let page: Page | undefined
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
  try {
    page = await takeRunPage()
    page.on('pageerror', onError)
    page.on('console', onConsole)
    await page.goto(input.pageUrl, { timeout })
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
              new Error(
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
    if (page) {
      page.off('pageerror', onError)
      page.off('console', onConsole)
      // The run returns once its page left the run's document (see
      // `leaveRunDocument`); then another run may have it
      if (await leaveRunDocument(page)) {
        idlePages.push(page)
      }
    }
    release()
  }
}

/**
 * Opens `url` in a new page of a headless Chromium and resolves once it
 * loaded (after `initScript`, when given, ran first in the page). `close()`,
 * which `registerCleanup` also receives, closes the page.
 */
export async function openPage(
  url: string,
  options: {
    registerCleanup?: (cleanup: () => Promise<void>) => void
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
  options.registerCleanup?.(close)
  if (options.initScript !== undefined) {
    await context.addInitScript(options.initScript)
  }
  const { html } = options
  if (html !== undefined) {
    await context.route(url, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
  }
  const page = await context.newPage()
  let loads = 0
  const errors: Array<string> = []
  const messages: Array<string> = []
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
  await page.goto(url)

  const text = async (selector = 'body') =>
    (await page.locator(selector).first().textContent()) ?? ''

  return {
    page,
    loads: () => loads,
    errors,
    console: messages,
    text,
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
          current = await text(selector)
        } catch {
          // The page is reloading
          current = ''
        }
        if (matches(current)) {
          return
        }
        if (Date.now() > deadline) {
          throw new Error(
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
