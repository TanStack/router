import { describe, test, expect } from 'vitest'
import { RootRoute, Router } from '../src'

describe('router', () => {
  ;(
    [
      [
        '',
        '/'
      ],
      [
        '/',
        '/'
      ],
      [
        '/a',
        '/a'
      ],
      [
        '/a/',
        '/a'
      ],
    ] as const
  ).forEach(([input, eq]) => {
    test(`basepath="${input}" results in router's basepath="${eq}"`, () => {
      const router = new Router({
          routeTree: new RootRoute(),
          basepath: input
      })
      expect(router.basepath).toEqual(eq)
    })
  })
})
