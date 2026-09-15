import { expect, test } from 'vitest'
import { createDiagnostics, hashLinkCount, ordinaryLinkCount } from './fixture'
import { setup } from './setup'

const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

test('restores data and context into fresh DOMs and settles Vue hydration', async () => {
  const scenario = setup({ countRenders: true })
  for (let iteration = 0; iteration < 3; iteration++) {
    await scenario.before()
    try {
      expect(scenario.snapshot().diagnostics).toEqual(createDiagnostics())
      expect(scenario.snapshot().matches).toBeUndefined()
      await scenario.run()
      const completed = scenario.snapshot()
      // Vue slots need no React-style second render to signal completion.
      expect(completed.diagnostics.ordinaryRenders).toBeGreaterThanOrEqual(
        ordinaryLinkCount,
      )
      expect(completed.diagnostics.hashRenders).toBeGreaterThanOrEqual(
        hashLinkCount,
      )
      for (let index = 0; index < 4; index++) {
        await turn()
      }
      expect(scenario.snapshot()).toEqual(completed)
      await expect(scenario.run()).rejects.toThrow('newly prepared sample')
    } finally {
      await scenario.after()
    }
  }
})

test('installs per-iteration preparation for the ordinary Vitest runner', async () => {
  const scenario = setup()
  const task: Parameters<typeof scenario.installIterationHooks>[0] = {
    opts: {},
  }
  scenario.installIterationHooks(task)
  for (let iteration = 0; iteration < 2; iteration++) {
    await task.opts.beforeEach!()
    try {
      expect(scenario.snapshot().diagnostics).toEqual(createDiagnostics())
      await scenario.run()
    } finally {
      await task.opts.afterEach!()
    }
  }
})

test('rejects an empty measurement and still releases its sample', async () => {
  const scenario = setup()
  await scenario.before()
  await expect(scenario.after()).rejects.toThrow(
    'Hydration sample was not completed',
  )
  await scenario.before()
  try {
    await scenario.run()
  } finally {
    await scenario.after()
  }
})
