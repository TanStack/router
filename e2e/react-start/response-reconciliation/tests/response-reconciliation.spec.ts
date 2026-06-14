import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { APIResponse, Page, Response } from '@playwright/test'

type TestResponse = APIResponse | Response

function header(response: TestResponse, name: string) {
  return response.headers()[name.toLowerCase()] ?? null
}

async function setCookieValues(response: TestResponse) {
  return (await Promise.resolve(response.headersArray()))
    .filter((item) => item.name.toLowerCase() === 'set-cookie')
    .map((item) => item.value)
}

function expectCookie(cookies: Array<string>, name: string, value: string) {
  expect(
    cookies.filter((cookie) => cookie.startsWith(`${name}=${value};`)),
  ).toHaveLength(1)
}

async function invokeServerFunction(
  page: Page,
  name: string,
  scenario?: string,
) {
  await page.goto(
    scenario
      ? `/server-functions?scenario=${encodeURIComponent(scenario)}`
      : '/server-functions',
  )
  await expect(page.getByTestId('server-functions-hydrated')).toBeAttached()
  await page.evaluate((value) => {
    document.cookie = value
      ? `reconciliation-scenario=${value}; Path=/`
      : 'reconciliation-scenario=; Max-Age=0; Path=/'
  }, scenario)
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/_serverFn/'),
  )
  await page.getByTestId(`server-function-${name}`).click()
  const response = await responsePromise
  await expect(
    page.getByTestId(`server-function-${name}-result`),
  ).not.toHaveText('pending')
  return response
}

async function invokeJsonServerFunction(
  page: Page,
  name: string,
  scenario?: string,
) {
  const response = await invokeServerFunction(page, name, scenario)
  const request = response.request()
  expect(request.headers()['x-tsr-serverfn']).toBe('true')
  const postData = request.postData()
  if (postData) {
    expect(postData).not.toContain('x-reconciliation-scenario')
  }
  return response
}

async function expectServerFunctionResult(
  page: Page,
  name: string,
  result: string | RegExp,
) {
  await expect(page.getByTestId(`server-function-${name}-result`)).toHaveText(
    result,
  )
}

