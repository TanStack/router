/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  _resetServerComponentClient,
  _resetServerComponentRegistry,
  initServerComponentClient,
  reRenderServerComponent,
  serverComponent,
} from '../../src'
import type { Handle } from '@remix-run/ui'

beforeEach(() => {
  _resetServerComponentRegistry()
  _resetServerComponentClient()
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('serverComponent client runtime', () => {
  test('reRenderServerComponent swaps the matching span\'s innerHTML', async () => {
    // Register the component (so a future fetch call mock could resolve).
    serverComponent(
      '@/test/Card',
      function Card(_h: Handle<{ name: string }>) {
        return ({ name }) => <div>{name}</div>
      },
    )

    // Simulate the SSR-emitted document: marker spans + payload script.
    document.body.innerHTML = `
      <main>
        <span data-rmx-sc="s1" data-rmx-sc-id="@/test/Card" style="display:contents">
          <div>Ada</div>
        </span>
      </main>
      <script type="application/json" id="rmx-sc-payload">${JSON.stringify({
        s1: { id: '@/test/Card', props: { name: 'Ada' } },
      })}</script>
    `

    initServerComponentClient()

    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('<div>Bjarne</div>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    await reRenderServerComponent('s1', { name: 'Bjarne' }, { fetch: fakeFetch as any })

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, init] = fakeFetch.mock.calls[0]!
    expect(url).toContain('/_sc/' + encodeURIComponent('@/test/Card'))
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Bjarne' })

    const span = document.querySelector('[data-rmx-sc="s1"]')!
    expect(span.innerHTML.trim()).toBe('<div>Bjarne</div>')
  })

  test('no-ops for unknown instance ids', async () => {
    document.body.innerHTML = ''
    initServerComponentClient()
    const fakeFetch = vi.fn()
    await reRenderServerComponent('missing', { foo: 1 }, { fetch: fakeFetch as any })
    expect(fakeFetch).not.toHaveBeenCalled()
  })

  test('throws on a non-OK response', async () => {
    document.body.innerHTML = `
      <span data-rmx-sc="s1" data-rmx-sc-id="@/test/Boom"></span>
      <script type="application/json" id="rmx-sc-payload">${JSON.stringify({
        s1: { id: '@/test/Boom', props: {} },
      })}</script>
    `
    initServerComponentClient()
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500, statusText: 'Server Error' }),
    )
    await expect(
      reRenderServerComponent('s1', {}, { fetch: fakeFetch as any }),
    ).rejects.toThrow(/re-render of "@\/test\/Boom" failed: 500/)
  })
})
