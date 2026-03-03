import { describe, expect, it, vi } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'

describe('skipRouteOnParseError', () => {
  describe('basic matching with parse validation', () => {
    it('matches route when parse succeeds', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => ({
                  id: parseInt(params.id!, 10),
                }),
              },
              skipRouteOnParseError: { params: true },
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/123', processedTree)
      expect(result?.route.id).toBe('/$id')
      // params contains raw string values for interpolatePath
      expect(result?.rawParams).toEqual({ id: '123' })
      // parsedParams contains the transformed values from parse
      expect(result?.parsedParams).toEqual({ id: 123 })
    })

    it('skips route when parse throws and finds no alternative', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.id!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { id: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/abc', processedTree)
      expect(result).toBeNull()
    })

    it('skips route when parse throws and finds alternative match', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.id!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { id: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      // numeric should match the validated route
      const numericResult = findRouteMatch('/123', processedTree)
      expect(numericResult?.route.id).toBe('/$id')
      // params contains raw string values for interpolatePath
      expect(numericResult?.rawParams).toEqual({ id: '123' })
      // parsedParams contains the transformed values from parse
      expect(numericResult?.parsedParams).toEqual({ id: 123 })

      // non-numeric should fall through to the non-validated route
      const slugResult = findRouteMatch('/hello-world', processedTree)
      expect(slugResult?.route.id).toBe('/$slug')
      expect(slugResult?.rawParams).toEqual({ slug: 'hello-world' })
    })
  })

  describe('priority: validated routes take precedence', () => {
    it('validated dynamic route has priority over non-validated dynamic route', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
            options: {},
          },
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.id!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { id: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      // validated route should be tried first
      const numericResult = findRouteMatch('/123', processedTree)
      expect(numericResult?.route.id).toBe('/$id')
    })

    it('static route still has priority over validated dynamic route', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/settings',
            fullPath: '/settings',
            path: 'settings',
            options: {},
          },
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.id!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { id: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/settings', processedTree)
      expect(result?.route.id).toBe('/settings')
    })

    it('deep validated route can still fallback to sibling', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        children: [
          {
            id: '/$a/$b/$c',
            fullPath: '/$a/$b/$c',
            path: '$a/$b/$c',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  // if (params.a !== 'one') throw new Error('Invalid a')
                  // if (params.b !== 'two') throw new Error('Invalid b')
                  if (params.c !== 'three') throw new Error('Invalid c')
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$x/$y/$z',
            fullPath: '/$x/$y/$z',
            path: '$x/$y/$z',
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      {
        const result = findRouteMatch('/one/two/three', processedTree)
        expect(result?.route.id).toBe('/$a/$b/$c')
      }
      {
        const result = findRouteMatch('/one/two/wrong', processedTree)
        expect(result?.route.id).toBe('/$x/$y/$z')
      }
    })
  })

  describe('regex-like validation patterns', () => {
    it('uuid validation pattern', () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$uuid',
            fullPath: '/$uuid',
            path: '$uuid',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  if (!uuidRegex.test(params.uuid!))
                    throw new Error('Not a UUID')
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      const uuidResult = findRouteMatch(
        '/550e8400-e29b-41d4-a716-446655440000',
        processedTree,
      )
      expect(uuidResult?.route.id).toBe('/$uuid')

      const slugResult = findRouteMatch('/my-blog-post', processedTree)
      expect(slugResult?.route.id).toBe('/$slug')
    })

    it('date validation pattern (YYYY-MM-DD)', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/posts/$date',
            fullPath: '/posts/$date',
            path: 'posts/$date',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const date = new Date(params.date!)
                  if (date.toString() === 'Invalid Date')
                    throw new Error('Not a date')
                  return { date }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/posts/$slug',
            fullPath: '/posts/$slug',
            path: 'posts/$slug',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      const dateResult = findRouteMatch('/posts/2024-01-15', processedTree)
      expect(dateResult?.route.id).toBe('/posts/$date')
      // params contains raw string values for interpolatePath
      expect(dateResult?.rawParams.date).toBe('2024-01-15')
      // parsedParams contains the transformed values from parse
      expect(dateResult?.parsedParams?.date).toBeInstanceOf(Date)

      const slugResult = findRouteMatch('/posts/my-first-post', processedTree)
      expect(slugResult?.route.id).toBe('/posts/$slug')
    })
  })

  describe('nested routes with skipRouteOnParseError', () => {
    it('parent validation failure prevents child matching', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$orgId',
            fullPath: '/$orgId',
            path: '$orgId',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.orgId!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { orgId: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
            children: [
              {
                id: '/$orgId/settings',
                fullPath: '/$orgId/settings',
                path: 'settings',
                options: {},
              },
            ],
          },
          {
            id: '/$slug/about',
            fullPath: '/$slug/about',
            path: '$slug/about',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      // numeric org should match the validated route
      const numericResult = findRouteMatch('/123/settings', processedTree)
      expect(numericResult?.route.id).toBe('/$orgId/settings')

      // non-numeric should not match /$orgId/settings, should match /$slug/about
      const slugResult = findRouteMatch('/my-org/about', processedTree)
      expect(slugResult?.route.id).toBe('/$slug/about')
    })

    it('child validation failure falls back to sibling', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/users',
            fullPath: '/users',
            path: 'users',
            options: {},
            children: [
              {
                id: '/users/$userId',
                fullPath: '/users/$userId',
                path: '$userId',
                options: {
                  params: {
                    parse: (params: Record<string, string>) => {
                      const num = parseInt(params.userId!, 10)
                      if (isNaN(num)) throw new Error('Not a number')
                      return { userId: num }
                    },
                  },
                  skipRouteOnParseError: { params: true },
                },
              },
              {
                id: '/users/$username',
                fullPath: '/users/$username',
                path: '$username',
                options: {},
              },
            ],
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      const numericResult = findRouteMatch('/users/42', processedTree)
      expect(numericResult?.route.id).toBe('/users/$userId')
      // params contains raw string values for interpolatePath
      expect(numericResult?.rawParams).toEqual({ userId: '42' })
      // parsedParams contains the transformed values from parse
      expect(numericResult?.parsedParams).toEqual({ userId: 42 })

      const usernameResult = findRouteMatch('/users/johndoe', processedTree)
      expect(usernameResult?.route.id).toBe('/users/$username')
      // Non-validated route: params are raw strings, parsedParams is undefined
      expect(usernameResult?.rawParams).toEqual({ username: 'johndoe' })
      expect(usernameResult?.parsedParams).toBeUndefined()
    })
  })

  describe('pathless routes with skipRouteOnParseError', () => {
    // Pathless layouts with skipRouteOnParseError should gate their children
    it('pathless layout with validation gates children', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/',
            fullPath: '/',
            path: '/',
            options: {},
          },
          {
            id: '/$foo/_layout',
            fullPath: '/$foo',
            path: '$foo',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.foo!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { foo: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
            children: [
              {
                id: '/$foo/_layout/bar',
                fullPath: '/$foo/bar',
                path: 'bar',
                options: {},
              },
              {
                id: '/$foo/_layout/',
                fullPath: '/$foo/',
                path: '/',
                options: {},
              },
            ],
          },
          {
            id: '/$foo/hello',
            fullPath: '/$foo/hello',
            path: '$foo/hello',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      // numeric foo should match through the validated layout
      const numericBarResult = findRouteMatch('/123/bar', processedTree)
      expect(numericBarResult?.route.id).toBe('/$foo/_layout/bar')

      const numericIndexResult = findRouteMatch('/123', processedTree)
      expect(numericIndexResult?.route.id).toBe('/$foo/_layout/')
      expect(numericIndexResult?.rawParams).toEqual({ foo: '123' })
      expect(numericIndexResult?.parsedParams).toEqual({ foo: 123 })

      // non-numeric foo should fall through to the non-validated route
      const helloResult = findRouteMatch('/abc/hello', processedTree)
      expect(helloResult?.route.id).toBe('/$foo/hello')
      expect(helloResult?.rawParams).toEqual({ foo: 'abc' })

      // non-numeric foo should NOT match the children of the validated layout
      const barResult = findRouteMatch('/abc/bar', processedTree)
      expect(barResult).toBeNull()
    })
  })

  describe('optional params with skipRouteOnParseError', () => {
    it('optional param with static fallback', () => {
      // Optional param with validation, with a static fallback
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/{-$lang}/home',
            fullPath: '/{-$lang}/home',
            path: '{-$lang}/home',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const validLangs = ['en', 'es', 'fr', 'de']
                  if (params.lang && !validLangs.includes(params.lang)) {
                    throw new Error('Invalid language')
                  }
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/home',
            fullPath: '/home',
            path: 'home',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      // valid language should match the validated route
      const enResult = findRouteMatch('/en/home', processedTree)
      expect(enResult?.route.id).toBe('/{-$lang}/home')
      expect(enResult?.parsedParams).toEqual({ lang: 'en' })

      // root path + home - both routes can match
      // The optional route (with skipped param) has greater depth, so it wins
      // This is the expected behavior per the priority system
      const rootResult = findRouteMatch('/home', processedTree)
      expect(rootResult?.route.id).toBe('/{-$lang}/home')

      // invalid language should NOT match the validated optional route
      // and since there's no dynamic fallback, it should return null
      const invalidResult = findRouteMatch('/it/home', processedTree)
      expect(invalidResult).toBeNull()
    })

    it('optional param at root with validation', () => {
      // Optional param that validates and allows skipping
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/{-$lang}',
            fullPath: '/{-$lang}',
            path: '{-$lang}',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const validLangs = ['en', 'es', 'fr', 'de']
                  if (params.lang && !validLangs.includes(params.lang)) {
                    throw new Error('Invalid language')
                  }
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      // valid language should match
      const enResult = findRouteMatch('/en', processedTree)
      expect(enResult?.route.id).toBe('/{-$lang}')
      expect(enResult?.parsedParams).toEqual({ lang: 'en' })

      // root path should match (optional skipped)
      const rootResult = findRouteMatch('/', processedTree)
      expect(rootResult?.route.id).toBe('/{-$lang}')
      expect(rootResult?.parsedParams).toEqual({})

      // invalid language should NOT match (no fallback route)
      const invalidResult = findRouteMatch('/about', processedTree)
      expect(invalidResult).toBeNull()
    })
  })

  describe('wildcard routes with skipRouteOnParseError', () => {
    it('wildcard with validation', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/files/$',
            fullPath: '/files/$',
            path: 'files/$',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  if (params._splat!.includes('..')) {
                    throw new Error('Upward navigation not allowed')
                  }
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/files',
            fullPath: '/files',
            path: 'files',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      // path should match the validated wildcard route
      const txtResult = findRouteMatch('/files/docs/readme.txt', processedTree)
      expect(txtResult?.route.id).toBe('/files/$')

      // path with upward navigation should fall through to the static /files route
      const otherResult = findRouteMatch(
        '/files/../../secret/photo.jpg',
        processedTree,
        true,
      )
      expect(otherResult?.route.id).toBe('/files')
      expect(otherResult?.rawParams['**']).toBe('../../secret/photo.jpg')
    })
    it('index parse failure does not block wildcard sibling', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/a/',
            fullPath: '/a/',
            path: 'a/',
            options: {
              params: {
                parse: () => {
                  throw new Error('Invalid index')
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/a/$',
            fullPath: '/a/$',
            path: 'a/$',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/a', processedTree)
      expect(result?.route.id).toBe('/a/$')
      expect(result?.rawParams).toEqual({ '*': '', _splat: '' })
    })
  })

  describe('multiple validated routes competing', () => {
    it('first matching validated route wins', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$uuid',
            fullPath: '/$uuid',
            path: '$uuid',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const uuidRegex =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                  if (!uuidRegex.test(params.uuid!))
                    throw new Error('Not a UUID')
                  return params
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$number',
            fullPath: '/$number',
            path: '$number',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  const num = parseInt(params.number!, 10)
                  if (isNaN(num)) throw new Error('Not a number')
                  return { number: num }
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$slug',
            fullPath: '/$slug',
            path: '$slug',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)

      const uuidResult = findRouteMatch(
        '/550e8400-e29b-41d4-a716-446655440000',
        processedTree,
      )
      expect(uuidResult?.route.id).toBe('/$uuid')

      const numberResult = findRouteMatch('/42', processedTree)
      expect(numberResult?.route.id).toBe('/$number')
      // params contains raw string values for interpolatePath
      expect(numberResult?.rawParams).toEqual({ number: '42' })
      // parsedParams contains the transformed values from parse
      expect(numberResult?.parsedParams).toEqual({ number: 42 })

      const slugResult = findRouteMatch('/hello-world', processedTree)
      expect(slugResult?.route.id).toBe('/$slug')
    })
    it('priority option can be used to influence order', () => {
      const alphabetical = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$a',
            fullPath: '/$a',
            path: '$a',
            options: {
              params: {
                parse: (params: Record<string, string>) => params,
              },
              skipRouteOnParseError: {
                params: true,
                priority: 1, // higher priority than /$z
              },
            },
          },
          {
            id: '/$z',
            fullPath: '/$z',
            path: '$z',
            options: {
              params: {
                parse: (params: Record<string, string>) => params,
              },
              skipRouteOnParseError: {
                params: true,
                priority: -1, // lower priority than /$a
              },
            },
          },
        ],
      }
      {
        const { processedTree } = processRouteTree(alphabetical)
        const result = findRouteMatch('/123', processedTree)
        expect(result?.route.id).toBe('/$a')
      }
      const reverse = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$a',
            fullPath: '/$a',
            path: '$a',
            options: {
              params: {
                parse: (params: Record<string, string>) => params,
              },
              skipRouteOnParseError: {
                params: true,
                priority: -1, // lower priority than /$z
              },
            },
          },
          {
            id: '/$z',
            fullPath: '/$z',
            path: '$z',
            options: {
              params: {
                parse: (params: Record<string, string>) => params,
              },
              skipRouteOnParseError: {
                params: true,
                priority: 1, // higher priority than /$a
              },
            },
          },
        ],
      }
      {
        const { processedTree } = processRouteTree(reverse)
        const result = findRouteMatch('/123', processedTree)
        expect(result?.route.id).toBe('/$z')
      }
    })
  })

  describe('params.parse without skipRouteOnParseError', () => {
    it('params.parse is NOT called during matching when skipRouteOnParseError is false', () => {
      const parse = vi.fn()
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: { parse },
              // skipRouteOnParseError is NOT set
            },
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/123', processedTree)
      expect(result?.route.id).toBe('/$id')
      // parse should NOT be called during matching
      expect(parse).not.toHaveBeenCalled()
      // params should be raw strings
      expect(result?.rawParams).toEqual({ id: '123' })
    })
  })

  describe('edge cases', () => {
    it('validation error type does not matter', () => {
      const tree = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: [
          {
            id: '/$id',
            fullPath: '/$id',
            path: '$id',
            options: {
              params: {
                parse: () => {
                  throw 'string error' // not an Error object
                },
              },
              skipRouteOnParseError: { params: true },
            },
          },
          {
            id: '/$fallback',
            fullPath: '/$fallback',
            path: '$fallback',
            options: {},
          },
        ],
      }
      const { processedTree } = processRouteTree(tree)
      const result = findRouteMatch('/test', processedTree)
      expect(result?.route.id).toBe('/$fallback')
    })
  })
})
