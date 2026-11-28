/**
 * The close of a file's resource, which a hook (or the first test that needs
 * it) opens: `closeAfterAll()`, called in the file or `describe` body,
 * registers the `afterAll` that closes what the function it returns starts,
 * once that settles (Vitest drops an `afterAll` registered while a hook
 * runs). A failed start closes what it opened itself.
 */
import { afterAll } from 'vitest'

export function closeAfterAll() {
  let starting: Promise<{ close: () => unknown }> | undefined
  afterAll(async () => {
    await starting?.then(
      (opened) => opened.close(),
      () => {},
    )
  })
  return <T extends { close: () => unknown }>(
    start: () => Promise<T>,
  ): Promise<T> => {
    if (starting) {
      throw new Error('closeAfterAll() closes one resource: call it again')
    }
    const started = start()
    starting = started
    return started
  }
}
