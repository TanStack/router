import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IsolatedMemoryProcess } from '../shared/isolated-process.ts'

const setupUrl = new URL(
  './test-fixtures/isolated-process-setup.ts',
  import.meta.url,
)

describe('IsolatedMemoryProcess', () => {
  let logPath: string
  let runner: IsolatedMemoryProcess | undefined
  let tempDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'router-memory-isolation-'))
    logPath = join(tempDirectory, 'events.log')
    await writeFile(logPath, '')
    process.env.TSR_MEMORY_ISOLATION_TEST_LOG = logPath
  })

  afterEach(async () => {
    await runner?.stop()
    delete process.env.TSR_MEMORY_ISOLATION_TEST_LOG
    await rm(tempDirectory, { recursive: true })
  })

  function createRunner(
    workloadNames = ['fixture zero', 'fixture one', 'fixture failure'],
  ) {
    runner = new IsolatedMemoryProcess({
      kind: 'server',
      setupUrl,
      workloadNames,
    })

    return runner
  }

  async function readEvents() {
    return (await readFile(logPath, 'utf8')).trim().split('\n')
  }

  it('starts every invocation in a fresh process and waits for work to finish', async () => {
    const processRunner = createRunner()

    await processRunner.start()
    const firstPid = processRunner.pid
    await processRunner.run(1)

    expect(await readEvents()).toEqual([
      `sanity:${firstPid}`,
      `run-1-finished:${firstPid}`,
    ])

    await processRunner.stop()
    await processRunner.start()
    const secondPid = processRunner.pid
    await processRunner.run(0)

    expect(secondPid).not.toBe(firstPid)
    expect(await readEvents()).toEqual([
      `sanity:${firstPid}`,
      `run-1-finished:${firstPid}`,
      `sanity:${secondPid}`,
      `run-0:${secondPid}`,
    ])
  })

  it('propagates workload failures from the child', async () => {
    const processRunner = createRunner()
    await processRunner.start()

    await expect(processRunner.run(2)).rejects.toThrow(
      'fixture workload failed',
    )
  })

  it('rejects a workload-name mismatch during setup', async () => {
    const processRunner = createRunner(['wrong name'])

    await expect(processRunner.start()).rejects.toThrow(
      'Isolated memory workload names did not match',
    )
    expect(processRunner.pid).toBeUndefined()
  })
})
