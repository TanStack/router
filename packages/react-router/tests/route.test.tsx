/* eslint-disable */
import { describe, it, expect } from 'vitest'
import {
  getRouteApi,
  createRoute,
  createRootRoute,
  createRouter,
  useNavigate,
} from '../src'
import React from 'react'
import exp from 'constants'

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

describe('throws invariant exception when trying to access properties before `createRouter` completed', () => {
  function setup() {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()
      return (
        <React.Fragment>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </React.Fragment>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <React.Fragment>
            <h1>Posts</h1>
          </React.Fragment>
        )
      },
    })
    const initRouter = () =>
      createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      })
    return { initRouter, rootRoute, indexRoute, postsRoute }
  }

  it('to', () => {
    const { initRouter, indexRoute, postsRoute } = setup()

    const expectedError = `Invariant failed: trying to access property 'to' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`
    expect(() => indexRoute.to).toThrowError(expectedError)
    expect(() => postsRoute.to).toThrowError(expectedError)

    initRouter()

    expect(indexRoute.to).toBe('/')
    expect(postsRoute.to).toBe('/posts')
  })

  it('fullPath', () => {
    const { initRouter, indexRoute, postsRoute } = setup()

    const expectedError = `trying to access property 'fullPath' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`
    expect(() => indexRoute.fullPath).toThrowError(expectedError)
    expect(() => postsRoute.fullPath).toThrowError(expectedError)

    initRouter()

    expect(indexRoute.fullPath).toBe('/')
    expect(postsRoute.fullPath).toBe('/posts')
  })

  it('id', () => {
    const { initRouter, indexRoute, postsRoute } = setup()

    const expectedError = `Invariant failed: trying to access property 'id' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`
    expect(() => indexRoute.id).toThrowError(expectedError)
    expect(() => postsRoute.id).toThrowError(expectedError)

    initRouter()

    expect(indexRoute.to).toBe('/')
    expect(postsRoute.to).toBe('/posts')
  })
})
