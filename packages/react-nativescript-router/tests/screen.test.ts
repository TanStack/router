import { describe, expect, test } from 'vitest'
import { getNativeStackAction } from '../src/screen'
import type { NativeScreenSnapshot } from '../src/screen'

function screen(
  historyIndex: number,
  locationKey: string,
  href: string,
  revision = 1,
): NativeScreenSnapshot {
  return {
    historyIndex,
    locationKey,
    href,
    revision,
    state: {} as NativeScreenSnapshot['state'],
    routeContext: {} as NativeScreenSnapshot['routeContext'],
    routeOptions: {},
  }
}

describe('getNativeStackAction', () => {
  test.each([
    [undefined, screen(0, 'root', '/'), 'initialize'],
    [screen(0, 'root', '/'), screen(1, 'details', '/details'), 'push'],
    [screen(2, 'two', '/two'), screen(0, 'root', '/'), 'pop'],
    [screen(1, 'old', '/one'), screen(1, 'new', '/two'), 'replace'],
    [screen(1, 'same', '/one'), screen(1, 'same', '/one?tab=2'), 'update'],
    [screen(1, 'same', '/one'), screen(1, 'same', '/one', 2), 'update'],
    [screen(1, 'same', '/one'), screen(1, 'same', '/one'), 'none'],
  ] as const)('%s -> %s is %s', (current, next, expected) => {
    expect(getNativeStackAction(current, next)).toBe(expected)
  })
})
