import { describe, expect, it } from 'vitest'
import { CLIENT_ROUTE_OPTION_DELETE_NODES } from '../src/start-router-plugin/constants'

describe('client route option stripping', () => {
  it('strips server-only and prerender route options from client bundles', () => {
    expect(CLIENT_ROUTE_OPTION_DELETE_NODES).toEqual([
      'ssr',
      'server',
      'headers',
      'prerenderParams',
      'sitemap',
    ])
  })
})
