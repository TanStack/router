import { Location, matchRoute } from '..'

function createLocation(location: Partial<Location>): Location {
  return {
    pathname: '',
    href: '',
    search: {},
    searchStr: '',
    hash: '',
    ...location,
  }
}

describe('matchRoute', () => {
  describe('fuzzy', () => {
    ;[
      [
        {
          pathname: '/',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a' },
      ],
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a/b' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a/b/c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/a/b/',
          fuzzy: true,
        },
        {},
      ],
    ].forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })

  describe('exact', () => {
    ;[
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/',
        },
        undefined,
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/b',
        },
        undefined,
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/b/c',
        },
        {},
      ],
    ].forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })

  describe('params', () => {
    ;[
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/a/:b',
        },
        { b: 'b' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/:b/:c',
        },
        { b: 'b', c: 'c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/:a/:b/:c',
        },
        { a: 'a', b: 'b', c: 'c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/:a/*',
        },
        { a: 'a', '*': 'b/c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/:b/c',
        },
        { b: 'b' },
      ],
    ].forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })
})
