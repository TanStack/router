/* eslint-disable */
import { describe, it, expect } from 'vitest'
import {
  getRouteApi,
  createFileRoute,
  createLazyRoute,
  createLazyFileRoute,
} from '../src'

describe('createFileRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  // @ts-expect-error
  const route = createFileRoute('')({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName]).toBeDefined()
    },
  )
})

describe('createLazyFileRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  // @ts-expect-error
  const route = createLazyFileRoute('')({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName]).toBeDefined()
    },
  )
})

describe('createLazyRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  const route = createLazyRoute({})({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName]).toBeDefined()
    },
  )
})
