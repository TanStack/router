/**
 * Control tests of run-node.ts: a program run in a child Node process gives
 * its output, fails fast past its timeout naming how far it got, never
 * outlives the process that started it (a test worker killed on a timeout
 * must not leave it spinning), and runs with one watchdog thread, however
 * long it runs.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { runNodeProgram, runNodeStep } from '../../src/run-node'

const runNodeModule = pathToFileURL(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/run-node.ts',
  ),
).href

/** Whether a process is running. */
function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Polls `read` every 50 ms until it returns a value, for `within` ms. */
async function poll<T>(
  read: () => Promise<T | undefined>,
  what: string,
  within = 10_000,
): Promise<T> {
  const deadline = Date.now() + within
  for (;;) {
    const value = await read()
    if (value !== undefined) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error(`${what} within ${within} ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('gives the output of the program', async () => {
  const { stdout } = await runNodeProgram(`process.stdout.write(String(6 * 7))`)
  expect(stdout).toBe('42')
})

test('a program that runs past its timeout is killed, and the run says so', async () => {
  const started = Date.now()
  await expect(
    runNodeProgram(`while (true) {}`, { timeout: 500 }),
  ).rejects.toThrow('the program did not finish within 500 ms')
  expect(Date.now() - started).toBeLessThan(10_000)
}, 20_000)

test('a program stuck on a promise is killed past its timeout, and the run names the step it was in', async () => {
  await expect(
    runNodeProgram(
      `${runNodeStep('waiting for the reply')}await new Promise(() => setInterval(() => {}, 1000))`,
      { timeout: 500 },
    ),
  ).rejects.toThrow(
    /did not finish within 500 ms \(killed\); steps: node started at \d+ ms, waiting for the reply at \d+ ms; no stdout/,
  )
}, 20_000)

test('a program runs with one thread of the harness, however long it runs', async () => {
  // Worker threads nest when each one starts another (Node runs the
  // `--import` modules in every worker thread)
  const { stdout } =
    await runNodeProgram(`await new Promise((resolve) => setTimeout(resolve, 500))
const depth = (report) => Math.max(0, ...(report.workers ?? []).map((worker) => 1 + depth(worker)))
process.stdout.write(String(depth(process.report.getReport())))
`)
  expect(Number(stdout)).toBe(1)
}, 20_000)

test('a program stuck in a synchronous loop dies with the process that started it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'run-node-'))
  const pidFile = path.join(dir, 'pid')
  const program = `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
while (true) {}
`
  // The process that starts the program, killed like a test worker on a
  // timeout (SIGKILL: no exit handler runs)
  const starter = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { runNodeProgram } from ${JSON.stringify(runNodeModule)}
runNodeProgram(${JSON.stringify(program)}, { timeout: 120_000 }).catch(() => {})
`,
    ],
    { stdio: 'ignore' },
  )
  onTestFinished(async () => {
    starter.kill('SIGKILL')
    await rm(dir, { recursive: true, force: true })
  })
  const pid = await poll(
    () =>
      readFile(pidFile, 'utf8').then(
        (text) => (text ? Number(text) : undefined),
        () => undefined,
      ),
    'the program did not start',
  )
  onTestFinished(() => {
    if (isRunning(pid)) {
      process.kill(pid, 'SIGKILL')
    }
  })
  expect(isRunning(pid)).toBe(true)

  starter.kill('SIGKILL')

  await poll(
    () => Promise.resolve(isRunning(pid) ? undefined : true),
    'the program still runs after the process that started it was killed',
  )
  expect(isRunning(pid)).toBe(false)
}, 30_000)
