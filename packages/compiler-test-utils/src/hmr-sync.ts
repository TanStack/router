/**
 * The requests a page of a dev server has in flight (an update's modules, a
 * reload's document): a page with any is not settled yet.
 */
import type { BrowserPage } from './browser'

/** The page's requests in flight, from now on. */
export function trackRequests(browser: BrowserPage) {
  const inFlight = new Set<unknown>()
  browser.page.on('request', (request) => inFlight.add(request))
  browser.page.on('requestfinished', (request) => inFlight.delete(request))
  browser.page.on('requestfailed', (request) => inFlight.delete(request))
  // A new document (a reload) ends the old one's requests
  browser.page.on('framenavigated', (frame) => {
    if (frame === browser.page.mainFrame()) {
      inFlight.clear()
    }
  })
  return () => inFlight.size
}
