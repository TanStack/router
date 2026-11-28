/**
 * The serial openers' close (TEST-TOOLS-DESIGN.md, Decision B): `close`
 * (default: the opened resource's `close()`) is registered with Vitest's
 * global `onTestFinished` before the start begins, so what a test began to
 * open closes with it; called outside a test, it throws before anything
 * starts. Concurrent files use the fixtures of `./test` instead.
 */
import { onTestFinished } from 'vitest'

export function closeAtEnd<T extends { close: () => unknown }>(
  start: () => Promise<T>,
): Promise<T>
export function closeAtEnd<T>(
  start: () => Promise<T>,
  close: (opened: T) => unknown,
): Promise<T>
export function closeAtEnd(
  start: () => Promise<any>,
  close = (opened: any) => opened.close(),
) {
  const opened: { starting?: Promise<unknown> } = {}
  onTestFinished(async () => {
    await opened.starting?.then(close, () => {})
  })
  opened.starting = start()
  return opened.starting
}
