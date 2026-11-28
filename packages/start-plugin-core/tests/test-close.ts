/**
 * How the harnesses' openers close what they open. A serial test's opener
 * (`startDevServer`, `buildStart`, `openTestPage`…) registers its close with
 * Vitest's global `onTestFinished` when it is called, while the calling test
 * is current, before it awaits anything: a start still running when the
 * test ends (a timeout) closes once it settles. The `*Shared` twins, for
 * what a hook opens for several tests, register nothing: the hook closes it.
 * Either way a start that fails closes what it had opened.
 */
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { onTestFinished } from 'vitest'

/**
 * What `open` opens. Its `close` also runs, newest first, every close
 * `open` registers (its harness's `registerCleanup`: a restart registers
 * the new server's); opening that fails runs them.
 */
export async function closedOnFailure<T extends { close: () => Promise<void> }>(
  open: (register: (close: () => Promise<void>) => void) => Promise<T>,
): Promise<T> {
  const closes: Array<() => Promise<void>> = []
  const closeRegistered = async () => {
    for (const close of closes.splice(0).reverse()) {
      await close()
    }
  }
  try {
    const opened = await open((close) => closes.push(close))
    const own = opened.close
    return Object.assign(opened, {
      close: async () => {
        await closeRegistered()
        await own()
      },
    })
  } catch (error) {
    await closeRegistered()
    throw error
  }
}

/** `closedOnFailure(open)`, closed when the current test finishes. */
export function closedWithTest<T extends { close: () => Promise<void> }>(
  open: (register: (close: () => Promise<void>) => void) => Promise<T>,
): Promise<T> {
  const starting = closedOnFailure(open)
  onTestFinished(() =>
    starting.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  return starting
}

/** compiler-test-utils' `openPage`, closed when the current test finishes. */
export function openTestPage(
  url: string,
  options: Omit<
    NonNullable<Parameters<typeof openPage>[1]>,
    'registerCleanup'
  > = {},
) {
  return closedWithTest((register) =>
    openPage(url, { ...options, registerCleanup: register }),
  )
}
