import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { APIResponse, Page, Response } from '@playwright/test'

async function setCookieValues(response: APIResponse | Response) {
  return (await Promise.resolve(response.headersArray()))
    .filter((item) => item.name.toLowerCase() === 'set-cookie')
    .map((item) => item.value)
}

function expectCookie(cookies: Array<string>, name: string) {
  expect(cookies.some((cookie) => cookie.startsWith(`${name}=`))).toBe(true)
}

async function expectResult(page: Page, name: string, value: string) {
  await expect(
    page.getByTestId(`server-function-${name}-result`),
  ).toContainText(value)
}

async function visitFunctions(page: Page) {
  await page.goto('/server-functions')
  await expect(page.getByTestId('server-functions-hydrated')).toBeAttached()
}

test.describe('iron-session in Start', () => {
  test('does not write cookies on a read and persists committed mutations', async ({
    request,
  }) => {
    const initial = await request.get('/api/session')
    expect(await initial.json()).toEqual({ data: {} })
    expect(await setCookieValues(initial)).toEqual([])

    const update = await request.post('/api/session', {
      data: { user: 'tanner' },
    })
    const cookies = await setCookieValues(update)
    expectCookie(cookies, 'app-session')
    expect(cookies[0]).toContain('HttpOnly')
    expect(cookies[0]).toContain('SameSite=Lax')
    expect(cookies[0]).toContain('Path=/')

    const read = await request.get('/api/session')
    expect(await read.json()).toEqual({ data: { user: 'tanner' } })
    expect(await setCookieValues(read)).toEqual([])
  })

  test('destroy logs out the cookie jar', async ({ request }) => {
    await request.post('/api/session', { data: { user: 'clear-me' } })
    const clear = await request.post('/api/session-clear')
    const cookies = await setCookieValues(clear)
    expectCookie(cookies, 'app-session')
    expect(cookies[0]).toContain('Max-Age=0')
    expect(await (await request.get('/api/session')).json()).toEqual({
      data: {},
    })
  })

  test('independent named sessions coexist', async ({ request }) => {
    await request.post('/api/session', { data: { user: 'default-user' } })
    await request.post('/api/session-named?name=app-account', {
      data: { user: 'account-user' },
    })
    expect(await (await request.get('/api/session')).json()).toEqual({
      data: { user: 'default-user' },
    })
    expect(
      await (await request.get('/api/session-named?name=app-account')).json(),
    ).toEqual({ data: { user: 'account-user' } })
  })

  test('invalid input does not become authenticated session data', async ({
    request,
  }) => {
    const response = await request.get('/api/session', {
      headers: { cookie: 'app-session=invalid' },
    })
    expect(await response.json()).toEqual({ data: {} })
    expect(await setCookieValues(response)).toEqual([])
  })

  test('preserves library, helper, and returned cookies including Expires commas', async ({
    request,
  }) => {
    const response = await request.post('/api/session-helper-cookie', {
      data: { user: 'coexists' },
    })
    const cookies = await setCookieValues(response)
    expect(cookies).toHaveLength(4)
    for (const name of [
      'app-session',
      'helper-session',
      'returned-session',
      'returned-extra',
    ]) {
      expectCookie(cookies, name)
    }
    expect(
      cookies.find((cookie) => cookie.startsWith('returned-session=')),
    ).toContain('Expires=Tue, 01 Jan 2030 00:00:00 GMT')
    expect(await (await request.get('/api/session')).json()).toEqual({
      data: { user: 'coexists' },
    })
  })

  test('a notification is consumed once after its deletion is saved', async ({
    request,
  }) => {
    await request.post('/api/session-flash')
    expect(await (await request.get('/api/session-flash')).json()).toEqual({
      notice: 'Saved successfully',
    })
    expect(await (await request.get('/api/session-flash')).json()).toEqual({
      notice: null,
    })
  })

  test('session mutations survive a thrown Start redirect', async ({
    request,
  }) => {
    const response = await request.post('/api/session-redirect', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe('/api/session')
    expectCookie(await setCookieValues(response), 'app-session')
    expect(await (await request.get('/api/session')).json()).toEqual({
      data: { user: 'redirected' },
    })
  })

  test('middleware shares the session object and commits changes after next', async ({
    request,
  }) => {
    const before = await request.get('/api/session-middleware', {
      headers: { 'x-session-middleware': 'before' },
    })
    expect(await before.json()).toEqual({ data: { middleware: 'before' } })
    expectCookie(await setCookieValues(before), 'app-session')
    const after = await request.get('/api/session-middleware', {
      headers: { 'x-session-middleware': 'after' },
    })
    expect(await after.json()).toEqual({ data: { middleware: 'before' } })
    expect(await (await request.get('/api/session')).json()).toEqual({
      data: { middleware: 'after' },
    })
  })
})

test.describe('iron-session cookie jar adapter', () => {
  test('saves, reads, and destroys encrypted sessions using Start cookie helpers', async ({
    request,
  }) => {
    const saved = await request.post('/api/session-iron', {
      data: { user: 'iron-user' },
    })
    expectCookie(await setCookieValues(saved), 'iron-session')
    expect(await (await request.get('/api/session-iron')).json()).toEqual({
      data: { user: 'iron-user' },
    })
    await request.delete('/api/session-iron')
    expect(await (await request.get('/api/session-iron')).json()).toEqual({
      data: {},
    })
  })

  test('roundtrips chunked cookies and deletes obsolete chunks after shrinking', async ({
    request,
  }) => {
    const large = await request.post('/api/session-iron', {
      data: { token: 'x'.repeat(5000) },
    })
    const cookies = await setCookieValues(large)
    expectCookie(cookies, 'iron-session.0')
    expectCookie(cookies, 'iron-session.1')
    expect(
      (await (await request.get('/api/session-iron')).json()).data.token,
    ).toHaveLength(5000)
    const small = await request.post('/api/session-iron', {
      data: { token: 'tiny' },
    })
    const smallCookies = await setCookieValues(small)
    expectCookie(smallCookies, 'iron-session')
    expect(
      smallCookies.some(
        (cookie) =>
          cookie.startsWith('iron-session.1=') && /Max-Age=0/i.test(cookie),
      ),
    ).toBe(true)
    expect(
      (await (await request.get('/api/session-iron')).json()).data.token,
    ).toBe('tiny')
  })
})

test.describe('Hono applications mounted in Start server routes', () => {
  for (const [path, cookieName] of [
    ['session-hono', 'sid'],
    ['session-hono-community', 'hono-community'],
  ]) {
    test(`${path} persists and clears sessions after Hono middleware completes`, async ({
      request,
    }) => {
      const saved = await request.post(`/api/${path}`, {
        data: { user: 'hono-user' },
      })
      expect(saved.status()).toBe(200)
      const cookies = await setCookieValues(saved)
      expectCookie(cookies, cookieName!)
      expectCookie(cookies, 'start-side')
      if (path === 'session-hono') {
        expectCookie(cookies, 'hono-extra')
      }
      expect((await (await request.get(`/api/${path}`)).json()).data.user).toBe(
        'hono-user',
      )
      await request.delete(`/api/${path}`)
      expect(
        (await (await request.get(`/api/${path}`)).json()).data.user ?? null,
      ).toBeNull()
    })
  }

  test('Hono context-free signed cookie helpers work directly in Start', async ({
    request,
  }) => {
    const saved = await request.post('/api/session-hono-cookie', {
      data: { user: 'signed-user' },
    })
    expectCookie(await setCookieValues(saved), 'hono-signed')
    expectCookie(await setCookieValues(saved), 'start-side')
    expect(
      await (await request.get('/api/session-hono-cookie')).json(),
    ).toEqual({ user: 'signed-user' })
    await request.delete('/api/session-hono-cookie')
    expect(
      await (await request.get('/api/session-hono-cookie')).json(),
    ).toEqual({ user: null })
  })
})

test.describe('document and server function sessions', () => {
  test('SSR loader commits persist across browser reloads', async ({
    page,
  }) => {
    await page.goto('/ssr')
    await expect(page.getByTestId('ssr-session-count')).toHaveText('1')
    await page.reload()
    await expect(page.getByTestId('ssr-session-count')).toHaveText('2')
  })

  test('server functions update, read, and clear the browser session', async ({
    page,
  }) => {
    await visitFunctions(page)
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/_serverFn/'),
    )
    await page.getByTestId('server-function-update').click()
    expectCookie(await setCookieValues(await responsePromise), 'app-session')
    await expectResult(page, 'update', '"serverFn":"updated"')
    await page.getByTestId('server-function-read').click()
    await expectResult(page, 'read', '"serverFn":"updated"')
    await page.getByTestId('server-function-clear').click()
    await expectResult(page, 'clear', '"cleared":true')
    await page.getByTestId('server-function-read').click()
    await expectResult(page, 'read', '"data":{}')
  })

  test('server function redirects retain committed session data', async ({
    page,
  }) => {
    await visitFunctions(page)
    await page.getByTestId('server-function-redirect').click()
    await expect(page).toHaveURL(/\/ssr$/)
    await expect(page.getByTestId('ssr-session-count')).toHaveText('1')
    expect(
      (await (await page.request.get('/api/session')).json()).data.serverFn,
    ).toBe('redirected')
  })

  test.describe('expected server function error', () => {
    test.use({
      whitelistErrors: [
        /Failed to load resource: the server responded with a status of 500/,
      ],
    })
    test('server function errors retain committed session data', async ({
      page,
    }) => {
      await visitFunctions(page)
      await page.getByTestId('server-function-error').click()
      await expectResult(page, 'error', 'Expected external session error')
      expect(
        (await (await page.request.get('/api/session')).json()).data.serverFn,
      ).toBe('error-persisted')
    })
  })

  test('iron-session cookie jar works in browser-invoked server functions', async ({
    page,
  }) => {
    await visitFunctions(page)
    await page.getByTestId('server-function-iron').click()
    await expectResult(page, 'iron', 'iron-server-function')
    expect(
      (await (await page.request.get('/api/session-iron')).json()).data.user,
    ).toBe('iron-server-function')
  })

  test('separate browser contexts retain independent sessions', async ({
    browser,
    baseURL,
  }) => {
    const first = await browser.newContext({ baseURL })
    const second = await browser.newContext({ baseURL })
    try {
      const firstPage = await first.newPage()
      const secondPage = await second.newPage()
      const [firstResponse, secondResponse] = await Promise.all([
        firstPage.goto('/ssr'),
        secondPage.goto('/ssr'),
      ])
      expect(firstResponse?.ok()).toBe(true)
      expect(secondResponse?.ok()).toBe(true)
      await firstPage.reload()
      await expect(firstPage.getByTestId('ssr-session-count')).toHaveText('2')
      await expect(secondPage.getByTestId('ssr-session-count')).toHaveText('1')
    } finally {
      await first.close()
      await second.close()
    }
  })
})
