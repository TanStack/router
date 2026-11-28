// The client stub of a build with a custom `generateFunctionId`
// (`createGatedClientServerFn`) passes a build token the runtime stores on
// the RPC: the server fn it makes is the one `createClientServerFn` makes,
// and nothing of it shows in the server fn's keys or its spread. (Its
// calls: the builds of start-plugin-core's
// integration/start-build-server-fn-callable.test.ts call gated stubs.)
import { expect, test } from 'vitest'
import { createClientServerFn } from '../src/client-rpc'
import { createGatedClientServerFn } from '../src/client-rpc/gated'
import { createServerFn } from '../src/createServerFn'

const token = '#0123456789abcdef'

test('a gated stub is the server fn of an ungated one, and its token is not among its own data', () => {
  const builder = () =>
    createServerFn({ method: 'POST' }).validator(
      (data: { value: number }) => data,
    )
  const plain = createClientServerFn('fn-id', builder() as any) as any
  const gated = createGatedClientServerFn(
    'fn-id',
    builder() as any,
    token,
  ) as any
  expect({
    url: gated.url,
    method: gated.method,
    keys: Object.keys(gated).sort(),
    spread: JSON.stringify({ ...gated }),
  }).toEqual({
    url: plain.url,
    method: plain.method,
    keys: Object.keys(plain).sort(),
    spread: JSON.stringify({ ...plain }),
  })
})
