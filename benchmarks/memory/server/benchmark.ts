export interface ServerMemoryBench {
  name: string
  run: () => Promise<void> | void
}

export interface ServerMemoryBenchmark {
  sanity: () => Promise<void> | void
  run: () => Promise<void> | void
  benches: Array<ServerMemoryBench>
}
