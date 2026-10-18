/**
 * A real browser page (Playwright's headless Chromium) for tests of what a
 * dev server serves to a page: the page runs the dev server's own HMR client
 * over its WebSocket, so hot updates, refresh runtimes and full reloads
 * happen as in an app. The test reads the page's DOM and how many times it
 * loaded.
 *
 * One browser per test process, launched on first use; each page has its own
 * browser context.
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

/**
 * Opens `url` in a new page of a headless Chromium and resolves once it
 * loaded. `close()`, which `registerCleanup` also receives, closes the page.
 */
export async function openPage(
  url: string,
  options: { registerCleanup?: (cleanup: () => Promise<void>) => void } = {},
): Promise<BrowserPage> {
  const context = await (await launch()).newContext()
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
