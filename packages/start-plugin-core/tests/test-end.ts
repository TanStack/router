/**
 * The serial openers' close (TEST-TOOLS-DESIGN.md, Decision B): registered
 * with Vitest's global `onTestFinished` before the start begins, while the
 * calling test runs, so what a test began to open closes with it; called
 * outside a test, it throws before anything starts.
 */
import { onTestFinished } from 'vitest'

export function closeAtEnd<T>(
  start: () => Promise<T>,
  close: (opened: T) => unknown,
): Promise<T> {
  const opened: { starting?: Promise<T> } = {}
  onTestFinished(async () => {
    await opened.starting?.then(close, () => {})
  })
  opened.starting = start()
  return opened.starting
}
