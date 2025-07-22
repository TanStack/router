import { describe, expect, it } from 'vitest'
import { matchByPath } from '../src'

describe('default path matching', () => {
  it('should match a static path', () => {
    expect(matchByPath('', '', { to: '' })).toEqual({})
    expect(matchByPath('', '/', { to: '' })).toEqual({})
    expect(matchByPath('', '', { to: '/' })).toEqual({})
    expect(matchByPath('', '/', { to: '/' })).toEqual({})
    expect(matchByPath('/', '/', { to: '/' })).toEqual({})
    expect(matchByPath('/', '/a', { to: '/a' })).toEqual({})
    expect(matchByPath('/', '/a/b', { to: '/a/b' })).toEqual({})
    expect(matchByPath('/', '/a', { to: '/a/' })).toEqual({})
    expect(matchByPath('/', '/a/', { to: '/a/' })).toEqual({})
    expect(matchByPath('/', '/a/', { to: '/a' })).toBeFalsy()
    expect(matchByPath('/', '/b', { to: '/a' })).toBeFalsy()
  })
  it('should match path with params', () => {
    expect(matchByPath('/', '/a/1', { to: '/a/$id' })).toEqual({ id: '1' })
    expect(matchByPath('/', '/a/1/b', { to: '/a/$id/b' })).toEqual({ id: '1' })
    expect(matchByPath('/', '/a/1/b/2', { to: '/a/$id/b/$other' })).toEqual({
      id: '1',
      other: '2',
    })
    expect(matchByPath('/', '/a/1/b/2', { to: '/a/$id/b/$id' })).toEqual({
      id: '2',
    }) // not sure this is needed / intentional / can even happen
  })
  it('should match path with optional params', () => {
    expect(matchByPath('/', '/a/1', { to: '/a/{-$id}' })).toEqual({ id: '1' })
    expect(matchByPath('/', '/a', { to: '/a/{-$id}' })).toEqual({})
    expect(matchByPath('/', '/a/1/b', { to: '/a/{-$id}/b' })).toEqual({
      id: '1',
    })
    expect(matchByPath('/', '/a/b', { to: '/a/{-$id}/b' })).toEqual({})
    expect(
      matchByPath('/', '/a/1/b/2', { to: '/a/{-$id}/b/{-$other}' }),
    ).toEqual({ id: '1', other: '2' })
    expect(matchByPath('/', '/a/b/2', { to: '/a/{-$id}/b/{-$other}' })).toEqual(
      { other: '2' },
    )
    expect(matchByPath('/', '/a/1/b', { to: '/a/{-$id}/b/{-$other}' })).toEqual(
      { id: '1' },
    )
    expect(matchByPath('/', '/a/b', { to: '/a/{-$id}/b/{-$other}' })).toEqual(
      {},
    )
    expect(matchByPath('/', '/a/1/b/2', { to: '/a/{-$id}/b/{-$id}' })).toEqual({
      id: '2',
    }) // not sure this is needed / intentional / can even happen
  })
  it('should match path with wildcard params', () => {
    expect(matchByPath('/', '/a/b/c', { to: '/a/$' })).toEqual({
      _splat: 'b/c',
      '*': 'b/c',
    })
    expect(matchByPath('/', '/a/', { to: '/a/$' })).toEqual({
      _splat: '/',
      '*': '/',
    }) // is this intended? since the above match doesn't include the leading slash, this feels weird
    expect(matchByPath('/', '/a', { to: '/a/$' })).toEqual({
      _splat: '',
      '*': '',
    })
    expect(matchByPath('/', '/a/b/c', { to: '/a/$/foo' })).toEqual({
      _splat: 'b/c',
      '*': 'b/c',
    })
  })
})

