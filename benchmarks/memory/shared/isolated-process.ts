import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export type IsolatedMemoryBenchmarkKind = 'client' | 'server'

type SerializedError = {
  message: string
  name: string
  stack?: string
}

type ChildReadyMessage = {
  type: 'ready'
  workloadNames: Array<string>
}

type ChildCompleteMessage = {
  type: 'complete'
  requestId: number
}

type ChildPrimedMessage = {
  type: 'primed'
  requestId: number
}

type ChildStoppedMessage = {
  type: 'stopped'
  requestId: number
}

type ChildErrorMessage = {
  type: 'error'
  requestId?: number
  error: SerializedError
}

export type IsolatedMemoryChildMessage =
  | ChildReadyMessage
  | ChildCompleteMessage
  | ChildPrimedMessage
  | ChildStoppedMessage
  | ChildErrorMessage

export type IsolatedMemoryParentMessage =
  | {
      type: 'prime'
      requestId: number
    }
  | {
      type: 'run'
      requestId: number
      workloadIndex: number
    }
  | {
      type: 'stop'
      requestId: number
    }

type IsolatedMemoryProcessOptions = {
  kind: IsolatedMemoryBenchmarkKind
  setupUrl: URL
  workloadNames: Array<string>
}

const childModulePath = fileURLToPath(
  new URL('./isolated-process-child.ts', import.meta.url),
)

// Inherit CodSpeed and scenario-specific V8 flags from the Vitest worker, then
// add the flags that keep the child heap and compilation lifecycle stable.
// Disabling optimization prevents a workload from crossing a JIT tier-up
// threshold inside the measured loop and injecting a one-off compilation
// allocation into the peak-memory result.
const deterministicChildExecArgv = [
  '--expose-gc',
  '--predictable',
  '--no-opt',
  '--no-flush-bytecode',
  '--initial-old-space-size=64',
  '--min-semi-space-size=16',
  '--max-semi-space-size=16',
]

function createChildExecArgv() {
  const execArgv: Array<string> = []

  for (let index = 0; index < process.execArgv.length; index++) {
    const argument = process.execArgv[index]!

    if (
      argument === '-e' ||
      argument === '--eval' ||
      argument === '-p' ||
      argument === '--print'
    ) {
      index++
      continue
    }

    if (
      argument.startsWith('--eval=') ||
      argument.startsWith('--print=') ||
      argument === '--input-type=module' ||
      argument === '--input-type=commonjs' ||
      argument === '--check' ||
      argument === '-c' ||
      argument === '--test'
    ) {
      continue
    }

    execArgv.push(argument)
  }

  for (const argument of deterministicChildExecArgv) {
    const flagName = argument.split('=')[0]!
    const alreadyPresent = execArgv.some(
      (existing) =>
        existing === flagName || existing.startsWith(`${flagName}=`),
    )

    if (!alreadyPresent) {
      execArgv.push(argument)
    }
  }

  return execArgv
}

function isChildMessage(value: unknown): value is IsolatedMemoryChildMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function deserializeError(error: SerializedError) {
  const result = new Error(error.message)
  result.name = error.name
  result.stack = error.stack
  return result
}

export class IsolatedMemoryProcess {
  readonly #options: IsolatedMemoryProcessOptions
  #child: ReturnType<typeof fork> | undefined
  #nextRequestId = 0

  constructor(options: IsolatedMemoryProcessOptions) {
    this.#options = options
  }

  get pid() {
    return this.#child?.pid
  }

