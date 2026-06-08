import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { APIResponse, Page, Response } from '@playwright/test'

type TestResponse = APIResponse | Response

async function setCookieValues(response: TestResponse) {
  return (await Promise.resolve(response.headersArray()))
    .filter((item) => item.name.toLowerCase() === 'set-cookie')
    .map((item) => item.value)
}

function cookieName(cookie: string) {
  return cookie.split('=', 1)[0]!
}

function cookiePair(cookie: string) {
  return cookie.split(';', 1)[0]!
}

function cookieHeader(...cookieSets: Array<Array<string>>) {
  const cookies = new Map<string, string>()

  for (const cookie of cookieSets.flat()) {
    const name = cookieName(cookie)
    if (/Max-Age=0/i.test(cookie)) {
      cookies.delete(name)
    } else {
      cookies.set(name, cookiePair(cookie))
    }
  }

  return Array.from(cookies.values()).join('; ')
}

function expectCookie(cookies: Array<string>, name: string) {
  expect(cookies.some((cookie) => cookie.startsWith(`${name}=`))).toBe(true)
}

function expectNoCookies(cookies: Array<string>) {
  expect(cookies).toEqual([])
}

async function expectServerFunctionResult(
  page: Page,
  name: string,
  text: string | RegExp,
) {
  await expect(
    page.getByTestId(`server-function-${name}-result`),
  ).toContainText(text)
}

