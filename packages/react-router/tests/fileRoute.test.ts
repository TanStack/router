/* eslint-disable */
import { describe, it, expect } from 'vitest'
import {
  getRouteApi,
  createFileRoute,
  createLazyRoute,
  createLazyFileRoute,
  LazyRoute,
} from '../src'

describe('createFileRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  // @ts-expect-error
  const route = createFileRoute('')({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
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
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('createLazyRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const route = createLazyRoute({})({})
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('LazyRoute options.id should not include parent segments', () => {
  describe('createLazyRoute', () => {
    it('should set id to the last path segment without parents', () => {
      const id = '/parent_a/parent_b/child'
      const route = createLazyRoute(id)({})
      expect(route.options.id).toBe('/child')
    })

    it('should remove group patterns from id', () => {
      const idWithGroups = '/parent_a/(group)/child'
      const route = createLazyRoute(idWithGroups)({})
      expect(route.options.id).toBe('/child')
    })

    it('should replace multiple slashes with a single slash', () => {
      const idWithDoubleSlashes = '/parent_a//child'
      const route = createLazyRoute(idWithDoubleSlashes)({})
      expect(route.options.id).toBe('/child')
    })

    it('should not change anything when the id is already trimmed', ()=> {
      const normalId = '/child'
      const route = createLazyRoute(normalId)({})
      expect(route.options.id).toBe('/child') 
    })
  })

  describe('createLazyFileRoute', () => {
    it('should set id to the last path segment without parents', () => {
      const id = '/parent_a/parent_b/child'
      // @ts-expect-error
      const route = createLazyFileRoute(id)({})
      expect(route.options.id).toBe('/child')
    })

    it('should remove group patterns from id', () => {
      const idWithGroups = '/parent_a/(group)/child'
      // @ts-expect-error
      const route = createLazyFileRoute(idWithGroups)({})
      expect(route.options.id).toBe('/child')
    })

    it('should replace multiple slashes with a single slash', () => {
      const idWithDoubleSlashes = '/parent_a//child'
      // @ts-expect-error
      const route = createLazyFileRoute(idWithDoubleSlashes)({})
      expect(route.options.id).toBe('/child')
    })

    it('should not change anything when the id is already trimmed', ()=> {
      const normalId = '/child'
      // @ts-expect-error
      const route = createLazyFileRoute(normalId)({})
      expect(route.options.id).toBe('/child') 
    })
  })
})
