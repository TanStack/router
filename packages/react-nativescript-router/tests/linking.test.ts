import { describe, expect, test, vi } from 'vitest'
import {
  navigateNativeScriptURL,
  parseNativeScriptURL,
  setupNativeScriptLinking,
} from '../src/linking'
import type { AnyRouter } from '@tanstack/router-core'

function createRouter() {
  const navigate = vi.fn().mockResolvedValue(undefined)
  const router = {
    history: { location: { href: '/' } },
    navigate,
  } as unknown as AnyRouter

  return { navigate, router }
}

describe('parseNativeScriptURL', () => {
  test.each([
    ['/posts/1?tab=activity#reply', [], '/posts/1?tab=activity#reply'],
    [
      'tanstack://app/posts/1?tab=activity#reply',
      ['tanstack://app'],
      '/posts/1?tab=activity#reply',
    ],
    [
      'https://example.com/posts/1?tab=activity#reply',
      ['https://example.com'],
      '/posts/1?tab=activity#reply',
    ],
    ['https://example.com#reply', ['https://example.com'], '/#reply'],
    ['TANSTACK://APP/posts/1', ['tanstack://app'], '/posts/1'],
    ['https://EXAMPLE.COM/posts/1', ['https://example.com'], '/posts/1'],
    ['tanstack://posts/1?tab=activity', [], '/posts/1?tab=activity'],
    ['https://other.example/posts/1', ['https://example.com'], null],
    ['', [], null],
  ] as const)('parses %s', (url, prefixes, expected) => {
    expect(parseNativeScriptURL(url, [...prefixes])).toBe(expected)
  })

  test('matches the longest configured prefix', () => {
    expect(
      parseNativeScriptURL('https://example.com/app/posts', [
        'https://example.com',
        'https://example.com/app',
      ]),
    ).toBe('/posts')
  })

  test('reports asynchronous navigation errors', async () => {
    const { navigate, router } = createRouter()
    const error = new Error('navigation failed')
    const onError = vi.fn()
    navigate.mockRejectedValueOnce(error)

    await navigateNativeScriptURL(
      router,
      { prefixes: ['tanstack://app'], onError },
      'tanstack://app/details',
      'push',
    )

    expect(navigate).toHaveBeenCalledWith({
      to: undefined,
      href: '/details',
      stackBehavior: 'push',
    })
    expect(onError).toHaveBeenCalledWith(error, 'tanstack://app/details')
  })

  test('respects a custom parser rejecting a URL', async () => {
    const { navigate, router } = createRouter()
    const onUnhandledURL = vi.fn()

    await navigateNativeScriptURL(
      router,
      {
        parseURL: () => null,
        onUnhandledURL,
      },
      'https://example.com/details',
      'push',
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(onUnhandledURL).toHaveBeenCalledWith('https://example.com/details')
  })

  test('subscribes before resolving the initial URL', async () => {
    const { navigate, router } = createRouter()
    let resolveInitialURL: (url: string) => void = () => undefined
    const initialURL = new Promise<string>((resolve) => {
      resolveInitialURL = resolve
    })
    let listener: (url: string) => void = () => undefined
    const unsubscribe = vi.fn()
    const subscribe = vi.fn((next: (url: string) => void) => {
      listener = next
      return unsubscribe
    })

    const dispose = setupNativeScriptLinking(router, {
      getInitialURL: () => initialURL,
      subscribe,
    })

    expect(subscribe).toHaveBeenCalledOnce()
    listener('/incoming')
    resolveInitialURL('/initial')
    await initialURL
    await Promise.resolve()

    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({
      to: undefined,
      href: '/incoming',
      stackBehavior: 'push',
    })

    dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
