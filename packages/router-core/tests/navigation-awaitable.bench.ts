import { createHook } from 'node:async_hooks'
import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

// Use the same cases on both implementations. Allocation counts are collected
// outside the timed loop so async-hooks instrumentation cannot bias timings.
for (const mode of ['none', 'sync', 'async', 'mixed', 'chunks'] as const) {
  const root = new BaseRootRoute({})
  let chunkCalls = 0
  let parent: AnyRoute = root
  for (let index = 0; index < 8; index++) {
    const parentRoute = parent
    const value = { [`level${index}`]: index }
    const child = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: `level${index}`,
      beforeLoad:
        mode === 'none' || mode === 'chunks'
          ? undefined
          : () =>
              mode === 'async' || (mode === 'mixed' && index % 4 === 0)
                ? Promise.resolve(value)
                : value,
      component:
        mode === 'chunks'
          ? (Object.assign(() => null, {
              preload: () => {
                chunkCalls++
                return Promise.resolve()
              },
            }) as any)
          : undefined,
    })
    parent.addChildren([child])
    parent = child
  }
  const router = createTestRouter({
    routeTree: root,
    history: createMemoryHistory({
      initialEntries: [
        '/level0/level1/level2/level3/level4/level5/level6/level7',
      ],
    }),
  })
  await router.load()
  const navigate = () => router.navigate({ to: '.', replace: true })
  await navigate()
  expect(router.state.matches).toHaveLength(9)
  expect(
    router.state.matches.every((match) => match.status === 'success'),
  ).toBe(true)
  if (mode === 'chunks') {
    expect(chunkCalls).toBe(16)
  } else if (mode !== 'none') {
    expect(router.state.matches[8]!.context).toMatchObject({
      level0: 0,
      level7: 7,
    })
  }

  let promises = 0
  const hook = createHook({
    init(_id, type) {
      if (type === 'PROMISE') {
        promises++
      }
    },
  })
  hook.enable()
  await navigate()
  hook.disable()
  console.info(`${mode}: ${promises} Promises per navigation`)

  describe(`${mode} beforeLoad`, () => {
    bench(
      '10 navigations through 8 routes',
      async () => {
        for (let index = 0; index < 10; index++) {
          await navigate()
        }
      },
      { time: 1500, warmupTime: 300 },
    )
  })
}
