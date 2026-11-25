/**
 * Controls of the process's `NODE_ENV` under builds and dev commands
 * (node-env.ts): a build runs under its own value from start to end, also
 * when another build or a dev server of the worker starts meanwhile, and
 * the worker's value is back once no build runs.
 */
import { expect, onTestFinished, test, vi } from 'vitest'
import { withBuildEnvironment } from '../src/build-harness'
import { runAsDevCommand } from '../src/dev-command'
import { nodeEnvWaitLimit, withNodeEnv } from '../src/node-env'

test('overlapping builds of different values each run under their own, and the worker’s comes back', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const seen: Array<string> = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const production = withBuildEnvironment('production', [], async () => {
    seen.push(`production: ${process.env.NODE_ENV}`)
    await held
    seen.push(`production: ${process.env.NODE_ENV}`)
  })
  const development = withBuildEnvironment('development', [], async () => {
    seen.push(`development: ${process.env.NODE_ENV}`)
  })
  const unset = withBuildEnvironment(null, [], async () => {
    seen.push(`unset: ${process.env.NODE_ENV}`)
  })
  await new Promise((resolve) => setImmediate(resolve))
  release()
  await Promise.all([production, development, unset])
  expect(seen).toEqual([
    'production: production',
    'production: production',
    'development: development',
    'unset: undefined',
  ])
  expect(process.env.NODE_ENV).toBe('test')
})

test('a dev command started while a build runs leaves the build its value, and holds once it ended', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const seen: Array<string | undefined> = []
  await withBuildEnvironment('production', [], async () => {
    runAsDevCommand()
    await new Promise((resolve) => setImmediate(resolve))
    seen.push(process.env.NODE_ENV)
  })
  expect(seen).toEqual(['production'])
  expect(process.env.NODE_ENV).toBe('development')
})

/** A promise and its resolve. */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('a hold of another value waits at most nodeEnvWaitLimit, and its failure names the holder', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const stuck = deferred()
  // (a build that never ends, but for this test's cleanup)
  const production = withNodeEnv('production', () => stuck.promise)
  const development = withNodeEnv('development', async () => 'started')
  const failure = development.then(
    () => undefined,
    (error: unknown) => error as Error,
  )
  await vi.advanceTimersByTimeAsync(nodeEnvWaitLimit + 1)
  expect((await failure)?.message).toMatch(
    /NODE_ENV=development waited \d+ ms for NODE_ENV=production, held by 1 /,
  )
  stuck.resolve()
  await production
  // Nothing holds it now: the next one starts at once
  expect(await withNodeEnv('development', async () => 'started')).toBe(
    'started',
  )
})

test('holds start in the order asked: one of the running value asked after a waiter waits behind it', async () => {
  const order: Array<string> = []
  const first = deferred()
  const production = withNodeEnv('production', async () => {
    order.push('production 1')
    await first.promise
  })
  const development = withNodeEnv('development', async () => {
    order.push('development')
  })
  const later = withNodeEnv('production', async () => {
    order.push('production 2')
  })
  await new Promise((resolve) => setImmediate(resolve))
  first.resolve()
  await Promise.all([production, development, later])
  expect(order).toEqual(['production 1', 'development', 'production 2'])
})

test('unset builds run one at a time: a value a tool set meanwhile is not the next one’s', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const seen: Array<string | undefined> = []
  const first = deferred()
  const vite = withBuildEnvironment(null, [], async () => {
    // (as `vite build` does when it is unset)
    process.env.NODE_ENV = 'production'
    await first.promise
  })
  const webpack = withBuildEnvironment(null, [], async () => {
    seen.push(process.env.NODE_ENV)
  })
  await new Promise((resolve) => setImmediate(resolve))
  first.resolve()
  await Promise.all([vite, webpack])
  expect(seen).toEqual([undefined])
  expect(process.env.NODE_ENV).toBe('test')
})

test('work a build left behind starts a build of another value once the first ended', async () => {
  const later = deferred()
  let started: Promise<string> | undefined
  await withNodeEnv('development', async () => {
    setTimeout(() => {
      started = withNodeEnv('production', async () => 'started')
      later.resolve()
    }, 10)
  })
  await later.promise
  expect(await started).toBe('started')
})

test('a dev server started after the dev command, while a build runs, starts under development once it ended', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const build = deferred()
  const building = withBuildEnvironment('production', [], () => build.promise)
  const server = runAsDevCommand(async () => process.env.NODE_ENV)
  await new Promise((resolve) => setImmediate(resolve))
  build.resolve()
  await building
  expect(await server).toBe('development')
  expect(process.env.NODE_ENV).toBe('development')
})
