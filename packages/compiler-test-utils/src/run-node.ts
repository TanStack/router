/**
 * Runs an ES module program in a child Node process (`node --eval`), for
 * tests that execute built output outside the test worker. The child never
 * outlives the test worker:
 * - it is killed when it runs longer than `timeout` (the run then fails with
 *   a clear error instead of hanging the test until its timeout);
 * - a watchdog thread inside the child kills it as soon as the process that
 *   started it is gone (e.g. a vitest worker killed on a timeout), even
 *   while the program's own thread is stuck in a synchronous loop.
 */
import { execFile } from 'node:child_process'

export interface RunNodeOptions {
  /** Node options placed before the program (e.g. `--enable-source-maps`). */
  nodeArgs?: Array<string>
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** How long the program may run, in milliseconds. Default 30 000. */
  timeout?: number
}

export interface RunNodeResult {
  stdout: string
  stderr: string
}

/** The error a failed run rejects with. */
export interface RunNodeError extends Error {
  stdout: string
  stderr: string
}

/**
 * A module run before the program (`--import`): a thread that kills the
 * process once its parent process (`parentPid`) is gone.
 */
function watchdog(parentPid: number) {
  const thread = `const parent = ${parentPid}
setInterval(() => {
  if (process.ppid !== parent) {
    process.kill(process.pid, 'SIGKILL')
  }
}, 250)`
  const module = `import { Worker } from 'node:worker_threads'
new Worker(${JSON.stringify(thread)}, { eval: true }).unref()
`
  return `data:text/javascript,${encodeURIComponent(module)}`
}

/** Runs `program` (an ES module) with Node; resolves with its output. */
export function runNodeProgram(
  program: string,
  options: RunNodeOptions = {},
): Promise<RunNodeResult> {
  const timeout = options.timeout ?? 30_000
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        ...(options.nodeArgs ?? []),
        '--import',
        watchdog(process.pid),
        '--input-type=module',
        '--eval',
        program,
      ],
      {
        cwd: options.cwd,
        env: options.env,
        // (the largest stdout/stderr accepted)
        maxBuffer: 64 * 1024 * 1024,
        timeout,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr })
          return
        }
        const timedOut = error.killed && error.signal === 'SIGKILL'
        const failure = new Error(
          timedOut
            ? `the program did not finish within ${timeout} ms (killed)`
            : error.message,
          { cause: error },
        ) as RunNodeError
        failure.stdout = stdout
        failure.stderr = stderr
        reject(failure)
      },
    )
  })
}
