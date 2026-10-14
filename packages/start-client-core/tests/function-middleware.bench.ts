// @vitest-environment node

import { afterAll, bench, describe, expect } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { createMiddleware } from '../src/createMiddleware'
import { executeMiddleware } from '../src/createServerFn'
import type { StartStorageContext } from '@tanstack/start-storage-context'
import type { ServerFnMiddlewareOptions } from '../src/createServerFn'

type SendContextMode = 'absent' | 'empty' | 'present'
type Context = Readonly<Record<string, string | number>>

type Scenario = {
  name: string
  env: 'client' | 'server'
  headers: 'absent' | 'supplied'
  depth: 0 | 1 | 4
  initialSendContext: SendContextMode
  nextSendContext: SendContextMode
}

type NextOptions = {
  context: Context
  sendContext?: Context
  headers?: Headers
}

type InputOptions = Pick<ServerFnMiddlewareOptions, 'method' | 'serverFnMeta'> &
  NextOptions & {
    data: number
  }

type Input = {
  options: Readonly<InputOptions>
  snapshot: ReturnType<typeof snapshotOptions>
  storage: StartStorageContext
}

const batchSize = 160
const benchOptions = { warmupIterations: 100, time: 2_000, throws: true }
const sendContextScenarios: Array<{
  name: string
  initial: SendContextMode
  next: SendContextMode
}> = [
  { name: 'absent', initial: 'absent', next: 'absent' },
  { name: 'empty', initial: 'empty', next: 'empty' },
  { name: 'present', initial: 'present', next: 'present' },
  { name: 'empty-from-next', initial: 'absent', next: 'empty' },
  { name: 'present-from-next', initial: 'absent', next: 'present' },
]

const scenarios: Array<Scenario> = (['server', 'client'] as const).flatMap(
  (env) =>
    (['absent', 'supplied'] as const).flatMap((headers) =>
      ([0, 1, 4] as const).flatMap((depth) =>
        sendContextScenarios
          .filter((context) => depth > 0 || context.initial === context.next)
          .map((context) => ({
            name: `${env}-headers-${headers}-send-${context.name}-layers-${depth}`,
            env,
            headers,
            depth,
            initialSendContext: context.initial,
            nextSendContext: context.next,
          })),
      ),
    ),
)

function snapshotOptions(options: NextOptions) {
  return {
    keys: Object.keys(options),
    context: { ...options.context },
    sendContext:
      options.sendContext === undefined
        ? undefined
        : { ...options.sendContext },
  }
}

function snapshotHeaders(headers: Headers) {
  return {
    headers,
    entries: Array.from(headers),
    cookies: headers.getSetCookie(),
  }
}

