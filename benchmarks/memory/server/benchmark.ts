export interface ServerMemoryWorkload {
  name: string
  /**
   * Must be an `async` function: CodSpeed's Vitest 5 provider awaits only
   * `AsyncFunction`s and otherwise measures just the synchronous part.
   */
  run: () => Promise<void> | void
}

export interface ServerMemoryWorkloadGroup {
  sanity: () => Promise<void> | void
  workloads: Array<ServerMemoryWorkload>
}
