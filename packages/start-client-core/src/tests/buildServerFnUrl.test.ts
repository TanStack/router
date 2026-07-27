import { decode } from '@tanstack/router-core'
import { fromJSON } from 'seroval'
import { describe, expect, test } from 'vitest'
import { buildServerFnUrlFromBase } from '../client-rpc/serverFnUrl'
import { getDefaultSerovalPlugins } from '../getDefaultSerovalPlugins'

function getPayload(url: string) {
  const search = url.split('?')[1] ?? ''
  const payload = decode(search).payload
  return fromJSON(JSON.parse(payload), {
    plugins: getDefaultSerovalPlugins(),
  })
}

describe('buildServerFnUrlFromBase', () => {
  test('returns base url without payload', async () => {
    await expect(buildServerFnUrlFromBase('/_serverFn/test')).resolves.toBe(
      '/_serverFn/test',
    )
  })

  test('serializes data into payload query param', async () => {
    const url = await buildServerFnUrlFromBase('/_serverFn/test', {
      data: { page: 1, filter: 'new' },
    })

    expect(url).toContain('/_serverFn/test?payload=')
    expect(getPayload(url)).toEqual({
      data: { page: 1, filter: 'new' },
    })
  })

  test('appends payload to existing query params', async () => {
    const url = await buildServerFnUrlFromBase(
      '/_serverFn/test?existing=true',
      {
        data: { page: 1 },
      },
    )

    expect(url).toContain('/_serverFn/test?existing=true&payload=')
    expect(getPayload(url)).toEqual({
      data: { page: 1 },
    })
  })

  test('rejects FormData', async () => {
    await expect(
      buildServerFnUrlFromBase('/_serverFn/test', { data: new FormData() }),
    ).rejects.toThrow('FormData is not supported with GET requests')
  })
})