test.describe('server routes', () => {
  test('uses expected server entry mode', async ({ request }) => {
    const response = await request.get('/api/base')

    if (process.env.TSS_E2E_SERVER_ENTRY) {
      expect(header(response, 'x-custom-server-entry')).toBe('yes')
    } else {
      expect(header(response, 'x-custom-server-entry')).toBe(null)
    }
  })

  test('global request middleware cookies are preserved on server routes', async ({
    request,
  }) => {
    const response = await request.get('/api/base', {
      headers: { 'x-reconciliation-scenario': 'global-multiple-cookies' },
    })
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'global-one', '1')
    expectCookie(cookies, 'global-two', '2')
  })

  test('regression #5407: global middleware setResponseHeaders and status apply before next', async ({
    request,
  }) => {
    const response = await request.get('/api/base', {
      headers: { 'x-reconciliation-scenario': 'global-before' },
    })

    expect(response.status()).toBe(231)
    expect(response.statusText()).toBe('global-before')
    expect(header(response, 'x-global-before')).toBe('yes')
    expect(header(response, 'x-global-common')).toBe('before')
    expect(header(response, 'x-base')).toBe('yes')
  })

  test('global middleware helper changes apply after next', async ({
    request,
  }) => {
    const response = await request.get('/api/base', {
      headers: { 'x-reconciliation-scenario': 'global-after' },
    })

    expect(response.status()).toBe(232)
    expect(response.statusText()).toBe('global-after')
    expect(header(response, 'x-global-after')).toBe('yes')
    expect(header(response, 'x-global-common')).toBe('after')
    expect(header(response, 'x-base')).toBe('yes')
  })

  test('route middleware helper changes apply before and after next', async ({
    request,
  }) => {
    const before = await request.get('/api/route-before-next')
    expect(before.status()).toBe(234)
    expect(before.statusText()).toBe('route-before')
    expect(header(before, 'x-route-before')).toBe('yes')
    expect(header(before, 'x-handler')).toBe('route-before-next')

    const after = await request.get('/api/route-after-next')
    expect(after.status()).toBe(233)
    expect(after.statusText()).toBe('route-after')
    expect(header(after, 'x-route-after')).toBe('yes')
    expect(header(after, 'x-handler')).toBe('route-after-next')
  })

  test('helper changes overlay same-boundary returned response conflicts', async ({
    request,
  }) => {
    const response = await request.get('/api/same-boundary-conflict')

    expect(response.status()).toBe(235)
    expect(response.statusText()).toBe('same-boundary')
    expect(header(response, 'x-conflict')).toBe('helper')
    await expect(response.text()).resolves.toBe('conflict')
  })

  test('setResponseHeaders accepts Headers and preserves multiple cookies', async ({
    request,
  }) => {
    const response = await request.get('/api/bulk-headers')
    const cookies = await setCookieValues(response)

    expect(header(response, 'x-bulk-one')).toBe('1')
    expect(header(response, 'x-bulk-two')).toBe('2')
    expect(header(response, 'x-keep')).toBe('yes')
    expectCookie(cookies, 'bulk-one', '1')
    expectCookie(cookies, 'bulk-two', '2')
  })

  test('remove and clear helpers can remove returned response headers', async ({
    request,
  }) => {
    const removed = await request.get('/api/remove-returned-header')
    expect(header(removed, 'x-remove-me')).toBe(null)
    expect(header(removed, 'x-keep')).toBe('yes')

    const cleared = await request.get('/api/clear-returned-headers')
    expect(header(cleared, 'x-clear-one')).toBe(null)
    expect(header(cleared, 'x-clear-two')).toBe(null)
  })

  test('getResponseHeader and getResponseHeaders read helper writes immediately', async ({
    request,
  }) => {
    const headerResponse = await request.get('/api/get-response-header-helper')
    expect(header(headerResponse, 'x-read-after-set')).toBe('yes')
    await expect(headerResponse.text()).resolves.toBe('yes')

    const headersResponse = await request.get(
      '/api/get-response-headers-helper',
    )
    expect(header(headersResponse, 'x-headers-read')).toBe('yes')
    expect(header(headersResponse, 'x-headers-snapshot-write')).toBe(null)
    await expect(headersResponse.text()).resolves.toBe('yes')
  })

  test('getResponseHeader sees direct current response header mutation', async ({
    request,
  }) => {
    const response = await request.get('/api/direct-mutation-visible')

    expect(header(response, 'x-direct-visible')).toBe('yes')
    expect(header(response, 'x-direct-read')).toBe('yes')
  })

  test('response replacement carries helper deltas but not old response mutations', async ({
    request,
  }) => {
    const response = await request.get('/api/replace-after-direct-mutation')

    expect(response.status()).toBe(202)
    expect(header(response, 'x-direct-a')).toBe(null)
    expect(header(response, 'x-helper-delta')).toBe('yes')
    expect(header(response, 'x-response-b')).toBe('yes')
    await expect(response.text()).resolves.toBe('replacement')
  })

  test('later returned response replaces earlier response metadata', async ({
    request,
  }) => {
    const response = await request.get('/api/two-returned-responses')

    expect(header(response, 'x-response-a')).toBe(null)
    expect(header(response, 'x-response-b')).toBe('yes')
    expect(header(response, 'x-helper-after-a')).toBe('yes')
    await expect(response.text()).resolves.toBe('response-b')
  })

  test('readonly responses reconcile through clone fallback', async ({
    request,
  }) => {
    const response = await request.get('/api/readonly-after-next')

    expect(header(response, 'x-readonly-after')).toBe('yes')
    await expect(response.text()).resolves.toBe('readonly')
  })

  for (const status of [204, 205, 304]) {
    test(`null-body status ${status} drops the response body`, async ({
      request,
    }) => {
      const response = await request.get(
        `/api/null-body-status?status=${status}`,
      )

      expect(response.status()).toBe(status)
      expect(header(response, 'x-null-body')).toBe('yes')
      await expect(response.text()).resolves.toBe('')
    })
  }

  test('regression #5107: thrown errors preserve explicit response status and headers', async ({
    request,
  }) => {
    const response = await request.get('/api/throw-after-status')

    expect(response.status()).toBe(401)
    expect(response.statusText()).toBe('Unauthorized')
    expect(header(response, 'x-error-helper')).toBe('yes')
    expect(header(response, 'content-type')).toContain('application/json')
    if (process.env.TSS_E2E_SERVER_ENTRY) {
      expect(header(response, 'x-custom-server-entry')).toBe('yes')
      expect(header(response, 'x-custom-entry-catch')).toBe(null)
    }
    await expect(response.json()).resolves.toMatchObject({ status: 401 })
  })

  test('thrown responses preserve explicit response status and headers', async ({
    request,
  }) => {
    const response = await request.get('/api/throw-after-status?throw=response')

    expect(response.status()).toBe(401)
    expect(response.statusText()).toBe('Unauthorized')
    expect(header(response, 'x-error-helper')).toBe('yes')
    expect(header(response, 'x-thrown-response')).toBe('yes')
    if (process.env.TSS_E2E_SERVER_ENTRY) {
      expect(header(response, 'x-custom-server-entry')).toBe('yes')
      expect(header(response, 'x-custom-entry-catch')).toBe(null)
    }
    await expect(response.text()).resolves.toBe('Unauthorized response')
  })

  test('custom server entry can opt out of automatic error responses', async ({
    request,
  }) => {
    test.skip(!process.env.TSS_E2E_SERVER_ENTRY, 'custom server entry only')

    const response = await request.get('/api/throw-after-status', {
      headers: { 'x-custom-handle-errors': 'false' },
    })

    expect(response.status()).toBe(555)
    expect(header(response, 'x-custom-server-entry')).toBe('yes')
    expect(header(response, 'x-custom-entry-catch')).toBe('yes')
    await expect(response.text()).resolves.toBe('Unauthorized route')
  })

  test('custom server entry can recover Start error response state', async ({
    request,
  }) => {
    test.skip(!process.env.TSS_E2E_SERVER_ENTRY, 'custom server entry only')

    const response = await request.get('/api/throw-after-status', {
      headers: {
        'x-custom-handle-errors': 'false',
        'x-custom-handle-start-error': 'true',
      },
    })
    const cookies = await setCookieValues(response)

    expect(response.status()).toBe(401)
    expect(response.statusText()).toBe('Unauthorized')
    expect(header(response, 'x-error-helper')).toBe('yes')
    expect(header(response, 'x-custom-server-entry')).toBe('yes')
    expect(header(response, 'x-custom-entry-catch')).toBe(null)
    expectCookie(cookies, 'throw-after-status', '1')
    await expect(response.json()).resolves.toMatchObject({ status: 401 })
  })

  test('custom server entry can recover thrown response state', async ({
    request,
  }) => {
    test.skip(!process.env.TSS_E2E_SERVER_ENTRY, 'custom server entry only')

    const response = await request.get(
      '/api/throw-after-status?throw=response',
      {
        headers: {
          'x-custom-handle-errors': 'false',
          'x-custom-handle-start-error': 'true',
        },
      },
    )
    const cookies = await setCookieValues(response)

    expect(response.status()).toBe(401)
    expect(response.statusText()).toBe('Unauthorized')
    expect(header(response, 'x-error-helper')).toBe('yes')
    expect(header(response, 'x-thrown-response')).toBe('yes')
    expect(header(response, 'x-custom-server-entry')).toBe('yes')
    expect(header(response, 'x-custom-entry-catch')).toBe(null)
    expectCookie(cookies, 'throw-after-status', '1')
    await expect(response.text()).resolves.toBe('Unauthorized response')
  })

  test('custom server entry can opt out of SSR request middleware error responses', async ({
    request,
  }) => {
    test.skip(!process.env.TSS_E2E_SERVER_ENTRY, 'custom server entry only')

    const response = await request.get('/ssr', {
      headers: {
        'x-custom-handle-errors': 'false',
        'x-reconciliation-scenario': 'global-throw',
      },
    })

    expect(response.status()).toBe(555)
    expect(header(response, 'x-custom-server-entry')).toBe('yes')
    expect(header(response, 'x-custom-entry-catch')).toBe('yes')
    await expect(response.text()).resolves.toBe(
      'Unauthorized global middleware',
    )
  })

  test('regression #5464: multiple Set-Cookie headers are preserved', async ({
    request,
  }) => {
    const response = await request.get('/api/multiple-cookies')
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'route-one', '1')
    expectCookie(cookies, 'route-two', '2')
  })

  test('explicit Set-Cookie header values are preserved and replace response values', async ({
    request,
  }) => {
    const explicit = await request.get('/api/explicit-set-cookie-header')
    const explicitCookies = await setCookieValues(explicit)
    expectCookie(explicitCookies, 'explicit-one', '1')
    expectCookie(explicitCookies, 'explicit-two', '2')

    const replaced = await request.get('/api/replace-explicit-set-cookie')
    const replacedCookies = await setCookieValues(replaced)
    expectCookie(replacedCookies, 'explicit-new', '1')
    expect(
      replacedCookies.some((cookie) => cookie.startsWith('explicit-old=1;')),
    ).toBe(false)
  })

  test('cookies survive redirect responses', async ({ request }) => {
    const response = await request.get('/api/redirect-with-cookies', {
      maxRedirects: 0,
    })
    const cookies = await setCookieValues(response)

    expect(response.status()).toBe(307)
    expect(header(response, 'location')).toBe('/api/base')
    expectCookie(cookies, 'redirect-one', '1')
    expectCookie(cookies, 'redirect-two', '2')
    expectCookie(cookies, 'redirect-three', '3')
  })
})

