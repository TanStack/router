import { describe, expect, it } from 'vitest'
import { matchByPath } from '../src'

describe('default path matching', () => {
  it.each([
    ['', '', '', {}],
    ['', '/', '', {}],
    ['', '', '/', {}],
    ['', '/', '/', {}],
    ['/', '/', '/', {}],
    ['/', '/a', '/a', {}],
    ['/', '/a/b', '/a/b', {}],
    ['/', '/a', '/a/', {}],
    ['/', '/a/', '/a/', {}],
    ['/', '/a/', '/a', undefined],
    ['/', '/b', '/a', undefined],
  ])('static %s %s => %s', (base, from, to, result) => {
    expect(
      matchByPath(base, from, { to, caseSensitive: true, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/1', '/a/$id', { id: '1' }],
    ['/a/1/b', '/a/$id/b', { id: '1' }],
    ['/a/1/b/2', '/a/$id/b/$other', { id: '1', other: '2' }],
    ['/a/1/b/2', '/a/$id/b/$id', { id: '2' }],
  ])('params %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
    ).toEqual(result)
  })

  it('params support more than alphanumeric characters', () => {
    // in the value: basically everything except / and %
    expect(matchByPath('/', '/a/@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{', { to: '/a/$id' })).toEqual({ id: '@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{' })
    // in the key: basically everything except / and % and $
    expect(matchByPath('/', '/a/1', { to: '/a/$@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{' })).toEqual({ '@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{': '1' })
  })

  it.each([
    ['/a/1', '/a/{-$id}', { id: '1' }],
    ['/a', '/a/{-$id}', {}],
    ['/a/1/b', '/a/{-$id}/b', { id: '1' }],
    ['/a/b', '/a/{-$id}/b', {}],
    ['/a/1/b/2', '/a/{-$id}/b/{-$other}', { id: '1', other: '2' }],
    ['/a/b/2', '/a/{-$id}/b/{-$other}', { other: '2' }],
    ['/a/1/b', '/a/{-$id}/b/{-$other}', { id: '1' }],
    ['/a/b', '/a/{-$id}/b/{-$other}', {}],
    ['/a/1/b/2', '/a/{-$id}/b/{-$id}', { id: '2' }],
  ])('optional %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/b/c', '/a/$', { _splat: 'b/c', '*': 'b/c' }],
    ['/a/', '/a/$', { _splat: '/', '*': '/' }],
    ['/a', '/a/$', { _splat: '', '*': '' }],
    ['/a/b/c', '/a/$/foo', { _splat: 'b/c', '*': 'b/c' }],
  ])('wildcard %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
    ).toEqual(result)
  })
})

describe('case insensitive path matching', () => {
  it.each([
    ['', '', '', {}],
    ['', '/', '', {}],
    ['', '', '/', {}],
    ['', '/', '/', {}],
    ['/', '/', '/', {}],
    ['/', '/a', '/A', {}],
    ['/', '/a/b', '/A/B', {}],
    ['/', '/a', '/A/', {}],
    ['/', '/a/', '/A/', {}],
    ['/', '/a/', '/A', undefined],
    ['/', '/b', '/A', undefined],
  ])('static %s %s => %s', (base, from, to, result) => {
    expect(
      matchByPath(base, from, { to, caseSensitive: false, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/1', '/A/$id', { id: '1' }],
    ['/a/1/b', '/A/$id/B', { id: '1' }],
    ['/a/1/b/2', '/A/$id/B/$other', { id: '1', other: '2' }],
    ['/a/1/b/2', '/A/$id/B/$id', { id: '2' }],
  ])('params %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/1', '/A/{-$id}', { id: '1' }],
    ['/a', '/A/{-$id}', {}],
    ['/a/1/b', '/A/{-$id}/B', { id: '1' }],
    // ['/a/b', '/A/{-$id}/B', {}],
    ['/a/1/b/2', '/A/{-$id}/B/{-$other}', { id: '1', other: '2' }],
    // ['/a/b/2', '/A/{-$id}/B/{-$other}', { other: '2' }],
    ['/a/1/b', '/A/{-$id}/B/{-$other}', { id: '1' }],
    // ['/a/b', '/A/{-$id}/B/{-$other}', {}],
    ['/a/1/b/2', '/A/{-$id}/B/{-$id}', { id: '2' }],
  ])('optional %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/b/c', '/A/$', { _splat: 'b/c', '*': 'b/c' }],
    ['/a/', '/A/$', { _splat: '/', '*': '/' }],
    ['/a', '/A/$', { _splat: '', '*': '' }],
    ['/a/b/c', '/A/$/foo', { _splat: 'b/c', '*': 'b/c' }],
  ])('wildcard %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
    ).toEqual(result)
  })
})

describe('fuzzy path matching', () => {
  it.each([
    ['', '', '', {}],
    ['', '/', '', {}],
    ['', '', '/', {}],
    ['', '/', '/', {}],
    ['/', '/', '/', {}],
    ['/', '/a', '/a', {}],
    ['/', '/a', '/a/', {}],
    ['/', '/a/', '/a/', {}],
    ['/', '/a/', '/a', { '**': '/' }],
    ['/', '/a/b', '/a/b', {}],
    ['/', '/a/b', '/a', { '**': 'b' }],
    ['/', '/a/b/', '/a', { '**': 'b/' }],
    ['/', '/a/b/c', '/a', { '**': 'b/c' }],
    ['/', '/a', '/a/b', undefined],
    ['/', '/b', '/a', undefined],
    ['/', '/a', '/b', undefined],
  ])('static %s %s => %s', (base, from, to, result) => {
    expect(
      matchByPath(base, from, { to, fuzzy: true, caseSensitive: true }),
    ).toEqual(result)
  })

  it.each([
    ['/a/1', '/a/$id', { id: '1' }],
    ['/a/1/b', '/a/$id', { id: '1', '**': 'b' }],
    ['/a/1/', '/a/$id/', { id: '1' }],
    ['/a/1/b/2', '/a/$id/b/$other', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/a/$id/b/$other', { id: '1', other: '2', '**': 'c' }],
  ])('params %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
    ).toEqual(result)
  })

  it.each([
    ['/a/1', '/a/{-$id}', { id: '1' }],
    ['/a', '/a/{-$id}', {}],
    ['/a/1/b', '/a/{-$id}', { '**': 'b', id: '1' }],
    ['/a/1/b', '/a/{-$id}/b', { id: '1' }],
    ['/a/b', '/a/{-$id}/b', {}],
    ['/a/b/c', '/a/{-$id}/b', { '**': 'c' }],
    ['/a/b', '/a/{-$id}/b/{-$other}', {}],
    ['/a/b/2/d', '/a/{-$id}/b/{-$other}', { other: '2', '**': 'd' }],
    ['/a/1/b/2/c', '/a/{-$id}/b/{-$other}', { id: '1', other: '2', '**': 'c' }],
  ])('optional %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
    ).toEqual(result)
  })

  it.each([
    ['/a/b/c', '/a/$', { _splat: 'b/c', '*': 'b/c' }],
    ['/a/', '/a/$', { _splat: '/', '*': '/' }],
    ['/a', '/a/$', { _splat: '', '*': '' }],
    ['/a/b/c/d', '/a/$/foo', { _splat: 'b/c/d', '*': 'b/c/d' }],
  ])('wildcard %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
    ).toEqual(result)
  })
})
