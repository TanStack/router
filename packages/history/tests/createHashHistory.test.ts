import { describe, expect, test } from 'vitest'

import {createHashHistory} from '../src'

describe('createHashHistory', () => {
    describe('parseLocation', () => {
        test('neither search params nor hash', () => {
            const history = createHashHistory()
            window.history.pushState({}, "", "/")
            expect(history.location.pathname).toBe('/')
            expect(history.location.search).toBe('')
        })
        test('hash present, no search params', () => {
            const history = createHashHistory()
            window.history.pushState({}, "", "/#hello")
            expect(history.location.pathname).toBe('/hello')
            expect(history.location.search).toBe('')
        })
        test('search params present, no hash', () => {
            const history = createHashHistory()
            window.history.pushState({}, "", "/?search=params")
            expect(history.location.pathname).toBe('/')
            expect(history.location.search).toBe('?search=params')
        })
        test('both search params and hash present, in that order', () => {
            const history = createHashHistory()
            window.history.pushState({}, "", "/#hello?search=params")
            expect(history.location.pathname).toBe('/hello')
            expect(history.location.search).toBe('?search=params')
        })
        test('both hash and search params present, in that order', () => {
            const history = createHashHistory()
            window.history.pushState({}, "", "/?search=params#hello")
            expect(history.location.pathname).toBe('/hello')
            expect(history.location.search).toBe('?search=params')
        })
    })
})