function createWorkload(scenario: Scenario) {
  const suppliedHeaders = scenario.headers === 'supplied'
  const initialHeaders = new Headers({
    'x-initial': 'one',
    'x-shared': 'initial',
  })
  initialHeaders.append('set-cookie', 'first=one; Path=/')
  initialHeaders.append('set-cookie', 'second=two; Path=/')
  const headerSnapshots = [snapshotHeaders(initialHeaders)]
  const expectedHeaders = new Headers(
    suppliedHeaders ? initialHeaders : undefined,
  )
  const nextInputs: Array<{
    options: Readonly<NextOptions>
    snapshot: ReturnType<typeof snapshotOptions>
  }> = []
  const middlewares = Array.from({ length: scenario.depth }, (_, index) => {
    const nextOptions: NextOptions = {
      context: Object.freeze({ [`hop${index}`]: index, shared: `hop${index}` }),
    }
    if (scenario.nextSendContext !== 'absent') {
      nextOptions.sendContext = Object.freeze<Context>(
        scenario.nextSendContext === 'empty'
          ? {}
          : { [`reply${index}`]: index, shared: `reply${index}` },
      )
    }
    // Only client middleware can supply headers through its public next().
    if (scenario.env === 'client' && suppliedHeaders) {
      const headers = new Headers({
        'x-shared': `hop${index}`,
        [`x-hop-${index}`]: String(index),
      })
      headers.append('set-cookie', `hop${index}=${index}; Path=/`)
      headerSnapshots.push(snapshotHeaders(headers))
      nextOptions.headers = headers
      expectedHeaders.set('x-shared', `hop${index}`)
      expectedHeaders.set(`x-hop-${index}`, String(index))
      expectedHeaders.append('set-cookie', `hop${index}=${index}; Path=/`)
    }
    nextInputs.push({
      options: Object.freeze(nextOptions),
      snapshot: snapshotOptions(nextOptions),
    })
    if (scenario.env === 'client') {
      return createMiddleware({ type: 'function' }).client(({ next }) =>
        next(nextOptions),
      )
    }
    return createMiddleware({ type: 'function' }).server(({ next }) =>
      next(nextOptions),
    )
  })
  const inputs = Array.from({ length: batchSize }, (_, index): Input => {
    const options: InputOptions = {
      method: 'POST',
      data: index,
      serverFnMeta: Object.freeze({ id: 'middleware-benchmark' }),
      context: Object.freeze({
        seed: index,
        trusted: 'server-context',
        shared: 'initial',
      }),
    }
    if (suppliedHeaders) {
      options.headers = initialHeaders
    }
    if (scenario.initialSendContext !== 'absent') {
      options.sendContext = Object.freeze<Context>(
        scenario.initialSendContext === 'empty'
          ? {}
          : { initialReply: 'present', shared: 'initial' },
      )
    }
    return {
      options: Object.freeze(options),
      snapshot: snapshotOptions(options),
      storage: {
        request: new Request(
          `http://localhost/_serverFn/middleware-benchmark?i=${index}`,
        ),
        getRouter() {
          throw new Error('Function middleware does not need a router')
        },
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
      },
    }
  })

  // The client phase uses the real Start context used during SSR calls.
  function invoke(input: Input) {
    return runWithStartContext(input.storage, () =>
      executeMiddleware(middlewares, scenario.env, input.options),
    )
  }

  async function verify() {
    for (const input of inputs) {
      const { options, snapshot } = input
      const result = await invoke(input)
      expect(result.error).toBeUndefined()
      expect(result.data).toBe(options.data)
      // Handler results and transport belong to the server-function benchmarks.
      expect(result.result).toBeUndefined()
      const context = { ...options.context }
      const sendContext = { ...options.sendContext }
      for (const next of nextInputs) {
        Object.assign(context, next.options.context)
        Object.assign(sendContext, next.options.sendContext)
      }
      expect({ ...result.context }).toEqual(context)
      // Compare absent payload contents while preserving explicit empty objects.
      expect({ ...result.sendContext }).toEqual(sendContext)
      if (scenario.nextSendContext !== 'absent') {
        expect(result.sendContext).toBeDefined()
      }
      if (scenario.env === 'client') {
        expect(result.headers).toBeDefined()
      }
      const headers = new Headers(result.headers)
      expect(Array.from(headers)).toEqual(Array.from(expectedHeaders))
      expect(headers.getSetCookie()).toEqual(expectedHeaders.getSetCookie())
      expect(snapshotOptions(options)).toEqual(snapshot)
    }
    for (const { options, snapshot } of nextInputs) {
      expect(snapshotOptions(options)).toEqual(snapshot)
    }
    for (const { headers, entries, cookies } of headerSnapshots) {
      expect(Array.from(headers)).toEqual(entries)
      expect(headers.getSetCookie()).toEqual(cookies)
    }
  }

  async function batch() {
    // Every call settles before the next; no work escapes the measured batch.
    for (const input of inputs) {
      await invoke(input)
    }
  }

  function invokeIndex(index: number) {
    return invoke(inputs[index]!)
  }

  return { verify, batch, invokeIndex }
}

function createMixedWorkload(env: Scenario['env']) {
  const absent = createWorkload({
    name: 'mixed-absent',
    env,
    headers: 'absent',
    depth: 4,
    initialSendContext: 'absent',
    nextSendContext: 'absent',
  })
  const supplied = createWorkload({
    name: 'mixed-supplied',
    env,
    headers: 'supplied',
    depth: 4,
    initialSendContext: 'present',
    nextSendContext: 'present',
  })

  async function verify() {
    await absent.verify()
    await supplied.verify()
  }

  async function batch() {
    // Interleave 120 absent calls and 40 supplied calls in each 160-call batch.
    for (let index = 0; index < batchSize; index++) {
      await (index % 4 === 0 ? supplied : absent).invokeIndex(index)
    }
  }

  return { verify, batch }
}

const workloads: Array<
  ReturnType<typeof createWorkload> | ReturnType<typeof createMixedWorkload>
> = []

afterAll(async () => {
  for (const workload of workloads) {
    await workload.verify()
  }
})

for (const scenario of scenarios) {
  describe(`function middleware ${scenario.name}`, () => {
    let workload: ReturnType<typeof createWorkload> | undefined

    bench('160 calls', () => workload!.batch(), {
      ...benchOptions,
      // Tinybench awaits setup before warmup and measurement. Only selected cases
      // allocate fixtures, and the measured callback contains no assertions.
      setup: async () => {
        if (!workload) {
          workload = createWorkload(scenario)
          workloads.push(workload)
        }
        await workload.verify()
      },
    })
  })
}

for (const env of ['server', 'client'] as const) {
  describe(`function middleware ${env}-mixed-75-absent-25-supplied-layers-4`, () => {
    let workload: ReturnType<typeof createMixedWorkload> | undefined

    bench('160 calls', () => workload!.batch(), {
      ...benchOptions,
      setup: async () => {
        if (!workload) {
          workload = createMixedWorkload(env)
          workloads.push(workload)
        }
        await workload.verify()
      },
    })
  })
}
