import process from 'node:process'
import type {
  IsolatedMemoryBenchmarkKind,
  IsolatedMemoryChildMessage,
  IsolatedMemoryParentMessage,
} from './isolated-process.ts'
import type { ClientMemoryWorkload } from '../client/benchmark.ts'
import type { ServerMemoryWorkloadGroup } from '../server/benchmark.ts'

type RunnableWorkload = {
  name: string
  run: () => Promise<void> | void
}

type LoadedWorkloads = {
  cleanup: () => Promise<void>
  workloads: Array<RunnableWorkload>
}

const preparationSettleTurns = 16
const completionSettleTurns = 4

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
    name: 'Error',
  }
}

function isParentMessage(value: unknown): value is IsolatedMemoryParentMessage {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    !('requestId' in value) ||
    typeof value.requestId !== 'number'
  ) {
    return false
  }

  if (value.type === 'stop') {
    return true
  }

  return (
    value.type === 'run' &&
    'workloadIndex' in value &&
    typeof value.workloadIndex === 'number'
  )
}

function send(message: IsolatedMemoryChildMessage) {
  return new Promise<void>((resolve, reject) => {
    if (!process.send) {
      reject(new Error('The isolated memory process requires an IPC channel'))
      return
    }

    process.send(message, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

async function settle(turns: number) {
  for (let turn = 0; turn < turns; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

async function prepareForMeasurement() {
  await settle(preparationSettleTurns)

  if (!globalThis.gc) {
    throw new Error('The isolated memory process requires --expose-gc')
  }

  globalThis.gc()
  await settle(1)
  globalThis.gc()
  await settle(1)
}

function isClientMemoryWorkload(value: unknown): value is ClientMemoryWorkload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    typeof value.run === 'function' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'sanity' in value &&
    typeof value.sanity === 'function'
  )
}

function isServerMemoryWorkloadGroup(
  value: unknown,
): value is ServerMemoryWorkloadGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sanity' in value &&
    typeof value.sanity === 'function' &&
    'workloads' in value &&
    Array.isArray(value.workloads) &&
    value.workloads.every(
      (workload) =>
        typeof workload === 'object' &&
        workload !== null &&
        'run' in workload &&
        typeof workload.run === 'function' &&
        'name' in workload &&
        typeof workload.name === 'string',
    )
  )
}

async function loadClientWorkload(setupUrl: string): Promise<LoadedWorkloads> {
  const { window } = await import('../client/jsdom.ts')
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
    writable: true,
  })

  let workload: ClientMemoryWorkload | undefined

  try {
    const setupModule = (await import(setupUrl)) as { workload?: unknown }

    if (!isClientMemoryWorkload(setupModule.workload)) {
      throw new Error(`Expected ${setupUrl} to export a client workload`)
    }

    workload = setupModule.workload
    await workload.sanity()
    await workload.before?.()
    await prepareForMeasurement()

    return {
      workloads: [workload],
      async cleanup() {
        try {
          await workload?.after?.()
        } finally {
          window.close()
        }
      },
    }
  } catch (error) {
    try {
      await workload?.after?.()
    } finally {
      window.close()
    }

    throw error
  }
}

async function loadServerWorkloads(setupUrl: string): Promise<LoadedWorkloads> {
  const setupModule = (await import(setupUrl)) as { workloadGroup?: unknown }

  if (!isServerMemoryWorkloadGroup(setupModule.workloadGroup)) {
    throw new Error(`Expected ${setupUrl} to export a server workload group`)
  }

  const workloadGroup = setupModule.workloadGroup
  await workloadGroup.sanity()
  await prepareForMeasurement()

  return {
    workloads: workloadGroup.workloads,
    async cleanup() {},
  }
}

function parseKind(value: string | undefined): IsolatedMemoryBenchmarkKind {
  if (value === 'client' || value === 'server') {
    return value
  }

  throw new Error(`Invalid isolated memory benchmark kind: ${value}`)
}

async function main() {
  const kind = parseKind(process.argv[2])
  const setupUrl = process.argv[3]

  if (!setupUrl) {
    throw new Error('Missing isolated memory benchmark setup URL')
  }

  const loaded =
    kind === 'client'
      ? await loadClientWorkload(setupUrl)
      : await loadServerWorkloads(setupUrl)

  let commandQueue = Promise.resolve()
  let stopping = false

  process.on('message', (value: unknown) => {
    if (stopping || !isParentMessage(value)) {
      return
    }

    const message = value

    commandQueue = commandQueue.then(async () => {
      try {
        if (message.type === 'run') {
          const workload = loaded.workloads[message.workloadIndex]

          if (!workload) {
            throw new Error(
              `Invalid isolated memory workload index ${message.workloadIndex}`,
            )
          }

          await workload.run()
          await settle(completionSettleTurns)
          await send({ type: 'complete', requestId: message.requestId })
          return
        }

        stopping = true
        await loaded.cleanup()
        await send({ type: 'stopped', requestId: message.requestId })
        process.exit(0)
      } catch (error) {
        await send({
          type: 'error',
          requestId: message.requestId,
          error: serializeError(error),
        })
      }
    })
  })

  process.on('disconnect', () => {
    process.exit(1)
  })

  await send({
    type: 'ready',
    workloadNames: loaded.workloads.map((workload) => workload.name),
  })
}

try {
  await main()
} catch (error) {
  await send({ type: 'error', error: serializeError(error) }).catch(() => {})
  process.exit(1)
}
