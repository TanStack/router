import { test } from 'vitest'
import * as h3 from 'h3'
import * as tssServer from '../src'

interface Foo {
  a: string
}

type Tail<T> = T extends [any, ...infer U] ? U : never
type PrependOverload<
  TOriginal extends (...args: Array<any>) => any,
  TOverload extends (...args: Array<any>) => any,
> = TOverload & TOriginal

function expectWrapperToMatchH3<TFn extends (...args: any) => any>(
  _h3Function: TFn,
  _tssFunction: PrependOverload<
    TFn,
    (...args: Tail<Parameters<TFn>>) => ReturnType<TFn>
  >,
) {
  /* equivalent to:
  expectTypeOf<Parameters<typeof h3Function>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()
  expectTypeOf<Tail<Parameters<typeof h3Function>>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()

  expectTypeOf(tssFunction).returns.toEqualTypeOf<
    ReturnType<typeof h3Function>
  >()
  */
}

test('wrappers can be used with generics', () => {
  expectWrapperToMatchH3(h3.readRawBody<'hex'>, tssServer.readRawBody<'hex'>)

  expectWrapperToMatchH3(h3.readBody<Foo>, tssServer.readBody<Foo>)

  expectWrapperToMatchH3(h3.getQuery<Foo>, tssServer.getQuery<Foo>)

  expectWrapperToMatchH3(
    h3.getValidatedQuery<Foo>,
    tssServer.getValidatedQuery<Foo>,
  )

  expectWrapperToMatchH3(
    h3.getValidatedRouterParams<Foo>,
    tssServer.getValidatedRouterParams<Foo>,
  )

  expectWrapperToMatchH3(
    h3.setResponseHeader<'Age'>,
    tssServer.setResponseHeader<'Age'>,
  )

  expectWrapperToMatchH3(
    h3.appendResponseHeader<'Age'>,
    tssServer.appendResponseHeader<'Age'>,
  )

  expectWrapperToMatchH3(
    h3.fetchWithEvent<Foo, Foo, typeof fetch>,
    tssServer.fetchWithEvent<Foo, Foo, typeof fetch>,
  )

  expectWrapperToMatchH3(h3.useSession<Foo>, tssServer.useSession<Foo>)

  expectWrapperToMatchH3(h3.getSession<Foo>, tssServer.getSession<Foo>)

  expectWrapperToMatchH3(h3.updateSession<Foo>, tssServer.updateSession<Foo>)

  expectWrapperToMatchH3(h3.sealSession<Foo>, tssServer.sealSession<Foo>)

  expectWrapperToMatchH3(h3.appendHeader<'Age'>, tssServer.appendHeader<'Age'>)

  expectWrapperToMatchH3(h3.setHeader<'Age'>, tssServer.setHeader<'Age'>)

  expectWrapperToMatchH3(
    h3.readValidatedBody<Foo>,
    tssServer.readValidatedBody<Foo>,
  )
})
