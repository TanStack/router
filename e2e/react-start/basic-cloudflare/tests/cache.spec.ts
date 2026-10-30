import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const headers = { Accept: 'text/html' }

test.afterEach(async ({ request }) => {
  await request.post('/__cache-test?finish-stream', { data: '' })
  await request.post('/__cache-test', { data: 'Hello from Cloudflare' })
})

test('public HTML cache hits bypass loaders and expiry exposes updated content', async ({
  request,
}) => {
  await request.post('/__cache-test', { data: 'Published version one' })
  const first = await request.get('/?case=freshness', { headers })
  expect(await first.text()).toContain('Published version one')
  expect(first.headers()['x-html-cache']).toBe('MISS')
  await expect
    .poll(
      async () =>
        (await request.get('/?case=freshness', { headers })).headers()[
          'x-html-cache'
        ],
    )
    .toBe('HIT')
  const warm = await request.get('/?case=freshness', { headers })
  const loads = warm.headers()['x-loader-count']
  const beforeHit = await (await request.get('/__cache-test')).json()
  await request.post('/__cache-test', { data: 'Published version two' })
  const second = await request.get('/?case=freshness', { headers })
  expect(second.headers()['x-loader-count']).toBe(loads)
  expect((await (await request.get('/__cache-test')).json()).loads).toBe(
    beforeHit.loads,
  )
  expect(await second.text()).toContain('Published version one')
  await expect
    .poll(
      async () => {
        const response = await request.get('/?case=freshness', { headers })
        return response.text()
      },
      { timeout: 10_000, intervals: [1000] },
    )
    .toContain('Published version two')
  expect(
    (await (await request.get('/__cache-test')).json()).loads,
  ).toBeGreaterThan(beforeHit.loads)
  const fresh = await request.get('/?case=freshness', { headers })
  expect(Number(fresh.headers()['x-loader-count'])).toBeGreaterThan(
    Number(loads),
  )
})

test('personalized users bypass the same warm public entry without replacing it', async ({
  request,
}) => {
  const url = '/?case=personalized'
  await request.get(url, { headers })
  await expect
    .poll(
      async () =>
        (await request.get(url, { headers })).headers()['x-html-cache'],
    )
    .toBe('HIT')
  const publicHtml = await (await request.get(url, { headers })).text()
  for (const [session, name] of [
    ['alice', 'Alice'],
    ['bob', 'Bob'],
    ['alice', 'Alice'],
  ]) {
    const before = await (await request.get('/__cache-test')).json()
    const response = await request.get(url, {
      headers: { ...headers, Cookie: `session=${session}` },
    })
    expect(response.headers()['x-html-cache']).toBe('BYPASS')
    expect(response.headers()['cache-control']).toBe('private, no-store')
    const html = await response.text()
    expect(html).toContain(`Private content for ${name}`)
    expect(html).not.toContain(
      `Private content for ${name === 'Alice' ? 'Bob' : 'Alice'}`,
    )
    expect(
      (await (await request.get('/__cache-test')).json()).loads,
    ).toBeGreaterThan(before.loads)
  }
  const anonymous = await request.get(url, { headers })
  expect(anonymous.headers()['x-html-cache']).toBe('HIT')
  expect(await anonymous.text()).toBe(publicHtml)
})

test('static assets serve the build output even when SSR data changes', async ({
  request,
}) => {
  expect(() => readFileSync('dist/client/index.html')).toThrow()
  const html = readFileSync('dist/client/static/index.html', 'utf8')
  const before = await request.get('/static', { headers })
  expect(await before.text()).toBe(html)
  await request.post('/__cache-test', { data: 'Changed after build' })
  const dynamic = await request.get('/?case=after-build', { headers })
  expect(await dynamic.text()).toContain('Changed after build')
  const after = await request.get('/static', {
    headers: { ...headers, 'Cache-Control': 'no-cache' },
  })
  expect(await after.text()).toBe(html)
  // The Worker marks its own responses; static-assets-first routing bypasses it.
  expect(after.headers()['x-html-cache']).toBeUndefined()
})

