/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { renderToString } from '@remix-run/ui/server'
import {
  _resetServerComponentRegistry,
  activateServerComponentCollector,
  createServerComponentCollector,
  deactivateServerComponentCollector,
  handleServerComponentRequest,
  isServerComponent,
  serverComponent,
} from '../src'
import type { Handle } from '@remix-run/ui'

interface UserCardProps {
  userId: number
  name: string
}

function buildUserCard() {
  return serverComponent(
    '@/test/UserCard',
    function UserCard(_handle: Handle<UserCardProps>) {
      return ({ userId, name }: UserCardProps) => (
        <article data-testid="card">
          <h2>{name}</h2>
          <small>id: {userId}</small>
        </article>
      )
    },
  )
}

beforeEach(() => {
  _resetServerComponentRegistry()
})

afterEach(() => {
  deactivateServerComponentCollector()
})

describe('serverComponent() marker', () => {
  test.todo('marks the wrapper with a brand and id', () => {
    const Comp = buildUserCard()
    expect(isServerComponent(Comp)).toBe(true)
    expect((Comp as any).$serverComponentId).toBe('@/test/UserCard')
  })

  test.todo('used as JSX, the wrapper is itself the SSR boundary', async () => {
    const Comp = buildUserCard()
    const collector = createServerComponentCollector()
    activateServerComponentCollector(collector)

    const html = await renderToString(
      <main>
        <Comp userId={7} name="Ada" />
      </main>,
    )
    deactivateServerComponentCollector()

    expect(html).toContain('data-rmx-sc="s1"')
    expect(html).toContain('data-rmx-sc-id="@/test/UserCard"')
    expect(html).toContain('<h2>Ada</h2>')

    const entries = collector.drain()
    expect(entries.s1).toEqual({
      id: '@/test/UserCard',
      props: { userId: 7, name: 'Ada' },
    })
  })

  test.todo('multiple instances get distinct ids', async () => {
    const Comp = buildUserCard()
    const collector = createServerComponentCollector()
    activateServerComponentCollector(collector)

    await renderToString(
      <main>
        <Comp userId={1} name="Ada" />
        <Comp userId={2} name="Bjarne" />
      </main>,
    )
    deactivateServerComponentCollector()

    const entries = collector.drain()
    expect(Object.keys(entries).sort()).toEqual(['s1', 's2'])
    expect((entries.s1!.props as UserCardProps).name).toBe('Ada')
    expect((entries.s2!.props as UserCardProps).name).toBe('Bjarne')
  })
})

describe('re-render endpoint', () => {
  test.todo('renders with new props on POST', async () => {
    buildUserCard()

    const req = new Request(
      'http://localhost/_sc/' + encodeURIComponent('@/test/UserCard'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 99, name: 'Carmack' }),
      },
    )

    const res = await handleServerComponentRequest(req)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h2>Carmack</h2>')
    expect(html).toContain('id: 99')
  })

  test.todo('returns 404 for an unknown component id', async () => {
    const req = new Request('http://localhost/_sc/unknown-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const res = await handleServerComponentRequest(req)
    expect(res.status).toBe(404)
  })

  test.todo('reads props from query string on GET', async () => {
    buildUserCard()
    const props = encodeURIComponent(
      JSON.stringify({ userId: 12, name: 'Linus' }),
    )
    const req = new Request(
      'http://localhost/_sc/' +
        encodeURIComponent('@/test/UserCard') +
        '?props=' +
        props,
    )
    const res = await handleServerComponentRequest(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<h2>Linus</h2>')
  })
})
