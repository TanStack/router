export interface ClientMemoryWorkload {
  name: string
  before?: () => Promise<void> | void
  run: () => Promise<void> | void
  sanity: () => Promise<void> | void
  warmup?: () => Promise<void> | void
  after?: () => Promise<void> | void
}

export async function warmClientMemoryWorkload(workload: ClientMemoryWorkload) {
  if (!workload.warmup) {
    return
  }

  if (Boolean(workload.before) !== Boolean(workload.after)) {
    throw new Error(
      `Client memory workload ${workload.name} must define both before and after when it defines either hook`,
    )
  }

  await workload.before?.()

  try {
    await workload.warmup()
  } finally {
    await workload.after?.()
  }
}
