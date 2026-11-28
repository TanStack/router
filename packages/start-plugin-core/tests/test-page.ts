/** compiler-test-utils' `openPage` for a serial test: closed when the test finishes. */
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'

export function openTestPage(
  url: string,
  options?: Parameters<typeof openPage>[1],
) {
  return closeAtEnd(() => openPage(url, options))
}
