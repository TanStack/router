import { afterEach, beforeEach, bench, describe } from 'vitest'
import {
  benchOptions,
  mountTicksPerIteration,
  navigationTicksPerIteration,
} from '../shared'
import {
  setupFormatterNavigation,
  setupIsolatedFanout,
  setupMount,
  setupNavigation,
  setupScalingMount,
  setupScalingNavigation,
} from './setup'
import type { FormatterOptions, ScalingOptions } from '../shared'

for (const placement of ['owner', 'root'] as const) {
  describe(`client-link-lifecycle ${placement}`, () => {
    const test = setupNavigation(placement)
    beforeEach(test.before)
    afterEach(test.after)
    bench(
      placement === 'owner'
        ? 'client Links: departing owners (react)'
        : 'client Links: persistent owners (react)',
      async () => {
        for (let index = 0; index < navigationTicksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
      },
      { ...benchOptions, setup: test.before, teardown: test.after },
    )
  })
}

describe('client-link-lifecycle first mount', () => {
  const test = setupMount()
  beforeEach(test.before)
  afterEach(test.after)
  bench(
    'client Links: first mount (react)',
    async () => {
      for (let index = 0; index < mountTicksPerIteration; index++) {
        await test.tick()
      }
      await test.finishBatch()
    },
    { ...benchOptions, setup: test.before, teardown: test.after },
  )
})

const scalingCases: Array<ScalingOptions> = [
  { mode: 'unique', count: 50, input: 'search' },
  { mode: 'unique', count: 1000, input: 'search' },
  { mode: 'repeated', count: 1000, input: 'hash' },
  { mode: 'mixed', count: 200, input: 'search' },
  { mode: 'mixed', count: 200, input: 'hash' },
]

for (const options of scalingCases) {
  describe(`client-link-scaling ${options.mode} ${options.count} ${options.input}`, () => {
    const test = setupScalingNavigation(options)
    beforeEach(test.before)
    afterEach(test.after)
    bench(
      `client Links: scaling ${options.mode} ${options.count} ${options.input} (react)`,
      async () => {
        for (let index = 0; index < navigationTicksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
      },
      { ...benchOptions, setup: test.before, teardown: test.after },
    )
  })
}

describe('client-link-scaling mount 1000', () => {
  const test = setupScalingMount()
  beforeEach(test.before)
  afterEach(test.after)
  bench(
    'client Links: scaling mount 1000 (react)',
    async () => {
      for (let index = 0; index < mountTicksPerIteration; index++) {
        await test.tick()
      }
      await test.finishBatch()
    },
    { ...benchOptions, setup: test.before, teardown: test.after },
  )
})

const formatterCases: Array<FormatterOptions> = [
  { history: 'memory', externalCount: 0, internalCount: 200 },
  { history: 'opaque', externalCount: 0, internalCount: 200 },
  { history: 'opaque', externalCount: 1000, internalCount: 8 },
  { history: 'hash', externalCount: 0, internalCount: 200 },
]

for (const options of formatterCases) {
  const label = `${options.history} ${options.externalCount} external ${options.internalCount} internal`
  describe(`client-link-formatter ${label}`, () => {
    const test = setupFormatterNavigation(options)
    beforeEach(test.before)
    afterEach(test.after)
    bench(
      `client Links: formatter ${label} (react)`,
      async () => {
        for (let index = 0; index < navigationTicksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
      },
      { ...benchOptions, setup: test.before, teardown: test.after },
    )
  })
}

const isolatedFanoutCases: Array<ScalingOptions> = [
  { mode: 'unique', count: 1000, input: 'search' },
  { mode: 'repeated', count: 1000, input: 'hash' },
  { mode: 'active', count: 1000, input: 'hash' },
]

for (const options of isolatedFanoutCases) {
  const label = `${options.mode} ${options.count} ${options.input}`
  describe(`client-link-isolated-fanout ${label}`, () => {
    const test = setupIsolatedFanout(options)
    beforeEach(test.before)
    afterEach(test.after)
    bench(
      `client Links: isolated fanout ${label} (react)`,
      async () => {
        for (let index = 0; index < navigationTicksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
      },
      { ...benchOptions, setup: test.before, teardown: test.after },
    )
  })
}
