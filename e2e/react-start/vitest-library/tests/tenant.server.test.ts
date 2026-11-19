import {
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'
import { expect, test, vi } from 'vitest'
import { tenantMiddleware } from '../src/tenant'

test('a request middleware passes context on and can change the response', async () => {
  await runInRequest({ url: 'https://acme.example.com/posts' }, async () => {
    const { context, response } = await runMiddleware(
      tenantMiddleware,
      {},
      ({ context }) => new Response(`Posts of ${context.tenant}`),
    )

    expect(context).toEqual({ tenant: 'acme' })
    expect(response.headers.get('x-tenant')).toBe('acme')
    await expect(response.text()).resolves.toBe('Posts of acme')
  })
})

test('a request middleware can answer the request itself', async () => {
  await runInRequest({ url: 'https://www.example.com/posts' }, async () => {
    const next = vi.fn()
    const { response } = await runMiddleware(tenantMiddleware, {}, next)

    expect(response.status).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })
})
