import { describe, expect, it } from 'vitest'
import {
  createFileRoute,
  createLazyFileRoute,
  createLazyRoute,
  getRouteApi,
} from '../src'
import type { LazyRoute } from '../src'

describe('createFileRoute has the same inject methods as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const methodNames = Object.keys(routeApi).filter((key) =>
    key.startsWith('inject'),
  )

  // @ts-expect-error test factory shape only
  const route = createFileRoute('')({})

  it.each(methodNames.map((name) => [name]))(
    'should have the "%s" method defined',
    (methodName) => {
      expect(route[methodName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('createLazyFileRoute has the same inject methods as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const methodNames = Object.keys(routeApi).filter((key) =>
    key.startsWith('inject'),
  )

  // @ts-expect-error test factory shape only
  const route = createLazyFileRoute('')({})

  it.each(methodNames.map((name) => [name]))(
    'should have the "%s" method defined',
    (methodName) => {
      expect(route[methodName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('createLazyRoute has the same inject methods as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const route = createLazyRoute({})({})
  const methodNames = Object.keys(routeApi).filter((key) =>
    key.startsWith('inject'),
  )

  it.each(methodNames.map((name) => [name]))(
    'should have the "%s" method defined',
    (methodName) => {
      expect(route[methodName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})
