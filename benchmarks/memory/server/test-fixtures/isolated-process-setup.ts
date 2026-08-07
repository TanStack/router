import { appendFile } from 'node:fs/promises'

function getLogPath() {
  const logPath = process.env.TSR_MEMORY_ISOLATION_TEST_LOG

  if (!logPath) {
    throw new Error('Missing TSR_MEMORY_ISOLATION_TEST_LOG')
  }

  return logPath
}

async function log(event: string) {
  await appendFile(getLogPath(), `${event}:${process.pid}\n`)
}

export const workloadGroup = {
  sanity: () => log('sanity'),
  warmup: () => log('warmup'),
  workloads: [
    {
      name: 'fixture zero',
      run: () => log('run-0'),
    },
    {
      name: 'fixture one',
      async run() {
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
        await log('run-1-finished')
      },
    },
    {
      name: 'fixture failure',
      run() {
        throw new Error('fixture workload failed')
      },
    },
  ],
}

export const workload = {
  name: 'fixture client',
  sanity: () => log('client-sanity'),
  before: () => log('client-before'),
  warmup: () => log('client-warmup'),
  run: () => log('client-run'),
  after: () => log('client-after'),
}
