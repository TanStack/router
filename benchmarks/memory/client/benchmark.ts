export interface ClientMemoryWorkload {
  name: string
  before?: () => Promise<void> | void
  /**
   * Must be an `async` function: CodSpeed's Vitest 5 provider awaits only
   * `AsyncFunction`s and otherwise measures just the synchronous part.
   */
  run: () => Promise<void> | void
  sanity: () => Promise<void> | void
  after?: () => Promise<void> | void
}
