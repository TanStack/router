/** compiler-test-utils' `openPage` for a serial test: closed when the test finishes. */
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { closeAtEnd } from './test-end'

export function openTestPage(
  url: string,
  options?: Parameters<typeof openPage>[1],
) {
  return closeAtEnd(
    () => openPage(url, options),
    (page) => page.close(),
  )
}
