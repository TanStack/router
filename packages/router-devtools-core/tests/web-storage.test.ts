import { expect, test } from 'vitest'

test.each(['localStorage', 'sessionStorage'] as const)(
  'provides working jsdom %s',
  (name) => {
    const storage = window[name]
    const otherStorage =
      window[name === 'localStorage' ? 'sessionStorage' : 'localStorage']
    const key = '__tanstack_web_storage_test__'

    expect(storage).toBeInstanceOf(window.Storage)
    expect(storage).toBe(globalThis[name])
    expect(storage).not.toBe(otherStorage)
    expect(storage.length).toBe(0)

    try {
      storage.setItem(key, 'value')
      expect(storage.getItem(key)).toBe('value')
      expect(storage.length).toBe(1)
      expect(storage.key(0)).toBe(key)
      expect(otherStorage.getItem(key)).toBeNull()

      storage.removeItem(key)
      expect(storage.getItem(key)).toBeNull()
      expect(storage.length).toBe(0)

      storage.setItem(key, 'another value')
      storage.clear()
      expect(storage.getItem(key)).toBeNull()
      expect(storage.length).toBe(0)
    } finally {
      storage.clear()
    }
  },
)
