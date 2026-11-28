/**
 * Controls of the process's `NODE_ENV` under builds and dev commands
 * (node-env.ts): a build runs under its own value from start to end, also
 * when another build or a dev server of the worker starts meanwhile, and
 * the worker's value is back once no build runs.
 */
import { expect, onTestFinished, test, vi } from 'vitest'
import { withBuildEnvironment } from '../src/build-harness'
import { runAsDevCommand } from '../src/dev-command'
import { holdNodeEnv, nodeEnvWaitLimit, withNodeEnv } from '../src/node-env'

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

test('a hold of the running value asked outside its scope joins at once, also while another value waits', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const running = deferred()
  const production = withNodeEnv('production', () => running.promise)
  const development = withNodeEnv('development', async () => 'started').then(
    () => undefined,
    (error: unknown) => error as Error,
  )
  // (work the running build waits for, from a callback outside its scope)
  let joined = false
  const work = withNodeEnv('production', async () => {
    joined = true
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(joined).toBe(true)
  await work
  await vi.advanceTimersByTimeAsync(nodeEnvWaitLimit + 1)
  expect((await development)?.message).toMatch(/waited/)
  running.resolve()
  await production
})

test('a waiter past its limit when the holder ends rejects and never starts', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const running = deferred()
  const production = withNodeEnv('production', () => running.promise)
  let started = false
  const development = withNodeEnv('development', async () => {
    started = true
  }).then(
    () => undefined,
    (error: unknown) => error as Error,
  )
  // The process was busy past the limit: the timer has not run yet
  vi.setSystemTime(Date.now() + nodeEnvWaitLimit + 1)
  running.resolve()
  await production
  expect((await development)?.message).toMatch(
    /waited \d+ ms for NODE_ENV=production, held by 1 /,
  )
  expect(started).toBe(false)
})

test('an unset build inside another build’s hold throws: it can share with no build', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  await withBuildEnvironment(null, [], async () => {
    // (as `vite build` does when it is unset)
    process.env.NODE_ENV = 'production'
    await expect(
      withBuildEnvironment(null, [], async () => 'started'),
    ).rejects.toThrow(/NODE_ENV \(unset\) started one under NODE_ENV \(unset\)/)
  })
  expect(process.env.NODE_ENV).toBe('test')
})

test('a dev command whose server cannot start leaves NODE_ENV as it was', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  await withNodeEnv('production', async () => {
    await expect(runAsDevCommand(async () => 'started')).rejects.toThrow(
      /started one under NODE_ENV=development/,
    )
  })
  expect(process.env.NODE_ENV).toBe('test')
})

test('a server that fails to start gives its hold back', async () => {
  await expect(
    holdNodeEnv('production', () => Promise.reject(new Error('no port'))),
  ).rejects.toThrow('no port')
  const started = await Promise.race([
    withNodeEnv('development', async () => 'started'),
    new Promise((resolve) => setTimeout(() => resolve('waiting'), 100)),
  ])
  expect(started).toBe('started')
})