describe('case insensitive path matching', () => {
  it('should match a static path case insensitively', () => {
    expect(matchByPath('', '', { to: '', caseSensitive: false })).toEqual({})
    expect(matchByPath('', '/', { to: '', caseSensitive: false })).toEqual({})
    expect(matchByPath('', '', { to: '/', caseSensitive: false })).toEqual({})
    expect(matchByPath('', '/', { to: '/', caseSensitive: false })).toEqual({})
    expect(matchByPath('/', '/', { to: '/', caseSensitive: false })).toEqual({})
    expect(matchByPath('/', '/a', { to: '/A', caseSensitive: false })).toEqual(
      {},
    )
    expect(
      matchByPath('/', '/a/b', { to: '/A/B', caseSensitive: false }),
    ).toEqual({})
    expect(matchByPath('/', '/a', { to: '/A/', caseSensitive: false })).toEqual(
      {},
    )
    expect(
      matchByPath('/', '/a/', { to: '/A/', caseSensitive: false }),
    ).toEqual({})
    expect(
      matchByPath('/', '/a/', { to: '/A', caseSensitive: false }),
    ).toBeFalsy()
    expect(
      matchByPath('/', '/b', { to: '/A', caseSensitive: false }),
    ).toBeFalsy()
  })
  it('should match path with params case insensitively', () => {
    expect(
      matchByPath('/', '/a/1', { to: '/A/$id', caseSensitive: false }),
    ).toEqual({ id: '1' })
    expect(
      matchByPath('/', '/a/1/b', { to: '/A/$id/B', caseSensitive: false }),
    ).toEqual({ id: '1' })
    expect(
      matchByPath('/', '/a/1/b/2', {
        to: '/A/$id/B/$other',
        caseSensitive: false,
      }),
    ).toEqual({ id: '1', other: '2' })
    expect(
      matchByPath('/', '/a/1/b/2', {
        to: '/A/$id/B/$id',
        caseSensitive: false,
      }),
    ).toEqual({ id: '2' }) // not sure this is needed / intentional / can even happen
  })
  it('should match path with optional params case insensitively', () => {
    expect(
      matchByPath('/', '/a/1', { to: '/A/{-$id}', caseSensitive: false }),
    ).toEqual({ id: '1' })
    expect(
      matchByPath('/', '/a', { to: '/A/{-$id}', caseSensitive: false }),
    ).toEqual({})
    expect(
      matchByPath('/', '/a/1/b', { to: '/A/{-$id}/B', caseSensitive: false }),
    ).toEqual({ id: '1' })
    // expect(matchByPath('/', '/a/b', { to: '/A/{-$id}/B', caseSensitive: false })).toEqual({})
    expect(
      matchByPath('/', '/a/1/b/2', {
        to: '/A/{-$id}/B/{-$other}',
        caseSensitive: false,
      }),
    ).toEqual({ id: '1', other: '2' })
    // expect(matchByPath('/', '/a/b/2', { to: '/A/{-$id}/B/{-$other}', caseSensitive: false })).toEqual({ other: '2' })
    expect(
      matchByPath('/', '/a/1/b', {
        to: '/A/{-$id}/B/{-$other}',
        caseSensitive: false,
      }),
    ).toEqual({ id: '1' })
    // expect(matchByPath('/', '/a/b', { to: '/A/{-$id}/B/{-$other}', caseSensitive: false })).toEqual({})
    expect(
      matchByPath('/', '/a/1/b/2', {
        to: '/A/{-$id}/B/{-$id}',
        caseSensitive: false,
      }),
    ).toEqual({ id: '2' }) // not sure this is needed / intentional / can even happen
  })
  it('should match path with wildcard params case insensitively', () => {
    expect(
      matchByPath('/', '/a/b/c', { to: '/A/$', caseSensitive: false }),
    ).toEqual({ _splat: 'b/c', '*': 'b/c' })
    expect(
      matchByPath('/', '/a/', { to: '/A/$', caseSensitive: false }),
    ).toEqual({ _splat: '/', '*': '/' }) // is this intended? since the above match doesn't include the leading slash, this feels weird
    expect(
      matchByPath('/', '/a', { to: '/A/$', caseSensitive: false }),
    ).toEqual({ _splat: '', '*': '' })
    expect(
      matchByPath('/', '/a/b/c', { to: '/A/$/foo', caseSensitive: false }),
    ).toEqual({ _splat: 'b/c', '*': 'b/c' })
  })
})