test.describe('SSR document responses', () => {
  test('loader helper headers, status, and cookies reconcile onto document response', async ({
    request,
  }) => {
    const response = await request.get('/ssr')
    const cookies = await setCookieValues(response)

    expect(response.status()).toBe(238)
    expect(response.statusText()).toBe('ssr-loader')
    expect(header(response, 'x-ssr-loader')).toBe('yes')
    expect(header(response, 'content-type')).toContain('text/html')
    expectCookie(cookies, 'ssr-one', '1')
    expectCookie(cookies, 'ssr-two', '2')
    await expect(response.text()).resolves.toContain('ssr response')
  })

  test('regression #5464: SSR document responses preserve multiple Set-Cookie headers', async ({
    request,
  }) => {
    const response = await request.get('/ssr', {
      headers: { 'x-reconciliation-scenario': 'global-multiple-cookies' },
    })
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'global-one', '1')
    expectCookie(cookies, 'global-two', '2')
    expectCookie(cookies, 'ssr-one', '1')
    expectCookie(cookies, 'ssr-two', '2')
  })

  test('global middleware after next reconciles onto document response', async ({
    request,
  }) => {
    const response = await request.get('/ssr', {
      headers: { 'x-reconciliation-scenario': 'global-after' },
    })

    expect(response.status()).toBe(232)
    expect(response.statusText()).toBe('global-after')
    expect(header(response, 'x-global-after')).toBe('yes')
    expect(header(response, 'x-ssr-loader')).toBe('yes')
  })
})

