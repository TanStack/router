import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A Standard Schema validator whose issue carries a bigint. `JSON.stringify`
 * throws on one, so this is what catches a call site going back to serializing
 * the issues raw: the failure would surface as a complaint about serializing a
 * BigInt rather than the validation message.
 */
function failingValidator(issues: Array<Record<string, unknown>>) {
  return {
    '~standard': {
      validate: () => ({ issues }),
    },
  }
}

function buildRouter(validateSearch: unknown, initialEntry: string) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const dashboardRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    validateSearch: validateSearch as any,
  })
  const history = createMemoryHistory({ initialEntries: [initialEntry] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, dashboardRoute]),
    history,
  })
  return { router, dashboardRoute }
}

test('search validation reports the issue rather than failing to serialize it', async () => {
  const { router, dashboardRoute } = buildRouter(
    failingValidator([
      { message: 'Expected number', path: ['page'], received: 1n },
    ]),
    '/dashboard?page=abc',
  )

  await router.load()

  const match = router.state.matches.find(
    (m) => m.routeId === dashboardRoute.id,
  )
  const error = match?.searchError as Error | undefined
  expect(error).toBeInstanceOf(Error)
  expect(error?.message).toBe('page: Expected number')
  expect(error?.message).not.toMatch(/BigInt|serialize/i)
})

test('search validation reports every issue with its path', async () => {
  const { router, dashboardRoute } = buildRouter(
    failingValidator([
      { message: 'Required', path: ['page'] },
      { message: 'Too long', path: ['filters', 0, 'name'] },
      { message: 'Invalid input' },
    ]),
    '/dashboard',
  )

  await router.load()

  const match = router.state.matches.find(
    (m) => m.routeId === dashboardRoute.id,
  )
  expect((match?.searchError as Error | undefined)?.message).toBe(
    'page: Required\nfilters[0].name: Too long\nInvalid input',
  )
})
