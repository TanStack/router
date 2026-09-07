import { describe, expect, test, vi } from 'vitest'

import { createHashHistory } from '../src'

describe('createHashHistory', () => {
  test.each(['/route\x01'])(
    'keeps logical control data stable after reading the browser URL again: %j',
    (href) => {
      const originalHref = window.location.href
      window.history.replaceState(null, '', '/shell')
      const history = createHashHistory()
      let reloaded: ReturnType<typeof createHashHistory> | undefined
      try {
        history.push(href)
        history.flush()
        const location = history.location
        history.destroy()
        reloaded = createHashHistory()
        expect(reloaded.location).toEqual(location)
      } finally {
        history.destroy()
        reloaded?.destroy()
        window.history.replaceState(null, '', originalHref)
      }
    },
  )

  describe('parseLocation', () => {
    describe.each([
      ['/', { pathname: '/', search: '' }, 'neither search params nor hash'],
      [
        '/#/hello',
        { pathname: '/hello', search: '' },
        'hash present, no search params',
      ],
      [
        '/?search=params',
        { pathname: '/', search: '?search=params' },
        'search params present, no hash',
      ],
      [
        '/#/hello?search=params',
        { pathname: '/hello', search: '?search=params' },
        'both hash and search params present, in that order',
      ],
      [
        '/?search=params#/hello',
        { pathname: '/hello', search: '?search=params' },
        'both search params and hash present, in that order',
      ],
    ])('check for %s', (...[path, exp, desc]) => {
      test(`onLoad with ${path} (${desc})`, () => {
        window.history.replaceState({}, '', path)
        const history = createHashHistory()
        expect(history.location.pathname).toBe(exp.pathname)
        expect(history.location.search).toBe(exp.search)
      })
      test(`onNavigate with ${path} (${desc})`, () => {
        const history = createHashHistory()
        window.history.pushState({}, '', path)
        expect(history.location.pathname).toBe(exp.pathname)
        expect(history.location.search).toBe(exp.search)
      })
    })
  })
})
