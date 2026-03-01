import { describe, expect, it } from 'vitest'
import { createRootRoute, createRoute, getRouteApi } from '../src'

describe('getRouteApi', () => {
  it('should have the injectMatch method', () => {
    const api = getRouteApi('foo')
    expect(api.injectMatch).toBeDefined()
  })

  it('should have the injectRouteContext method', () => {
    const api = getRouteApi('foo')
    expect(api.injectRouteContext).toBeDefined()
  })

  it('should have the injectSearch method', () => {
    const api = getRouteApi('foo')
    expect(api.injectSearch).toBeDefined()
  })

  it('should have the injectParams method', () => {
    const api = getRouteApi('foo')
    expect(api.injectParams).toBeDefined()
  })

  it('should have the injectLoaderData method', () => {
    const api = getRouteApi('foo')
    expect(api.injectLoaderData).toBeDefined()
  })

  it('should have the injectLoaderDeps method', () => {
    const api = getRouteApi('foo')
    expect(api.injectLoaderDeps).toBeDefined()
  })

  it('should have the injectNavigate method', () => {
    const api = getRouteApi('foo')
    expect(api.injectNavigate).toBeDefined()
  })
})

describe('createRoute has the same methods as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const methodNames = Object.keys(routeApi).filter((key) =>
    key.startsWith('inject'),
  )
  const route = createRoute({
    id: 'foo',
    getParentRoute: () => createRootRoute(),
  })

  it.each(methodNames.map((name) => [name]))(
    'should have the "%s" method defined',
    (methodName) => {
      expect(route[methodName as keyof typeof route]).toBeDefined()
    },
  )
})