test.describe('server functions', () => {
  test('global request middleware helper changes reconcile onto serialized responses', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(
      page,
      'globalSerialized',
      'global-before',
    )

    expect(response.status()).toBe(231)
    expect(response.statusText()).toBe('global-before')
    expect(header(response, 'x-global-before')).toBe('yes')
    expect(header(response, 'x-tss-serialized')).toBe('true')
    await expectServerFunctionResult(page, 'globalSerialized', '{"ok":true}')
  })

  test('global request middleware helper changes after next reconcile onto serialized responses', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(
      page,
      'globalSerialized',
      'global-after',
    )

    expect(response.status()).toBe(232)
    expect(response.statusText()).toBe('global-after')
    expect(header(response, 'x-global-after')).toBe('yes')
    expect(header(response, 'x-tss-serialized')).toBe('true')
    await expectServerFunctionResult(page, 'globalSerialized', '{"ok":true}')
  })

  test('function middleware helper changes after next reconcile onto serialized responses', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'functionAfterNext')

    expect(response.status()).toBe(236)
    expect(response.statusText()).toBe('function-after')
    expect(header(response, 'x-function-after')).toBe('yes')
    expect(header(response, 'x-tss-serialized')).toBe('true')
    await expectServerFunctionResult(page, 'functionAfterNext', '{"ok":true}')
  })

  test('raw server function responses reconcile helper changes after next', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(
      page,
      'rawResponseAfterNext',
    )

    expect(response.status()).toBe(237)
    expect(response.statusText()).toBe('function-raw-after')
    expect(header(response, 'x-function-raw')).toBe('yes')
    expect(header(response, 'x-function-raw-after')).toBe('yes')
    expect(header(response, 'x-tss-raw')).toBe('true')
    await expect(response.text()).resolves.toBe('raw function body')
    await expectServerFunctionResult(
      page,
      'rawResponseAfterNext',
      '237:raw function body',
    )
  })

  test('function response replacement carries helper deltas only', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'replacement')

    expect(header(response, 'x-function-a')).toBe(null)
    expect(header(response, 'x-function-b')).toBe('yes')
    expect(header(response, 'x-function-helper-delta')).toBe('yes')
    await expect(response.text()).resolves.toBe('function-b')
    await expectServerFunctionResult(page, 'replacement', '200:function-b')
  })

  test('server function preserves multiple Set-Cookie headers', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'multipleCookies')
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'fn-one', '1')
    expectCookie(cookies, 'fn-two', '2')
    await expectServerFunctionResult(page, 'multipleCookies', '{"ok":true}')
  })

  test('raw server function responses preserve multiple Set-Cookie headers', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'rawMultipleCookies')
    const cookies = await setCookieValues(response)

    expect(header(response, 'x-tss-raw')).toBe('true')
    expectCookie(cookies, 'fn-raw-returned-one', '1')
    expectCookie(cookies, 'fn-raw-returned-two', '2')
    expectCookie(cookies, 'fn-raw-helper-one', '1')
    expectCookie(cookies, 'fn-raw-helper-two', '2')
    await expect(response.text()).resolves.toBe('raw cookie body')
    await expectServerFunctionResult(
      page,
      'rawMultipleCookies',
      '200:raw cookie body',
    )
  })

  test('server function explicit Set-Cookie header arrays are preserved', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(
      page,
      'explicitCookieHeader',
    )
    const cookies = await setCookieValues(response)

    expectCookie(cookies, 'fn-explicit-one', '1')
    expectCookie(cookies, 'fn-explicit-two', '2')
    await expectServerFunctionResult(
      page,
      'explicitCookieHeader',
      '{"ok":true}',
    )
  })

  test.describe('expected 401 responses', () => {
    test.use({
      whitelistErrors: [
        /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/,
      ],
    })

    test('server function thrown errors preserve explicit response status', async ({
      page,
    }) => {
      const response = await invokeJsonServerFunction(page, 'throwAfterStatus')

      expect(response.status()).toBe(401)
      expect(response.statusText()).toBe('Unauthorized')
      expect(header(response, 'x-function-error')).toBe('yes')
      expect(header(response, 'x-tss-serialized')).toBe('true')
      await expectServerFunctionResult(page, 'throwAfterStatus', /Unauthorized/)
    })

    test('server function request middleware errors are serialized', async ({
      page,
    }) => {
      const response = await invokeJsonServerFunction(
        page,
        'globalSerialized',
        'global-throw',
      )

      expect(response.status()).toBe(401)
      expect(response.statusText()).toBe('Unauthorized')
      expect(header(response, 'x-global-error')).toBe('yes')
      expect(header(response, 'x-tss-serialized')).toBe('true')
      await expectServerFunctionResult(page, 'globalSerialized', /Unauthorized/)
    })

    test('regression #5107: function middleware thrown errors preserve explicit response status', async ({
      page,
    }) => {
      const response = await invokeJsonServerFunction(
        page,
        'throwAfterMiddlewareStatus',
      )

      expect(response.status()).toBe(401)
      expect(response.statusText()).toBe('Unauthorized')
      expect(header(response, 'x-function-error-middleware')).toBe('yes')
      expect(header(response, 'x-tss-serialized')).toBe('true')
      await expectServerFunctionResult(
        page,
        'throwAfterMiddlewareStatus',
        /Unauthorized/,
      )
    })
  })

  test('transport headers win over user helpers while user headers persist', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'transportProtected')

    expect(header(response, 'x-user-header')).toBe('yes')
    expect(header(response, 'x-tss-serialized')).toBe('true')
    expect(header(response, 'content-type')).toContain('application/json')
    await expectServerFunctionResult(page, 'transportProtected', '{"ok":true}')
  })

  test('server function getResponseHeader sees helper writes immediately', async ({
    page,
  }) => {
    const response = await invokeJsonServerFunction(page, 'readAfterSet')

    expect(header(response, 'x-read-after-set')).toBe('yes')
    expect(header(response, 'x-read-after-set-value')).toBe('yes')
    await expectServerFunctionResult(page, 'readAfterSet', '{"ok":true}')
  })
})