test.describe('server route sessions', () => {
  test('creates and reuses the default cookie-backed session', async ({
    request,
  }) => {
    const first = await request.get('/api/session')
    const firstBody = await first.json()
    const firstCookies = await setCookieValues(first)

    expect(firstBody.id).toMatch(/^session-/)
    expect(firstBody.data).toEqual({})
    expectCookie(firstCookies, 'start')
    expect(firstCookies[0]).toContain('HttpOnly')
    expect(firstCookies[0]).toContain('Secure')
    expect(firstCookies[0]).toContain('Path=/')

    const second = await request.get('/api/session', {
      headers: { cookie: cookieHeader(firstCookies) },
    })
    const secondBody = await second.json()

    expect(secondBody.id).toBe(firstBody.id)
    expect(secondBody.data).toEqual({})
    expectNoCookies(await setCookieValues(second))
  })

  test('updates session data and persists it to the next request', async ({
    request,
  }) => {
    const update = await request.post('/api/session', {
      data: { user: 'tanner' },
    })
    const updateBody = await update.json()
    const updateCookies = await setCookieValues(update)

    expect(updateBody.data).toEqual({ user: 'tanner' })
    expectCookie(updateCookies, 'start')

    const next = await request.get('/api/session', {
      headers: { cookie: cookieHeader(updateCookies) },
    })
    const nextBody = await next.json()

    expect(nextBody.id).toBe(updateBody.id)
    expect(nextBody.data).toEqual({ user: 'tanner' })
  })

  test('clears the default session with a deletion cookie', async ({
    request,
  }) => {
    const update = await request.post('/api/session', {
      data: { user: 'clear-me' },
    })
    const updateCookies = await setCookieValues(update)

    const clear = await request.post('/api/session-clear', {
      headers: { cookie: cookieHeader(updateCookies) },
    })
    const clearCookies = await setCookieValues(clear)

    expect(await clear.json()).toEqual({ cleared: true })
    expect(
      clearCookies.some(
        (cookie) => cookie.startsWith('start=') && /Max-Age=0/i.test(cookie),
      ),
    ).toBe(true)
  })

  test('stores large sessions in chunks and removes stale chunks when shrinking', async ({
    request,
  }) => {
    const token = 'x'.repeat(5000)
    const large = await request.post('/api/session', {
      data: { token },
    })
    const largeCookies = await setCookieValues(large)

    expect(
      largeCookies.some((cookie) => cookie.startsWith('start=__chunked__')),
    ).toBe(true)
    expectCookie(largeCookies, 'start.1')

    const small = await request.post('/api/session', {
      headers: { cookie: cookieHeader(largeCookies) },
      data: { token: 'tiny' },
    })
    const smallCookies = await setCookieValues(small)

    expect(
      smallCookies.some(
        (cookie) => cookie.startsWith('start.1=') && /Max-Age=0/i.test(cookie),
      ),
    ).toBe(true)
    expect(
      smallCookies.some(
        (cookie) =>
          cookie.startsWith('start=') &&
          !cookie.startsWith('start=__chunked__'),
      ),
    ).toBe(true)

    const next = await request.get('/api/session', {
      headers: { cookie: cookieHeader(largeCookies, smallCookies) },
    })

    expect((await next.json()).data).toEqual({ token: 'tiny' })
  })

  test('keeps named sessions independent from the default session', async ({
    request,
  }) => {
    const defaultResponse = await request.post('/api/session', {
      data: { scope: 'default' },
    })
    const defaultCookies = await setCookieValues(defaultResponse)
    const namedResponse = await request.post(
      '/api/session-named?name=account',
      {
        data: { role: 'admin' },
      },
    )
    const namedCookies = await setCookieValues(namedResponse)
    const cookies = cookieHeader(defaultCookies, namedCookies)

    expectCookie(defaultCookies, 'start')
    expectCookie(namedCookies, 'account')

    const defaultRead = await request.get('/api/session', {
      headers: { cookie: cookies },
    })
    const namedRead = await request.get('/api/session-named?name=account', {
      headers: { cookie: cookies },
    })

    expect((await defaultRead.json()).data).toEqual({ scope: 'default' })
    expect((await namedRead.json()).data).toEqual({ role: 'admin' })
  })

  test('reads sessions from default and custom headers without Set-Cookie', async ({
    request,
  }) => {
    const sealedResponse = await request.post('/api/session-seal', {
      data: { source: 'header' },
    })
    const sealedBody = await sealedResponse.json()

    expectNoCookies(await setCookieValues(sealedResponse))
    expect(typeof sealedBody.sealed).toBe('string')

    const defaultHeader = await request.get('/api/session-header', {
      headers: { 'x-start-session': sealedBody.sealed },
    })
    const customHeader = await request.get(
      '/api/session-header?name=x-custom-session',
      {
        headers: { 'x-custom-session': sealedBody.sealed },
      },
    )

    expect((await defaultHeader.json()).data).toEqual({ source: 'header' })
    expect((await customHeader.json()).data).toEqual({ source: 'header' })
    expectNoCookies(await setCookieValues(defaultHeader))
    expectNoCookies(await setCookieValues(customHeader))
  })

  test('supports cookie:false sessions without persistence cookies', async ({
    request,
  }) => {
    const update = await request.post('/api/session-cookie-disabled', {
      data: { transient: true },
    })
    const next = await request.get('/api/session-cookie-disabled')

    expect((await update.json()).data).toEqual({ transient: true })
    expectNoCookies(await setCookieValues(update))
    expect((await next.json()).data).toEqual({})
    expectNoCookies(await setCookieValues(next))
  })

  test('falls back to a new session for tampered cookies', async ({
    request,
  }) => {
    const response = await request.get('/api/session', {
      headers: { cookie: 'start=not-a-valid-seal' },
    })
    const body = await response.json()
    const cookies = await setCookieValues(response)

    expect(response.status()).toBe(200)
    expect(body.id).toMatch(/^session-/)
    expect(body.data).toEqual({})
    expectCookie(cookies, 'start')
  })

  test('merges session cookies with helper cookies', async ({ request }) => {
    const response = await request.post('/api/session-helper-cookie', {
      data: { helper: true },
    })
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'start')
    expect(
      cookies.some((cookie) => cookie.startsWith('helper-session=1;')),
    ).toBe(true)
  })

  test('request middleware can update sessions before and after next', async ({
    request,
  }) => {
    const before = await request.get('/api/session-middleware', {
      headers: { 'x-session-middleware': 'before' },
    })
    const beforeBody = await before.json()

    expect(beforeBody.data).toEqual({ middleware: 'before' })

    const after = await request.get('/api/session-middleware', {
      headers: { 'x-session-middleware': 'after' },
    })
    const afterCookies = await setCookieValues(after)
    const afterRead = await request.get('/api/session', {
      headers: { cookie: cookieHeader(afterCookies) },
    })

    expect((await after.json()).data).toEqual({ middleware: 'before' })
    expect((await afterRead.json()).data).toEqual({ middleware: 'after' })
  })
})

test.describe('document and server function sessions', () => {
  test('SSR loader session updates persist across navigations', async ({
    page,
  }) => {
    await page.goto('/ssr')
    await expect(page.getByTestId('ssr-session-count')).toHaveText('1')
    const firstId = await page.getByTestId('ssr-session-id').textContent()

    await page.reload()
    await expect(page.getByTestId('ssr-session-count')).toHaveText('2')
    await expect(page.getByTestId('ssr-session-id')).toHaveText(firstId ?? '')
  })

  test('server functions update and read the browser session', async ({
    page,
  }) => {
    await page.goto('/server-functions')
    await expect(page.getByTestId('server-functions-hydrated')).toBeAttached()

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/_serverFn/'),
    )
    await page.getByTestId('server-function-update').click()
    const response = await responsePromise
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'start')
    await expectServerFunctionResult(page, 'update', '"serverFn":"updated"')

    await page.getByTestId('server-function-read').click()
    await expectServerFunctionResult(page, 'read', '"serverFn":"updated"')
  })
})