describe('fuzzy path matching', () => {
  it('should match a static path fuzzily', () => {
    expect(matchByPath('', '', { to: '', fuzzy: true })).toEqual({})
    expect(matchByPath('', '/', { to: '', fuzzy: true })).toEqual({})
    expect(matchByPath('', '', { to: '/', fuzzy: true })).toEqual({})
    expect(matchByPath('', '/', { to: '/', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/', { to: '/', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/a', { to: '/a', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/a', { to: '/a/', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/a/', { to: '/a/', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/a/', { to: '/a', fuzzy: true })).toEqual({
      '**': '/',
    })
    expect(matchByPath('/', '/a/b', { to: '/a/b', fuzzy: true })).toEqual({})
    expect(matchByPath('/', '/a/b', { to: '/a', fuzzy: true })).toEqual({
      '**': 'b',
    })
    expect(matchByPath('/', '/a/b/', { to: '/a', fuzzy: true })).toEqual({
      '**': 'b/',
    })
    expect(matchByPath('/', '/a/b/c', { to: '/a', fuzzy: true })).toEqual({
      '**': 'b/c',
    })
    expect(matchByPath('/', '/a', { to: '/a/b', fuzzy: true })).toBeFalsy()
    expect(matchByPath('/', '/b', { to: '/a', fuzzy: true })).toBeFalsy()
    expect(matchByPath('/', '/a', { to: '/b', fuzzy: true })).toBeFalsy()
  })

  it('should match path with params fuzzily', () => {
    expect(matchByPath('/', '/a/1', { to: '/a/$id', fuzzy: true })).toEqual({
      id: '1',
    })
    expect(matchByPath('/', '/a/1/b', { to: '/a/$id', fuzzy: true })).toEqual({
      id: '1',
      '**': 'b',
    })
    expect(matchByPath('/', '/a/1/', { to: '/a/$id/', fuzzy: true })).toEqual({
      id: '1',
    })
    expect(
      matchByPath('/', '/a/1/b/2', { to: '/a/$id/b/$other', fuzzy: true }),
    ).toEqual({ id: '1', other: '2' })
    expect(
      matchByPath('/', '/a/1/b/2/c', { to: '/a/$id/b/$other', fuzzy: true }),
    ).toEqual({ id: '1', other: '2', '**': 'c' })
  })

  it('should match path with optional params fuzzily', () => {
    expect(matchByPath('/', '/a/1', { to: '/a/{-$id}', fuzzy: true })).toEqual({
      id: '1',
    })
    expect(matchByPath('/', '/a', { to: '/a/{-$id}', fuzzy: true })).toEqual({})
    expect(
      matchByPath('/', '/a/1/b', { to: '/a/{-$id}', fuzzy: true }),
    ).toEqual({ '**': 'b', id: '1' })
    expect(
      matchByPath('/', '/a/1/b', { to: '/a/{-$id}/b', fuzzy: true }),
    ).toEqual({ id: '1' })
    expect(
      matchByPath('/', '/a/b', { to: '/a/{-$id}/b', fuzzy: true }),
    ).toEqual({})
    expect(
      matchByPath('/', '/a/b/c', { to: '/a/{-$id}/b', fuzzy: true }),
    ).toEqual({ '**': 'c' })
    expect(
      matchByPath('/', '/a/b', { to: '/a/{-$id}/b/{-$other}', fuzzy: true }),
    ).toEqual({})
    expect(
      matchByPath('/', '/a/b/2/d', {
        to: '/a/{-$id}/b/{-$other}',
        fuzzy: true,
      }),
    ).toEqual({ other: '2', '**': 'd' })
    expect(
      matchByPath('/', '/a/1/b/2/c', {
        to: '/a/{-$id}/b/{-$other}',
        fuzzy: true,
      }),
    ).toEqual({ id: '1', other: '2', '**': 'c' })
  })
})
