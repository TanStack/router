import { describe, expectTypeOf, it } from 'vitest'
import type { ParsePathParams } from '../src/link'
import type { ResolveParams } from '../src/route'

type Flatten<T> = { [K in keyof T]: T[K] }

describe('variadic path param types', () => {
  it('buckets {...$param} names into variadic', () => {
    expectTypeOf<
      ParsePathParams<'/$bucket/{...$folders}/$file'>['variadic']
    >().toEqualTypeOf<'folders'>()
    expectTypeOf<
      ParsePathParams<'/$bucket/{...$folders}/$file'>['required']
    >().toEqualTypeOf<'bucket' | 'file'>()
    expectTypeOf<
      ParsePathParams<'/$bucket/{...$folders}/$file'>['optional']
    >().toEqualTypeOf<never>()
  })

  it('keeps optional and variadic buckets distinct', () => {
    type P = ParsePathParams<'/a/{-$opt}/{...$rest}/$id'>
    expectTypeOf<P['optional']>().toEqualTypeOf<'opt'>()
    expectTypeOf<P['variadic']>().toEqualTypeOf<'rest'>()
    expectTypeOf<P['required']>().toEqualTypeOf<'id'>()
  })

  it('resolves variadic params as Array<string>', () => {
    type Params = ResolveParams<'/$bucket/{...$folders}/$file'>
    expectTypeOf<Params['folders']>().toEqualTypeOf<Array<string>>()
    expectTypeOf<Params['bucket']>().toEqualTypeOf<string>()
    expectTypeOf<Params['file']>().toEqualTypeOf<string>()
  })

  it('does not affect paths without a variadic', () => {
    expectTypeOf<
      ParsePathParams<'/posts/{-$category}/$id'>['variadic']
    >().toEqualTypeOf<never>()
    type Params = ResolveParams<'/posts/$id'>
    expectTypeOf<Flatten<Params>>().toEqualTypeOf<{ id: string }>()
  })

  it('buckets multiple variadics together, each typed as an array', () => {
    type P = ParsePathParams<'/{...$a}/mid/{...$b}'>
    expectTypeOf<P['variadic']>().toEqualTypeOf<'a' | 'b'>()
    type Params = ResolveParams<'/{...$a}/mid/{...$b}'>
    expectTypeOf<Params['a']>().toEqualTypeOf<Array<string>>()
    expectTypeOf<Params['b']>().toEqualTypeOf<Array<string>>()
  })

  it('types a nested storage path end to end', () => {
    type Params =
      ResolveParams<'/$bucket/{...$folders}/$file/versions/$versionId'>
    expectTypeOf<Flatten<Params>>().toEqualTypeOf<{
      bucket: string
      file: string
      versionId: string
      folders: Array<string>
    }>()
  })
})
