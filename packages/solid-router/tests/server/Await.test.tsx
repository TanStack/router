import { Errored, Loading } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { renderToStream } from '@solidjs/web'
import { Await } from '../../src/awaited'
import { renderToStringAsync } from './renderToStringAsync'

describe('Await (server)', () => {
  // Solid 2 holds the shell for an async read outside a Loading boundary.
  it('holds the shell while an Await without a fallback is pending', async () => {
    let resolvePromise!: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })
    const records: Array<string> = []
    const completed = renderToStream(() => (
      <html>
        <body>
          <Await promise={promise}>{(value) => <span>{value}</span>}</Await>
        </body>
      </html>
    )).pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          records.push(new TextDecoder().decode(chunk))
        },
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(records.join('')).not.toContain('resolved')

    resolvePromise('resolved')
    await completed
    expect(records.join('')).toContain('resolved')
  })

  it('renders an error boundary when an Await without a fallback rejects', async () => {
    const html = await renderToStringAsync(() => (
      <Loading fallback={<span>outer pending</span>}>
        <Errored
          fallback={(error) => <span>{(error() as Error).message}</span>}
        >
          <Loading fallback={<span>inner pending</span>}>
            <Await promise={Promise.reject(new Error('rejected'))}>
              {(value) => <span>{value}</span>}
            </Await>
          </Loading>
        </Errored>
      </Loading>
    ))

    expect(html).toContain('rejected')
    expect(html).not.toContain('pending')
  })

  it.each([
    ['zero', 0],
    ['false', false],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('renders a resolved %s value', async (_name, value) => {
    const children = vi.fn(() => <span>resolved</span>)

    const html = await renderToStringAsync(() => (
      <Await promise={Promise.resolve(value)} fallback={<span>pending</span>}>
        {children}
      </Await>
    ))

    expect(children).toHaveBeenCalledOnce()
    expect(children).toHaveBeenCalledWith(value)
    expect(html).toContain('resolved')
    expect(html).not.toContain('pending')
  })
})
