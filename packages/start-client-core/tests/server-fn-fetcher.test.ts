import { describe, expect, it, vi } from 'vitest'

// The isomorphic fn stubs resolve to their server implementation when they are
// not compiled, which needs a Start context that does not exist in a unit test.
vi.mock('../src/getStartOptions', () => ({
  getStartOptions: () => undefined,
}))

const { serverFnFetcher } = await import('../src/client-rpc/serverFnFetcher')

function fetchReturning(response: Response) {
  return async () => response
}

const args = [{ method: 'GET' as const, data: undefined }]

describe('serverFnFetcher', () => {
  it('rejects an untagged non-JSON response instead of returning it', async () => {
    const interstitial = '<!DOCTYPE html><html><body>challenge</body></html>'

    await expect(
      serverFnFetcher(
        '/_serverFn/abc',
        args,
        fetchReturning(
          new Response(interstitial, {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      ),
    ).rejects.toThrow(interstitial)
  })

  it('rejects an untagged non-JSON error response with the body', async () => {
    await expect(
      serverFnFetcher(
        '/_serverFn/abc',
        args,
        fetchReturning(
          new Response('blocked by bot management', {
            status: 403,
            headers: { 'content-type': 'text/plain' },
          }),
        ),
      ),
    ).rejects.toThrow('blocked by bot management')
  })

  it('still returns a raw response marked with x-tss-raw', async () => {
    const response = await serverFnFetcher(
      '/_serverFn/abc',
      args,
      fetchReturning(
        new Response('file contents', {
          status: 200,
          headers: { 'content-type': 'text/plain', 'x-tss-raw': 'true' },
        }),
      ),
    )

    expect(await (response as Response).text()).toBe('file contents')
  })
})
