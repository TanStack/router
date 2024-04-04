/* eslint-disable */
import { describe, it, expect } from 'vitest'
import { getRouteApi, createRoute } from '../src'

describe('getRouteApi', () => {
  it('should have the useMatch hook', () => {
    const api = getRouteApi('foo')
    expect(api.useMatch).toBeDefined()
  })

  it('should have the useRouteContext hook', () => {
    const api = getRouteApi('foo')
    expect(api.useRouteContext).toBeDefined()
  })

  it('should have the useSearch hook', () => {
    const api = getRouteApi('foo')
    expect(api.useSearch).toBeDefined()
  })

  it('should have the useParams hook', () => {
    const api = getRouteApi('foo')
    expect(api.useParams).toBeDefined()
  })

  it('should have the useLoaderData hook', () => {
    const api = getRouteApi('foo')
    expect(api.useLoaderData).toBeDefined()
  })

  it('should have the useLoaderDeps hook', () => {
    const api = getRouteApi('foo')
    expect(api.useLoaderDeps).toBeDefined()
  })

  it('should have the useNavigate hook', () => {
    const api = getRouteApi('foo')
    expect(api.useNavigate).toBeDefined()
  })
})

describe('createRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  const route = createRoute({} as any)

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof typeof route]).toBeDefined()
    },
  )
})
