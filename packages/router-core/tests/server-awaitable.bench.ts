import { createHook } from 'node:async_hooks'
import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { loadServerRoute } from '../src/load-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

for (const mode of ['static', 'sync', 'async', 'mixed'] as const) {
  const root = new BaseRootRoute({})
  let policyCalls = 0
  let parent: AnyRoute = root
  for (let index = 0; index < 8; index++) {
    const parentRoute = parent
    const child = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: `level${index}`,
      ssr:
        mode === 'static' || (mode === 'mixed' && index % 4 !== 0)
          ? true
          : () => {
              policyCalls++
              return mode === 'sync' ? true : Promise.resolve(true)
            },
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
    isServer: true,
  })
  const load = () => loadServerRoute(router)
  await load()
  expect(router.state.matches).toHaveLength(9)
  expect(
    router.state.matches.every((match) => match.status === 'success'),
  ).toBe(true)
  expect(router.state.matches.every((match) => match.ssr === true)).toBe(true)
  expect(policyCalls).toBe(mode === 'static' ? 0 : mode === 'mixed' ? 2 : 8)

  let promises = 0
  const hook = createHook({
    init(_id, type) {
      if (type === 'PROMISE') {
        promises++
      }
    },
  })
  hook.enable()
  await load()
  hook.disable()
  console.info(`${mode}: ${promises} Promises per server load`)

  describe(`${mode} server hooks`, () => {
    bench(
      '10 loads through 8 routes',
      async () => {
        for (let index = 0; index < 10; index++) {
          await load()
        }
      },
      { time: 1500, warmupTime: 300 },
    )
  })
}