test('search and locale variants have separate cache entries', async ({
  request,
}) => {
  await request.post('/__cache-test', { data: 'Variants' })
  for (const edition of ['one', 'two']) {
    for (const language of ['en', 'fr']) {
      const options = { headers: { ...headers, 'Accept-Language': language } }
      const url = `/?edition=${edition}`
      const first = await request.get(url, options)
      expect(await first.text()).toContain(
        `Variants (${edition} / ${language})`,
      )
      await expect
        .poll(
          async () =>
            (await request.get(url, options)).headers()['x-html-cache'],
        )
        .toBe('HIT')
      const beforeHit = await (await request.get('/__cache-test')).json()
      const hit = await request.get(url, options)
      expect((await (await request.get('/__cache-test')).json()).loads).toBe(
        beforeHit.loads,
      )
      expect(await hit.text()).toContain(`Variants (${edition} / ${language})`)
      expect(hit.headers()['x-loader-count']).toBe(
        first.headers()['x-loader-count'],
      )
    }
  }
})

test('credentials, methods and conditional requests bypass an already warm cache', async ({
  request,
}) => {
  const url = '/?case=bypass'
  await request.get(url, { headers })
  await expect
    .poll(
      async () =>
        (await request.get(url, { headers })).headers()['x-html-cache'],
    )
    .toBe('HIT')
  const bypassHeaders: Array<Record<string, string>> = [
    { Cookie: 'unrelated=value' },
    { Authorization: 'Bearer test' },
    { Range: 'bytes=0-100' },
    { 'If-Match': '"version"' },
    { 'If-Modified-Since': 'Tue, 01 Jan 2030 00:00:00 GMT' },
    { 'If-Range': '"version"' },
    { 'If-Unmodified-Since': 'Tue, 01 Jan 2030 00:00:00 GMT' },
    { Pragma: 'no-cache' },
    { Origin: 'https://example.com' },
    { 'If-None-Match': '"version"' },
    { 'Cache-Control': 'no-cache' },
    { Accept: 'application/json' },
  ]
  for (const extra of bypassHeaders) {
    const response = await request.get(url, {
      headers: { ...headers, ...extra },
    })
    expect(response.headers()['x-html-cache']).toBe('BYPASS')
    expect(response.headers()['cache-control']).toBe('private, no-store')
  }
  for (const method of ['HEAD', 'POST']) {
    const response = await request.fetch(url, { method, headers })
    expect(response.headers()['x-html-cache']).toBe('BYPASS')
  }
})

test('Set-Cookie, private policy and unsupported Vary prevent cache writes', async ({
  request,
}) => {
  for (const mode of ['cookie', 'private', 'vary', 'error', 'encoded']) {
    await request.post('/__cache-test', {
      data: 'Uncacheable',
      headers: { 'X-Test-Mode': mode },
    })
    // Native fetch does not retain response cookies between requests.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(
        `${test.info().project.use.baseURL}/?case=${mode}`,
        { headers },
      )
      expect(response.headers.get('x-html-cache')).toBe('BYPASS')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      if (mode === 'error') {
        expect(response.status).toBe(500)
      }
      if (mode === 'cookie') {
        expect(response.headers.get('set-cookie')).toContain('session=new')
      }
      await response.text()
    }
  }
  await request.post('/__cache-test', { data: 'Hello from Cloudflare' })
})

for (const disconnect of [false, true]) {
  test(`a cache miss streams before deferred data completes (disconnect: ${disconnect})`, async ({
    request,
    baseURL,
  }) => {
    await request.post('/__cache-test', {
      data: 'Streaming document',
      headers: { 'X-Test-Mode': 'stream' },
    })
    const controller = new AbortController()
    const url = `/?case=stream-${disconnect}`
    const response = await fetch(`${baseURL}${url}`, {
      headers,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    })
    expect(response.headers.get('x-html-cache')).toBe('MISS')
    const reader = response.body!.getReader()
    try {
      const decoder = new TextDecoder()
      let html = ''
      while (!html.includes('Streaming document')) {
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        html += decoder.decode(chunk.value, { stream: true })
      }
      if (disconnect) {
        controller.abort()
      }
    } finally {
      await request.post('/__cache-test?finish-stream', { data: '' })
    }
    if (!disconnect) {
      while (!(await reader.read()).done) {
        // Drain the completed document to let both stream branches finish.
      }
    }
    await request.post('/__cache-test', { data: 'Hello from Cloudflare' })
    await expect
      .poll(
        async () =>
          (await request.get(url, { headers })).headers()['x-html-cache'],
      )
      .toBe('HIT')
    const cached = await request.get(url, { headers })
    expect(await cached.text()).toContain('Streaming document')
    expect(await cached.text()).toContain('</html>')
  })
}
