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
    expect(
      matchByPath(
        '/',
        '/a/@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{',
        { to: '/a/$id' },
      ),
    ).toEqual({ id: '@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{' })
    // in the key: basically everything except / and % and $
    expect(
      matchByPath('/', '/a/1', {
        to: '/a/$@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{',
      }),
    ).toEqual({ '@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{': '1' })
  })

  it.each([
    ['/a/1', '/a/{-$id}', { id: '1' }],
    ['/a', '/a/{-$id}', {}],
    ['/a/1/b', '/a/{-$id}/b', { id: '1' }],
    ['/a/1/b', '/a/{-$id}/b/', { id: '1' }],
    ['/a/b', '/a/{-$id}/b', {}],
    ['/a/b', '/a/{-$id}/b/', {}],
    ['/a/1/b/2', '/a/{-$id}/b/{-$other}', { id: '1', other: '2' }],
    ['/a/1/b/2', '/a/{-$id}/b/{-$other}/', { id: '1', other: '2' }],
    ['/a/b/2', '/a/{-$id}/b/{-$other}', { other: '2' }],
    ['/a/b/2', '/a/{-$id}/b/{-$other}/', { other: '2' }],
    ['/a/1/b', '/a/{-$id}/b/{-$other}', { id: '1' }],
    ['/a/1/b', '/a/{-$id}/b/{-$other}/', { id: '1' }],
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

  it.each([
    ['/a/1/b/2', '/a/{-$id}/b/$other', { id: '1', other: '2' }],
    ['/a/1/b/2', '/a/{-$id}/b/$other/', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/a/{-$id}/b/$other/c', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/a/{-$id}/b/$other/c/', { id: '1', other: '2' }],
    [
      '/a/1/b/2/c/3',
      '/a/{-$id}/b/$other/c/$d',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/a/{-$id}/b/$other/c/$d/',
      { id: '1', other: '2', d: '3' },
    ],

    ['/a/1/2/3/c', '/a/{-$id}/$other/{-$d}/c', { id: '1', other: '2', d: '3' }],
    [
      '/a/1/2/3/c',
      '/a/{-$id}/$other/{-$d}/c/',
      { id: '1', other: '2', d: '3' },
    ],
    ['/a/2', '/a/{-$id}/$other/{-$d}', { other: '2' }],
    ['/a/2', '/a/{-$id}/$other/{-$d}/', { other: '2' }],
    ['/a/2/c', '/a/{-$id}/$other/{-$d}/c', { other: '2' }],
    ['/a/2/c', '/a/{-$id}/$other/{-$d}/c/', { other: '2' }],
    ['/a/1/2', '/a/{-$id}/$other/{-$d}', { id: '1', other: '2' }],
    ['/a/1/2', '/a/{-$id}/$other/{-$d}/', { id: '1', other: '2' }],
    ['/a/2/e', '/a/{-$id}/$other/{-$d}/$e', { other: '2', e: 'e' }],
    ['/a/2/e', '/a/{-$id}/$other/{-$d}/$e/', { other: '2', e: 'e' }],
    ['/a/1/2/e', '/a/{-$id}/$other/{-$d}/$e', { id: '1', other: '2', e: 'e' }],
    ['/a/1/2/e', '/a/{-$id}/$other/{-$d}/$e/', { id: '1', other: '2', e: 'e' }],
    [
      '/a/1/2/d/e',
      '/a/{-$id}/$other/{-$d}/$e',
      { id: '1', other: '2', d: 'd', e: 'e' },
    ],
    [
      '/a/1/2/d/e',
      '/a/{-$id}/$other/{-$d}/$e/',
      { id: '1', other: '2', d: 'd', e: 'e' },
    ],
    ['/a/1/2/c', '/a/{-$id}/$other/{-$d}/c', { id: '1', other: '2' }],
    ['/a/1/2/c', '/a/{-$id}/$other/{-$d}/c/', { id: '1', other: '2' }],
    ['/a/1/2/c', '/a/{-$id}/$other/c/{-$d}', { id: '1', other: '2' }],
    ['/a/1/2/c', '/a/{-$id}/$other/c/{-$d}/', { id: '1', other: '2' }],
    ['/a/1/2/c/3', '/a/{-$id}/$other/c/{-$d}', { id: '1', other: '2', d: '3' }],
    [
      '/a/1/2/c/3',
      '/a/{-$id}/$other/c/{-$d}/',
      { id: '1', other: '2', d: '3' },
    ],
    ['/a/2/c/3', '/a/{-$id}/$other/c/{-$d}', { other: '2', d: '3' }],
    ['/a/2/c/3', '/a/{-$id}/$other/c/{-$d}/', { other: '2', d: '3' }],
    ['/a/2/c', '/a/{-$id}/$other/c/{-$d}', { other: '2' }],
    ['/a/2/c', '/a/{-$id}/$other/c/{-$d}/', { other: '2' }],
    ['/a/1/2/c', '/a/{-$id}/$other/$c/{-$d}', { id: '1', other: '2', c: 'c' }],
    ['/a/1/2/c', '/a/{-$id}/$other/$c/{-$d}/', { id: '1', other: '2', c: 'c' }],
    [
      '/a/1/2/c/3',
      '/a/{-$id}/$other/$c/{-$d}',
      { id: '1', other: '2', c: 'c', d: '3' },
    ],
    [
      '/a/1/2/c/3',
      '/a/{-$id}/$other/$c/{-$d}/',
      { id: '1', other: '2', c: 'c', d: '3' },
    ],
    [
      '/a/1/2/c/e',
      '/a/{-$id}/$other/$c/e/{-$d}',
      { id: '1', other: '2', c: 'c' },
    ],
    [
      '/a/1/2/c/e',
      '/a/{-$id}/$other/$c/e/{-$d}/',
      { id: '1', other: '2', c: 'c' },
    ],
    [
      '/a/1/2/c/e/3',
      '/a/{-$id}/$other/$c/e/{-$d}',
      { id: '1', other: '2', c: 'c', d: '3' },
    ],
    [
      '/a/1/2/c/e/3',
      '/a/{-$id}/$other/$c/e/{-$d}/',
      { id: '1', other: '2', c: 'c', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/a/{-$id}/b/$other/c/{-$d}',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/a/{-$id}/b/$other/c/{-$d}/',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e',
      { id: '1', other: '2', d: '3', e: '4' },
    ],
    [
      '/a/1/b/2/c/3/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e/',
      { id: '1', other: '2', d: '3', e: '4' },
    ],
    ['/a/b/2', '/a/{-$id}/b/$other', { other: '2' }],
    ['/a/b/2', '/a/{-$id}/b/$other/', { other: '2' }],
    ['/a/b/2/c', '/a/{-$id}/b/$other/c', { other: '2' }],
    ['/a/b/2/c', '/a/{-$id}/b/$other/c/', { other: '2' }],
    ['/a/b/2/c/3', '/a/{-$id}/b/$other/c/$d', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/a/{-$id}/b/$other/c/$d/', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/a/{-$id}/b/$other/c/{-$d}', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/a/{-$id}/b/$other/c/{-$d}/', { other: '2', d: '3' }],
    [
      '/a/b/2/c/3/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e',
      { other: '2', d: '3', e: '4' },
    ],
    [
      '/a/b/2/c/3/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e/',
      { other: '2', d: '3', e: '4' },
    ],
    ['/a/1/b/2/c', '/a/{-$id}/b/$other/c/{-$d}', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/a/{-$id}/b/$other/c/{-$d}/', { id: '1', other: '2' }],
    [
      '/a/1/b/2/c/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e',
      { id: '1', other: '2', e: '4' },
    ],
    [
      '/a/1/b/2/c/4',
      '/a/{-$id}/b/$other/c/{-$d}/$e/',
      { id: '1', other: '2', e: '4' },
    ],
    ['/a/b/2/c', '/a/{-$id}/b/$other/c/{-$d}', { other: '2' }],
    ['/a/b/2/c', '/a/{-$id}/b/$other/c/{-$d}/', { other: '2' }],
    ['/a/b/2/c/4', '/a/{-$id}/b/$other/c/{-$d}/$e', { other: '2', e: '4' }],
    ['/a/b/2/c/4', '/a/{-$id}/b/$other/c/{-$d}/$e/', { other: '2', e: '4' }],
    [
      '/a/2/c/3',
      '/a/{-$id}/$other/c{-$cid}/{-$d}',
      { cid: '', other: '2', d: '3' },
    ],
    [
      '/a/2/c4/3',
      '/a/{-$id}/$other/c{-$cid}/{-$d}/',
      { other: '2', cid: '4', d: '3' },
    ],
  ])('complex optional usage %s => %s', (from, to, result) => {
    expect(
      matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
    ).toEqual(result)
  })

  it.each([
    ['/a/2', '/a/{-$id}/{-$other}', { id: '2' }],
    ['/a/2', '/a/{-$id}/{-$other}/', { id: '2' }],
    ['/a/2/b', '/a/{-$id}/{-$other}/b', { id: '2' }],
    ['/a/2/b', '/a/{-$id}/{-$other}/b/', { id: '2' }],
    ['/a/2/b/c', '/a/{-$id}/{-$other}/b/{-$d}/c', { id: '2' }],
    ['/a/2/b/c', '/a/{-$id}/{-$other}/b/{-$d}/c/', { id: '2' }],
    ['/a/2/b/3/c', '/a/{-$id}/{-$other}/b/{-$d}/c', { id: '2', d: '3' }],
    ['/a/2/b/3/c', '/a/{-$id}/{-$other}/b/{-$d}/c/', { id: '2', d: '3' }],
    [
      '/a/2/b/3/c/4',
      '/a/{-$id}/{-$other}/b/{-$d}/c/$e',
      { id: '2', d: '3', e: '4' },
    ],
    [
      '/a/2/b/3/c/4',
      '/a/{-$id}/{-$other}/b/{-$d}/c/$e/',
      { id: '2', d: '3', e: '4' },
    ],
    ['/a/b/c', '/a/{-$id}/{-$other}/$b/{-$d}/c', { b: 'b' }],
    ['/a/b/c', '/a/{-$id}/{-$other}/$b/{-$d}/c/', { b: 'b' }],
    ['/a/1/b/c', '/a/{-$id}/{-$other}/$b/{-$d}/c', { id: '1', b: 'b' }],
    ['/a/1/b/c', '/a/{-$id}/{-$other}/$b/{-$d}/c/', { id: '1', b: 'b' }],
    [
      '/a/1/other/b/c',
      '/a/{-$id}/{-$other}/$b/{-$d}/c',
      { id: '1', other: 'other', b: 'b' },
    ],
    [
      '/a/1/other/b/c',
      '/a/{-$id}/{-$other}/$b/{-$d}/c/',
      { id: '1', other: 'other', b: 'b' },
    ],
    [
      '/a/1/other/b/d/c',
      '/a/{-$id}/{-$other}/$b/{-$d}/c',
      { id: '1', other: 'other', b: 'b', d: 'd' },
    ],
    [
      '/a/1/other/b/d/c',
      '/a/{-$id}/{-$other}/$b/{-$d}/c/',
      { id: '1', other: 'other', b: 'b', d: 'd' },
    ],
  ])('consecutive optionals %s => %s', (from, to, result) => {
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
    ['/a/b', '/A/{-$id}/B', {}],
    ['/a/1/b/2', '/A/{-$id}/B/{-$other}', { id: '1', other: '2' }],
    ['/a/b/2', '/A/{-$id}/B/{-$other}', { other: '2' }],
    ['/a/1/b', '/A/{-$id}/B/{-$other}', { id: '1' }],
    ['/a/b', '/A/{-$id}/B/{-$other}', {}],
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

  it.each([
    ['/a/1/b/2', '/A/{-$id}/B/$other', { id: '1', other: '2' }],
    ['/a/1/b/2', '/A/{-$id}/B/$other/', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/A/{-$id}/B/$other/C', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/A/{-$id}/B/$other/C/', { id: '1', other: '2' }],
    [
      '/a/1/b/2/c/3',
      '/A/{-$id}/B/$other/C/$d',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/A/{-$id}/B/$other/C/$d/',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/A/{-$id}/B/$other/C/{-$d}',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3',
      '/A/{-$id}/B/$other/C/{-$d}/',
      { id: '1', other: '2', d: '3' },
    ],
    [
      '/a/1/b/2/c/3/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e',
      { id: '1', other: '2', d: '3', e: '4' },
    ],
    [
      '/a/1/b/2/c/3/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e/',
      { id: '1', other: '2', d: '3', e: '4' },
    ],
    ['/a/b/2', '/A/{-$id}/B/$other', { other: '2' }],
    ['/a/b/2', '/A/{-$id}/B/$other/', { other: '2' }],
    ['/a/b/2/c', '/A/{-$id}/B/$other/C', { other: '2' }],
    ['/a/b/2/c', '/A/{-$id}/B/$other/C/', { other: '2' }],
    ['/a/b/2/c/3', '/A/{-$id}/B/$other/C/$d', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/A/{-$id}/B/$other/C/$d/', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/A/{-$id}/B/$other/C/{-$d}', { other: '2', d: '3' }],
    ['/a/b/2/c/3', '/A/{-$id}/B/$other/C/{-$d}/', { other: '2', d: '3' }],
    [
      '/a/b/2/c/3/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e',
      { other: '2', d: '3', e: '4' },
    ],
    [
      '/a/b/2/c/3/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e/',
      { other: '2', d: '3', e: '4' },
    ],
    ['/a/1/b/2/c', '/A/{-$id}/B/$other/C/{-$d}', { id: '1', other: '2' }],
    ['/a/1/b/2/c', '/A/{-$id}/B/$other/C/{-$d}/', { id: '1', other: '2' }],
    [
      '/a/1/b/2/c/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e',
      { id: '1', other: '2', e: '4' },
    ],
    [
      '/a/1/b/2/c/4',
      '/A/{-$id}/B/$other/C/{-$d}/$e/',
      { id: '1', other: '2', e: '4' },
    ],
    ['/a/b/2/c', '/A/{-$id}/B/$other/C/{-$d}', { other: '2' }],
    ['/a/b/2/c', '/A/{-$id}/B/$other/C/{-$d}/', { other: '2' }],
    ['/a/b/2/c/4', '/A/{-$id}/B/$other/C/{-$d}/$e', { other: '2', e: '4' }],
    ['/a/b/2/c/4', '/A/{-$id}/B/$other/C/{-$d}/$e/', { other: '2', e: '4' }],
  ])('optional preceding wildcard %s => %s', (from, to, result) => {
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

describe('non-nested paths', () => {
  describe('default path matching', () => {
    it.each([
      ['/', '/a_', '/a_', {}],
      ['/', '/a_/b_', '/a_/b_', {}],
      ['/', '/a_', '/a_/', {}],
      ['/', '/a_/', '/a_/', {}],
      ['/', '/a_/', '/a_', undefined],
      ['/', '/b_', '/a_', undefined],
    ])('static %s %s => %s', (base, from, to, result) => {
      expect(
        matchByPath(base, from, { to, caseSensitive: true, fuzzy: false }),
      ).toEqual(result)
    })

    it.each([
      ['/a/1', '/a_/$id_', { id: '1' }],
      ['/a/1/b', '/a_/$id_/b_', { id: '1' }],
      ['/a/1/b/2', '/a_/$id_/b_/$other_', { id: '1', other: '2' }],
      ['/a/1/b/2', '/a_/$id_/b_/$id_', { id: '2' }],
    ])('params %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
      ).toEqual(result)
    })

    it('params support more than alphanumeric characters', () => {
      // in the value: basically everything except / and %
      expect(
        matchByPath(
          '/',
          '/a/@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{',
          { to: '/a_/$id_' },
        ),
      ).toEqual({
        id: '@&é"\'(§è!çà)-_°^¨$*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{',
      })
      // in the key: basically everything except / and % and $
      expect(
        matchByPath('/', '/a/1', {
          to: '/a_/$@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{_',
        }),
      ).toEqual({
        '@&é"\'(§è!çà)-_°^¨*€£`ù=+:;.,?~<>|î©#0123456789\\😀}{': '1',
      })
    })

    it.each([
      ['/a/1', '/a_/{-$id}_', { id: '1' }],
      ['/a', '/a_/{-$id}_', {}],
      ['/a/1/b', '/a_/{-$id}_/b_', { id: '1' }],
      ['/a/b', '/a_/{-$id}_/b_', {}],
      ['/a/1/b/2', '/a_/{-$id}_/b_/{-$other}_', { id: '1', other: '2' }],
      ['/a/b/2', '/a_/{-$id}_/b_/{-$other}_', { other: '2' }],
      ['/a/1/b', '/a_/{-$id}_/b_/{-$other}_', { id: '1' }],
      ['/a/b', '/a_/{-$id}_/b_/{-$other}_', {}],
      ['/a/1/b/2', '/a_/{-$id}_/b_/{-$id}_', { id: '2' }],
    ])('optional %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
      ).toEqual(result)
    })

    it.each([
      ['/a/b/c', '/a_/$_', { _splat: 'b/c', '*': 'b/c' }],
      ['/a/', '/a_/$_', { _splat: '/', '*': '/' }],
      ['/a', '/a_/$_', { _splat: '', '*': '' }],
      ['/a/b/c', '/a_/$_/foo_', { _splat: 'b/c', '*': 'b/c' }],
    ])('wildcard %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: true, fuzzy: false }),
      ).toEqual(result)
    })
  })

  describe('case insensitive path matching', () => {
    it.each([
      ['/', '/a', '/A_', {}],
      ['/', '/a/b', '/A_/B_', {}],
      ['/', '/a', '/A_/', {}],
      ['/', '/a/', '/A_/', {}],
      ['/', '/a/', '/A_', undefined],
      ['/', '/b', '/A_', undefined],
    ])('static %s %s => %s', (base, from, to, result) => {
      expect(
        matchByPath(base, from, { to, caseSensitive: false, fuzzy: false }),
      ).toEqual(result)
    })

    it.each([
      ['/a/1', '/A_/$id_', { id: '1' }],
      ['/a/1/b', '/A_/$id_/B_', { id: '1' }],
      ['/a/1/b/2', '/A_/$id_/B_/$other_', { id: '1', other: '2' }],
      ['/a/1/b/2', '/A_/$id_/B_/$id_', { id: '2' }],
    ])('params %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
      ).toEqual(result)
    })

    it.each([
      ['/a/1', '/A_/{-$id}_', { id: '1' }],
      ['/a', '/A_/{-$id}_', {}],
      ['/a/1/b', '/A_/{-$id}_/B_', { id: '1' }],
      ['/a/1/b/2', '/A_/{-$id}_/B_/{-$other}_', { id: '1', other: '2' }],
      ['/a/1/b', '/A_/{-$id}_/B_/{-$other}_', { id: '1' }],
      ['/a/1/b/2', '/A_/{-$id}_/B_/{-$id}_', { id: '2' }],
    ])('optional %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
      ).toEqual(result)
    })

    it.each([
      ['/a/b/c', '/A_/$_', { _splat: 'b/c', '*': 'b/c' }],
      ['/a/', '/A_/$_', { _splat: '/', '*': '/' }],
      ['/a', '/A_/$_', { _splat: '', '*': '' }],
      ['/a/b/c', '/A_/$_/foo_', { _splat: 'b/c', '*': 'b/c' }],
    ])('wildcard %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, caseSensitive: false, fuzzy: false }),
      ).toEqual(result)
    })
  })

  describe('fuzzy path matching', () => {
    it.each([
      ['/', '/a', '/a_', {}],
      ['/', '/a', '/a_/', {}],
      ['/', '/a/', '/a_/', {}],
      ['/', '/a/', '/a_', { '**': '/' }],
      ['/', '/a/b', '/a_/b_', {}],
      ['/', '/a/b', '/a_', { '**': 'b' }],
      ['/', '/a/b/', '/a_', { '**': 'b/' }],
      ['/', '/a/b/c', '/a_', { '**': 'b/c' }],
      ['/', '/a', '/a_/b_', undefined],
      ['/', '/b', '/a_', undefined],
      ['/', '/a', '/b_', undefined],
    ])('static %s %s => %s', (base, from, to, result) => {
      expect(
        matchByPath(base, from, { to, fuzzy: true, caseSensitive: true }),
      ).toEqual(result)
    })

    it.each([
      ['/a/1', '/a_/$id_', { id: '1' }],
      ['/a/1/b', '/a_/$id_', { id: '1', '**': 'b' }],
      ['/a/1/', '/a_/$id_/', { id: '1' }],
      ['/a/1/b/2', '/a_/$id_/b_/$other_', { id: '1', other: '2' }],
      ['/a/1/b/2/c', '/a_/$id_/b_/$other_', { id: '1', other: '2', '**': 'c' }],
    ])('params %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
      ).toEqual(result)
    })

    it.each([
      ['/a/1', '/a_/{-$id}_', { id: '1' }],
      ['/a', '/a_/{-$id}_', {}],
      ['/a/1/b', '/a_/{-$id}_', { '**': 'b', id: '1' }],
      ['/a/1/b', '/a_/{-$id}_/b_', { id: '1' }],
      ['/a/b', '/a_/{-$id}_/b_', {}],
      ['/a/b/c', '/a_/{-$id}_/b_', { '**': 'c' }],
      ['/a/b', '/a/_{-$id}_/b_/{-$other}_', {}],
      ['/a/b/2/d', '/a_/{-$id}_/b_/{-$other}_', { other: '2', '**': 'd' }],
      [
        '/a/1/b/2/c',
        '/a_/{-$id}_/b_/{-$other}_',
        { id: '1', other: '2', '**': 'c' },
      ],
    ])('optional %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
      ).toEqual(result)
    })

    it.each([
      ['/a/b/c', '/a_/$_', { _splat: 'b/c', '*': 'b/c' }],
      ['/a/', '/a_/$_', { _splat: '/', '*': '/' }],
      ['/a', '/a_/$_', { _splat: '', '*': '' }],
      ['/a/b/c/d', '/a_/$_/foo_', { _splat: 'b/c/d', '*': 'b/c/d' }],
    ])('wildcard %s => %s', (from, to, result) => {
      expect(
        matchByPath('/', from, { to, fuzzy: true, caseSensitive: true }),
      ).toEqual(result)
    })
  })
})
