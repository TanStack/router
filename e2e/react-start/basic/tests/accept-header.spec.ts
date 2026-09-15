import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPrerender } from './utils/isPrerender'
import { isSpaMode } from './utils/isSpaMode'

test.skip(
  isSpaMode || isPrerender,
  'Accept negotiation only runs when the document is server-rendered',
)

test.describe('Accept header negotiation', () => {
  test('responds 406 when Accept excludes HTML', async ({ request }) => {
    const response = await request.get('/', {
      headers: { Accept: 'application/json' },
    })

    expect(response.status()).toBe(406)
    expect(await response.json()).toEqual({
      error: 'Only HTML requests are supported here',
    })
  })

  test('responds 200 when Accept allows HTML', async ({ request }) => {
    const response = await request.get('/', {
      headers: { Accept: 'text/html' },
    })

    expect(response.status()).toBe(200)
  })
})
