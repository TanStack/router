/**
 * Runs an ES module program in a child Node process (`node --eval`), for
 * tests that execute built output outside the test worker. The child never
 * outlives the test worker:
 * - it is killed when it runs longer than `timeout` (the run then fails with
 *   a clear error instead of hanging the test until its timeout): the error
 *   says how far the program got (the steps it marked with `runNodeStep`,
 *   whether it wrote to stdout, whether the process exited);
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
  /**
   * How long the program may run, in milliseconds. Default 25 000: below
   * the 30 s `testTimeout` of the tiers that run programs, so that a stuck
   * run fails with what it was waiting for, not with the test's timeout.
   */
  timeout?: number
}

export interface RunNodeResult {
  stdout: string
}

/** The error a failed run rejects with. */
export interface RunNodeError extends Error {
  stdout: string
  stderr: string
}

/** The global (`Symbol.for`) of the child's step marker. */
const stepKey = 'tanstack.run-node.step'
/** Prefix of a step line on the child's stderr (left out of `stderr`). */
const stepPrefix = '[run-node step] '

/**
 * A statement of a program that marks the step it starts (`name`): a run
 * that times out names the last step reached and when each began.
 */
export const runNodeStep = (name: string) =>
  `globalThis[Symbol.for(${JSON.stringify(stepKey)})]?.(${JSON.stringify(name)})\n`

/**
 * A module run before the program (`--import`): a thread that kills the
 * process once its parent process (`parentPid`) is gone, and the step
 * marker (`runNodeStep`), whose first step says Node has started.
 */
function watchdog(parentPid: number) {
  const thread = `const parent = ${parentPid}
setInterval(() => {
  if (process.ppid !== parent) {
    process.kill(process.pid, 'SIGKILL')
  }
}, 250)`
  // Node runs \`--import\` modules in every worker thread too: the
  // watchdog's own thread (and any other) must not start another one
  const module = `import { Worker, isMainThread } from 'node:worker_threads'
if (isMainThread) {
  globalThis[Symbol.for(${JSON.stringify(stepKey)})] = (name) => {
    process.stderr.write(${JSON.stringify(stepPrefix)} + name + '\\n')
  }
  globalThis[Symbol.for(${JSON.stringify(stepKey)})]('node started')
  new Worker(${JSON.stringify(thread)}, { eval: true }).unref()
}
`
  return `data:text/javascript,${encodeURIComponent(module)}`
}

/** Runs `program` (an ES module) with Node; resolves with its output. */
export function runNodeProgram(
  program: string,
  options: RunNodeOptions = {},
): Promise<RunNodeResult> {
  const timeout = options.timeout ?? 25_000
  const started = performance.now()
  const since = () => Math.round(performance.now() - started)
  /** What the parent saw of the run, in ms since the spawn. */
  const seen: { steps: Array<string>; stdout?: number; exit?: number } = {
    steps: [],
  }
  const progress = () =>
    [
      seen.steps.length
        ? `steps: ${seen.steps.join(', ')}`
        : 'no step: Node did not start the program',
      seen.stdout === undefined
        ? 'no stdout'
        : `stdout first written at ${seen.stdout} ms`,
      seen.exit === undefined
        ? 'the process had not exited'
        : `the process exited at ${seen.exit} ms but its output stayed open`,
    ].join('; ')
  return new Promise((resolve, reject) => {
    const child = execFile(
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
        const ownStderr = stderr
          .split('\n')
          .filter((line) => !line.startsWith(stepPrefix))
          .join('\n')
        if (!error) {
          resolve({ stdout })
          return
        }
        const timedOut = error.killed && error.signal === 'SIGKILL'
        const failure = new Error(
          timedOut
            ? `the program did not finish within ${timeout} ms (killed); ${progress()}`
            : error.message,
          { cause: error },
        ) as RunNodeError
        failure.stdout = stdout
        failure.stderr = ownStderr
        reject(failure)
      },
    )
    let partial = ''
    child.stderr?.on('data', (chunk) => {
      const lines = (partial + String(chunk)).split('\n')
      partial = lines.pop()!
      for (const line of lines) {
        if (line.startsWith(stepPrefix)) {
          seen.steps.push(`${line.slice(stepPrefix.length)} at ${since()} ms`)
        }
      }
    })
    child.stdout?.once('data', () => {
      seen.stdout ??= since()
    })
    child.once('exit', () => {
      // (not the timeout's own kill)
      if (!child.killed) {
        seen.exit = since()
      }
    })
  })
}
