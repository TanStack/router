import { expectTypeOf, test } from 'vitest'
import {
  createServerEntry,
  getResponseHeaders,
  setResponseHeaders,
} from '../src/request-response'
import type { ReadonlyResponseHeaders } from '../src/request-response'
import type { RequestHandler } from '../src/request-handler'

function checkSnapshot(headers: ReturnType<typeof getResponseHeaders>) {
  expectTypeOf(headers).toEqualTypeOf<ReadonlyResponseHeaders>()
  expectTypeOf(headers.get('content-type')).toExtend<string | null>()
  expectTypeOf(headers.getSetCookie()).toEqualTypeOf<Array<string>>()
  expectTypeOf(Array.from(headers)).toEqualTypeOf<Array<[string, string]>>()
  setResponseHeaders(headers)

  // @ts-expect-error A snapshot cannot change outgoing response headers.
  headers.set('vary', 'Origin')
  // @ts-expect-error Use appendResponseHeader for outgoing appends.
  headers.append('vary', 'Origin')
  // @ts-expect-error Use removeResponseHeader for outgoing removals.
  headers.delete('vary')

  headers.forEach((_value, _name, parent) => {
    expectTypeOf(parent).toEqualTypeOf<ReadonlyResponseHeaders>()
    // @ts-expect-error The callback does not expose mutable outgoing headers.
    parent.set('vary', 'Origin')
  })
}

test('response header snapshots expose read methods and explicit copy-back', () => {
  expectTypeOf(checkSnapshot).toBeFunction()
})

type RequiredContextRegister = {
  server: { requestContext: { tenantId: string } }
}

function checkRequiredEntryContext(
  handler: RequestHandler<RequiredContextRegister>,
  request: Request,
) {
  const entry = createServerEntry({ fetch: handler })
  expectTypeOf(entry.fetch).toEqualTypeOf<
    RequestHandler<RequiredContextRegister>
  >()
  entry.fetch(request, { context: { tenantId: 'example' } })
  // @ts-expect-error The wrapped handler still requires request options.
  entry.fetch(request)
  // @ts-expect-error The wrapped handler still requires its request context.
  entry.fetch(request, {})
  // @ts-expect-error The wrapped handler still requires the tenant identifier.
  entry.fetch(request, { context: {} })
}

function checkOptionalEntryContext(
  handler: RequestHandler<unknown>,
  request: Request,
) {
  const entry = createServerEntry({ fetch: handler })
  expectTypeOf(entry.fetch).toEqualTypeOf<RequestHandler<unknown>>()
  entry.fetch(request)
  entry.fetch(request, {})
  entry.fetch(request, { context: { nonce: 'example' } })
}

test('server entries preserve inferred required and optional request context', () => {
  expectTypeOf(checkRequiredEntryContext).toBeFunction()
  expectTypeOf(checkOptionalEntryContext).toBeFunction()
})
