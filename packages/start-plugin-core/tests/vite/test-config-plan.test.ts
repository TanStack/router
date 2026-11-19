import { describe, expect, test } from 'vitest'
import { ENTRY_POINTS } from '../../src/constants'
import { createViteTestConfigPlan } from '../../src/vite/planning'

const entryPaths = {
  client: '/app/src/client.tsx',
  server: '/app/src/server.ts',
  start: '/app/src/start.ts',
}

describe('createViteTestConfigPlan', () => {
  test('aliases every entry of an app', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: '/app/src/router.tsx' },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(plan.resolve.alias).toMatchObject({
      [ENTRY_POINTS.client]: '/app/src/client.tsx',
      [ENTRY_POINTS.server]: '/app/src/server.ts',
      [ENTRY_POINTS.start]: '/app/src/start.ts',
      [ENTRY_POINTS.router]: '/app/src/router.tsx',
    })
  })

  // Start's packages then resolve the placeholder router entry they ship.
  test('leaves the router entry of a package without one unaliased', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: undefined },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(plan.resolve.alias).toMatchObject({
      [ENTRY_POINTS.client]: '/app/src/client.tsx',
      [ENTRY_POINTS.server]: '/app/src/server.ts',
      [ENTRY_POINTS.start]: '/app/src/start.ts',
    })
    expect(ENTRY_POINTS.router in plan.resolve.alias).toBe(false)
  })

  // No server takes the request of a client test, so the module that sends
  // it is replaced by the one that asks the mocks of `mockServerFn`.
  test.each(['react', 'solid', 'vue'] as const)(
    'sends the server function calls of %s client code to the mocks',
    (framework) => {
      const plan = createViteTestConfigPlan({
        framework,
        entryPaths: { ...entryPaths, router: undefined },
        optimizeDepsExclude: [],
        noExternal: [],
      })

      expect(plan.resolve.alias).toMatchObject({
        [`@tanstack/${framework}-start/client-rpc`]: `@tanstack/${framework}-start/testing/client-rpc`,
      })
    },
  )

  test('keeps the libraries built on Start out of pre-bundling and externalization', () => {
    const plan = createViteTestConfigPlan({
      framework: 'solid',
      entryPaths: { ...entryPaths, router: undefined },
      optimizeDepsExclude: ['a-start-library'],
      noExternal: ['a-start-library'],
    })

    expect(plan.environments.client.optimizeDeps.exclude).toEqual([
      'a-start-library',
    ])
    expect(plan.resolve.noExternal).toContain('a-start-library')
  })

  // A test runner decides what it builds and serves.
  test('plans no build and no dependency scan of the app', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: '/app/src/router.tsx' },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(Object.keys(plan.environments)).toEqual(['client'])
    expect(Object.keys(plan.environments.client)).toEqual(['optimizeDeps'])
    expect(plan.environments.client.optimizeDeps).not.toHaveProperty('entries')
  })
})
