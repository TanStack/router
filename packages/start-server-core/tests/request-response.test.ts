import { describe, expect, it, vi } from 'vitest'
import { createServerEntry, getRequestUrl } from '../src/request-response'

describe('server entry pathname validation', () => {
  it.each([
    '/malformed/%E0%A4',
    '/malformed/%80',
    '/malformed/%FF',
    '/malformed/%',
    '/malformed/%2',
    '/malformed/%GG',
  ])('rejects %s before calling the entry', async (pathname) => {
    const fetch = vi.fn(() => new Response('unused'))
    const entry = createServerEntry({ fetch })

    const response = await entry.fetch(
      new Request(`http://localhost${pathname}`),
    )

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Bad Request')
    expect(response.body).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    '/plain',
    '/%2Fdocs',
    '/%25',
    '/%5Cdocs',
    '/%E2%9C%93',
    '/%252Fdocs',
    '/%2Fdocs?searchParam=%E0%A4',
    '/plain?searchParam=%GG',
  ])('preserves the pathname and search of %s', async (path) => {
    const fetch = vi.fn(() => {
      const url = getRequestUrl()
      return new Response(url.pathname + url.search)
    })
    const entry = createServerEntry({ fetch })

    const response = await entry.fetch(new Request(`http://localhost${path}`))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe(path)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
