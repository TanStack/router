/**
 * A real browser page (Playwright's headless Chromium) for tests of what a
 * dev server serves to a page: the page runs the dev server's own HMR client
 * over its WebSocket, so hot updates, refresh runtimes and full reloads
 * happen as in an app. The test reads the page's DOM and how many times it
 * loaded.
 *
 * One browser per test process, launched on first use; each page has its own
 * browser context. `runInPage` reuses one shared page per test process for
 * fast client checks.
 */
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

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

let browser: Promise<Browser> | undefined

function launch() {
  browser ??= chromium.launch({ headless: true })
  return browser
}

// ---------------------------------------------------------------------------
// The shared page: one per test process (one Vitest worker), reused

let shared: Promise<Page> | undefined
/** Runs on the shared page are serialised (concurrent tests take turns). */
let queue: Promise<unknown> = Promise.resolve()

function sharedPage() {
  shared ??= (async () => (await (await launch()).newContext()).newPage())()
  return shared
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
 * Runs client code in a real browser, fast: one Chromium page per test
 * process, reused (N24; RULES-AUDIT R24). The page loads `pageUrl` fresh
 * (a new document: no module or global state of an earlier run survives),
 * then, when `moduleUrl` is given, imports that module as the browser
 * imports a module of the page (real ES module linking: a missing export
 * throws), and runs `script`: the body of an async function with the
 * module's namespace as `module` in scope (and the page's `window`,
 * `document`), whose JSON value is the result. A throw of the import or
 * of the script rejects, with the page's errors and console.
 *
 * Use it for fast-tier client checks on a dev server's served modules
 * (`./plugin-host`); a test of a whole page across reloads opens its own
 * page (`openPage`).
 */
export function runInPage<T = unknown>(input: {
  pageUrl: string
  moduleUrl?: string
  script?: string
  /** Waits for the run at most this long (default 15 000 ms). */
  timeout?: number
}): Promise<PageRun<T>> {
  const run = queue.then(async () => {
    const page = await sharedPage()
    const errors: Array<string> = []
    const messages: Array<string> = []
    const onError = (error: Error) => {
      errors.push(error.stack ?? error.message)
    }
    const onConsole = (message: { type: () => string; text: () => string }) => {
      messages.push(`${message.type()}: ${message.text()}`)
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    }
    page.on('pageerror', onError)
    page.on('console', onConsole)
    const timeout = input.timeout ?? 15_000
    try {
      await page.goto(input.pageUrl, { timeout })
      // A string, run as the page's own code: a function would be
      // serialised from this module as the test runner transformed it
      // (its `import()` rewritten for Node)
      const result = (await page.evaluate(
        `(async () => {\nconst module = ${
          input.moduleUrl === undefined
            ? 'undefined'
            : `await import(${JSON.stringify(input.moduleUrl)})`
        }\n${input.script ?? ''}\n})()`,
      )) as T
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
      page.off('pageerror', onError)
      page.off('console', onConsole)
    }
  })
  queue = run.catch(() => {})
  return run
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
     * dev server serves); the page's other requests reach the server.
     */
    html?: string
  } = {},
): Promise<BrowserPage> {
  const context = await (await launch()).newContext()
  if (options.initScript !== undefined) {
    await context.addInitScript(options.initScript)
  }
  const { html } = options
  if (html !== undefined) {
    await context.route(url, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
  }
  let closed: Promise<void> | undefined
  const close = () => {
    closed ??= context.close()
    return closed
  }
  options.registerCleanup?.(close)
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
    if (message.type() === 'error') {
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
