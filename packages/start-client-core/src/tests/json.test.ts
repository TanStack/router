import { describe, expect, it } from 'vitest'
import { json } from '../json'

describe('json', () => {
  it('sets the content type to application/json and stringifies the data', async () => {
    const data = { foo: 'bar' }
    const response = json(data)

    expect(response.headers.get('Content-Type')).toBe('application/json')

    const responseClone = response.clone()
    await expect(responseClone.text()).resolves.toEqual(JSON.stringify(data))

    await expect(response.json()).resolves.toEqual(data)
  })
  it("doesn't override the content type if it's already set", () => {
    const response = json(null, { headers: { 'Content-Type': 'text/plain' } })

    expect(response.headers.get('Content-Type')).toBe('text/plain')
  })
  it('reflects passed status and statusText', () => {
    const response = json(null, { status: 404, statusText: 'Not Found' })

    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
  })
  it.each<[string, HeadersInit]>([
    ['plain object', { 'X-TYPE': 'example' }],
    ['array', [['X-TYPE', 'example']]],
    ['Headers', new Headers({ 'X-TYPE': 'example' })],
  ])('merges headers from %s', (_, headers) => {
    const response = json(null, { headers })

    expect(response.headers.get('X-TYPE')).toBe('example')
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })
})
