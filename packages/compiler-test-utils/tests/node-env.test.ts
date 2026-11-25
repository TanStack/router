/**
 * Controls of the process's `NODE_ENV` under builds and dev commands
 * (node-env.ts): a build runs under its own value from start to end, also
 * when another build or a dev server of the worker starts meanwhile, and
 * the worker's value is back once no build runs.
 */
import { expect, onTestFinished, test, vi } from 'vitest'
import { withBuildEnvironment } from '../src/build-harness'
import { runAsDevCommand } from '../src/dev-command'

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
