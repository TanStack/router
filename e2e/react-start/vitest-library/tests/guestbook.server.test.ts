import { runInRequest } from '@tanstack/react-start/testing/server'
import { beforeEach, expect, test } from 'vitest'
import {
  clearGuestbook,
  guestbookEntries,
  signGuestbook,
} from '../src/guestbook'

// In a test run a file with a server function is one module: the handler and
// the other code of the file share the state of the file.

beforeEach(() => {
  clearGuestbook()
})

test('a test reads the state that a server function of the file wrote', async () => {
  await runInRequest(() => signGuestbook({ data: 'Ada' }))

  expect(guestbookEntries()).toEqual(['Ada'])
})

test('a test resets the state that a server function of the file reads', async () => {
  await expect(
    runInRequest(() => signGuestbook({ data: 'Grace' })),
  ).resolves.toBe(1)
})
