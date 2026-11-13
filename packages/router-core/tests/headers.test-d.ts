import { describe, expectTypeOf, it } from 'vitest'
import type { OutgoingHttpHeaders as HttpHeaders } from 'node:http'
import type { OutgoingHttpHeaders as Http2Headers } from 'node:http2'
import type { AnyHeaders, mergeHeaders } from '../src/ssr/headers'

describe('portable outgoing headers', () => {
  it('retains Node HTTP and HTTP/2 header compatibility', () => {
    expectTypeOf<HttpHeaders>().toExtend<AnyHeaders>()
    expectTypeOf<Http2Headers>().toExtend<AnyHeaders>()
    expectTypeOf<typeof mergeHeaders>().toBeCallableWith(
      {} as HttpHeaders,
      {} as Http2Headers,
    )
  })

  it('accepts portable outgoing header values', () => {
    expectTypeOf<typeof mergeHeaders>().toBeCallableWith({
      'content-length': 123,
      'set-cookie': ['first=1', 'second=2'],
      'x-value': 'value',
      'x-absent': undefined,
    })
  })
})