  async start() {
    if (this.#child) {
      throw new Error('The isolated memory process is already running')
    }

    this.#nextRequestId = 0

    const child = fork(
      childModulePath,
      [this.#options.kind, this.#options.setupUrl.href],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
        execArgv: createChildExecArgv(),
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    )

    this.#child = child

    try {
      const message = await this.#waitForMessage(child)

      if (message.type === 'error') {
        throw deserializeError(message.error)
      }

      if (message.type !== 'ready') {
        throw new Error(
          `Expected isolated memory process to become ready, got ${message.type}`,
        )
      }

      if (
        message.workloadNames.length !== this.#options.workloadNames.length ||
        message.workloadNames.some(
          (name, index) => name !== this.#options.workloadNames[index],
        )
      ) {
        throw new Error(
          `Isolated memory workload names did not match: expected ${JSON.stringify(this.#options.workloadNames)}, got ${JSON.stringify(message.workloadNames)}`,
        )
      }

      // Exercise both IPC directions and the child's command queue before the
      // benchmark marker. The child settles and collects after receiving this
      // first inbound command, so its one-time native allocations cannot
      // dominate the measured workload's peak.
      const primed = await this.#sendTo(child, {
        type: 'prime',
        requestId: this.#nextRequestId++,
      })

      if (primed.type === 'error') {
        throw deserializeError(primed.error)
      }

      if (primed.type !== 'primed') {
        throw new Error(
          `Expected isolated memory process to become primed, got ${primed.type}`,
        )
      }
    } catch (error) {
      child.kill()
      this.#child = undefined
      throw error
    }
  }

  async run(workloadIndex: number) {
    if (
      !Number.isInteger(workloadIndex) ||
      workloadIndex < 0 ||
      workloadIndex >= this.#options.workloadNames.length
    ) {
      throw new Error(`Invalid isolated memory workload index ${workloadIndex}`)
    }

    const message = await this.#send({
      type: 'run',
      requestId: this.#nextRequestId++,
      workloadIndex,
    })

    if (message.type === 'error') {
      throw deserializeError(message.error)
    }

    if (message.type !== 'complete') {
      throw new Error(
        `Expected isolated memory workload to complete, got ${message.type}`,
      )
    }
  }

  async stop() {
    const child = this.#child

    if (!child) {
      return
    }

    this.#child = undefined
    const exit = this.#waitForExit(child)

    try {
      const message = await this.#sendTo(child, {
        type: 'stop',
        requestId: this.#nextRequestId++,
      })

      if (message.type === 'error') {
        throw deserializeError(message.error)
      }

      if (message.type !== 'stopped') {
        throw new Error(
          `Expected isolated memory process to stop, got ${message.type}`,
        )
      }

      await exit
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }

      await exit.catch(() => {})
    }
  }

  async #send(message: IsolatedMemoryParentMessage) {
    const child = this.#child

    if (!child) {
      throw new Error('The isolated memory process is not running')
    }

    return this.#sendTo(child, message)
  }

  async #sendTo(
    child: ReturnType<typeof fork>,
    message: IsolatedMemoryParentMessage,
  ) {
    const response = this.#waitForMessage(child, message.requestId)

    try {
      await new Promise<void>((resolve, reject) => {
        child.send(message, (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    } catch (error) {
      void response.catch(() => {})
      throw error
    }

    return response
  }

  #waitForMessage(
    child: ReturnType<typeof fork>,
    requestId?: number,
  ): Promise<IsolatedMemoryChildMessage> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        child.off('error', onError)
        child.off('exit', onExit)
        child.off('message', onMessage)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup()
        reject(
          new Error(
            `Isolated memory process exited before responding (code ${code}, signal ${signal})`,
          ),
        )
      }
      const onMessage = (value: unknown) => {
        if (!isChildMessage(value)) {
          return
        }

        if (
          requestId !== undefined &&
          value.type !== 'error' &&
          value.type !== 'ready' &&
          value.requestId !== requestId
        ) {
          return
        }

        if (
          requestId !== undefined &&
          value.type === 'error' &&
          value.requestId !== requestId
        ) {
          return
        }

        cleanup()
        resolve(value)
      }

      child.on('error', onError)
      child.on('exit', onExit)
      child.on('message', onMessage)
    })
  }

  #waitForExit(child: ReturnType<typeof fork>): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        child.off('error', onError)
        child.off('exit', onExit)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onExit = () => {
        cleanup()
        resolve()
      }

      child.once('error', onError)
      child.once('exit', onExit)

      // The process can exit between the initial state check and listener
      // registration. Recheck after registering so that transition cannot be
      // missed.
      if (child.exitCode !== null || child.signalCode !== null) {
        cleanup()
        resolve()
      }
    })
  }
}
