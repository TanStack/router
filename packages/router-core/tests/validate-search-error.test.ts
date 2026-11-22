import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, SearchParamError } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyStandardSchemaValidateIssue } from '../src/validators'

function createRouterWithIssues(
  issues: ReadonlyArray<AnyStandardSchemaValidateIssue>,
) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues }),
      },
    },
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function captureSearchError(
  issues: ReadonlyArray<AnyStandardSchemaValidateIssue>,
): Error {
  const router = createRouterWithIssues(issues)
  try {
    router.matchRoutes('/', {}, { throwOnError: true })
  } catch (error) {
    return error as Error
  }
  throw new Error('expected matchRoutes to throw')
}

describe('validateSearch with Standard Schema issues', () => {
  test('surfaces the formatted issue for a symbol path key', () => {
    const sym = Symbol('page')
    const error = captureSearchError([
      { message: 'bad symbol key', path: [sym] },
    ])

    expect(error).toBeInstanceOf(SearchParamError)
    expect(error.message).toBe(`[${sym.toString()}]: bad symbol key`)
  })

  test('surfaces the formatted issue for a circular issue object', () => {
    const circular: any = { message: 'circular issue', path: ['filters'] }
    circular.self = circular
    const error = captureSearchError([circular])

    expect(error).toBeInstanceOf(SearchParamError)
    expect(error.message).toBe('["filters"]: circular issue')
  })

  test('reports every issue with its nested path', () => {
    const error = captureSearchError([
      { message: 'Required', path: ['user', 'name'] },
      { message: 'Too small', path: ['user', 'tags', 2] },
    ])

    expect(error).toBeInstanceOf(SearchParamError)
    expect(error.message).toBe(
      '["user"]["name"]: Required\n["user"]["tags"][2]: Too small',
    )
  })
})
