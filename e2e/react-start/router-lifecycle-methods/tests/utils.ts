import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Hydration is complete once the ClientOnly status block rendered and the router is idle. */
export async function awaitHydrated(page: Page) {
  await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
  await expect(page.getByTestId('router-status')).toHaveText('idle')
  await expect(page.getByTestId('router-isLoading')).toHaveText('false')
}

/**
 * React reports hydration problems through these messages (dev and minified:
 * #418 mismatch, #423 error while hydrating, #425 text mismatch). The pattern
 * is deliberately narrower than /hydrat/ so a stack frame such as
 * "at hydrate (...)" of an expected codec error does not count.
 */
export const hydrationErrorPattern =
  /Hydration failed|while hydrating|did not match|server rendered HTML|Minified React error #(418|423|425)\b/i

/** Collect console errors and page errors on both channels React may use. */
export function collectErrors(page: Page): Array<string> {
  const errors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}

/** Client-side run counters kept by src/utils/origin.ts. */
export function readClientRuns(page: Page) {
  return page.evaluate(
    () => ((globalThis as any).__tsrE2eRuns ?? {}) as Record<string, number>,
  )
}

/**
 * The hydration payload of an SSR response: the bodies of every inline
 * `<script>` that writes the `$_TSR` global (bootstrap, `$_TSR.router=` and
 * any streamed `$_TSR.p(...)` chunk), joined. Components of `ssr: 'data-only'`
 * routes are not server-rendered, so a lifecycle value can only reach the HTML
 * through this payload.
 */
export function hydrationPayload(html: string): string {
  const scripts: Array<string> = []
  const scriptTag = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g
  let match: RegExpExecArray | null
  while ((match = scriptTag.exec(html)) !== null) {
    const body = match[1]!
    if (body.includes('$_TSR')) {
      scripts.push(body)
    }
  }
  return scripts.join('\n')
}
