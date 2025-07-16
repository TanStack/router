import { describe, expect, it } from 'vitest'
import { startSerializer as serializer } from '../serializer'

describe('transformer.stringify', () => {
  it('should stringify dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(serializer.stringify(date)).toMatchInlineSnapshot(`
      "{"$date":"2021-08-19T20:00:00.000Z"}"
    `)
  })

  it('should stringify undefined', () => {
    expect(serializer.stringify(undefined)).toMatchInlineSnapshot(
      `"{"$undefined":0}"`,
    )
  })

  it('should stringify object foo="bar"', () => {
    expect(serializer.stringify({ foo: 'bar' })).toMatchInlineSnapshot(`
      "{"foo":"bar"}"
    `)
  })

  it('should stringify object foo=undefined', () => {
    expect(serializer.stringify({ foo: undefined })).toMatchInlineSnapshot(
      `"{"foo":{"$undefined":0}}"`,
    )
  })

  it('should stringify object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(serializer.stringify({ foo: date })).toMatchInlineSnapshot(`
      "{"foo":{"$date":"2021-08-19T20:00:00.000Z"}}"
    `)
  })

  it('should stringify empty FormData', () => {
    const formData = new FormData()
    expect(serializer.stringify(formData)).toMatchInlineSnapshot(
      `"{"$formData":{}}"`,
    )
  })

  it('should stringify FormData with key-value pairs of foo="bar",name="Sean"', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('name', 'Sean')
    expect(serializer.stringify(formData)).toMatchInlineSnapshot(
      `"{"$formData":{"foo":"bar","name":"Sean"}}"`,
    )
  })
  it('should stringify FormData with multiple values for the same key', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('foo', 'baz')
    expect(serializer.stringify(formData)).toMatchInlineSnapshot(
      `"{"$formData":{"foo":["bar","baz"]}}"`,
    )
  })

  it('should stringify bigint', () => {
    const bigint = BigInt('9007199254740992')
    expect(serializer.stringify(bigint)).toMatchInlineSnapshot(
      `"{"$bigint":"9007199254740992"}"`,
    )
  })
  it('should stringify object foo=bigint', () => {
    const bigint = BigInt('9007199254740992')
    expect(serializer.stringify({ foo: bigint })).toMatchInlineSnapshot(
      `"{"foo":{"$bigint":"9007199254740992"}}"`,
    )
  })
})

describe('transformer.parse', () => {
  it('should parse dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const str = serializer.stringify(date)
    expect(serializer.parse(str)).toEqual(date)
    expect(serializer.parse(str) instanceof Date).toBe(true)
  })

  it('should parse undefined', () => {
    const str = serializer.stringify(undefined)
    expect(serializer.parse(str)).toBeUndefined()
  })

  it('should parse object foo="bar"', () => {
    const obj = { foo: 'bar' }
    const str = serializer.stringify(obj)
    expect(serializer.parse(str)).toEqual(obj)
  })

  it('should parse object foo=undefined', () => {
    const obj = { foo: undefined }
    const str = serializer.stringify(obj)
    expect(serializer.parse(str)).toEqual(obj)
  })

  it('should parse object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const obj = { foo: date }
    const str = serializer.stringify(obj)
    expect(serializer.parse(str)).toEqual(obj)
  })

  it('should parse empty FormData', () => {
    const formData = new FormData()
    const str = serializer.stringify(formData)
    const parsed = serializer.parse(str) as FormData
    expect(parsed).toBeInstanceOf(FormData)
    expect([...parsed.entries()]).toEqual([])
  })

  it('should parse FormData with key-value pairs of foo="bar",name="Sean"', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('name', 'Sean')
    const str = serializer.stringify(formData)
    const parsed = serializer.parse(str) as FormData
    expect(parsed).toBeInstanceOf(FormData)
    expect([...parsed.entries()]).toEqual([
      ['foo', 'bar'],
      ['name', 'Sean'],
    ])
  })
  it('should parse FormData with multiple values for the same key', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('foo', 'baz')
    const str = serializer.stringify(formData)
    const parsed = serializer.parse(str) as FormData
    expect(parsed).toBeInstanceOf(FormData)
    expect([...parsed.entries()]).toEqual([
      ['foo', 'bar'],
      ['foo', 'baz'],
    ])
  })

  it('should parse bigint', () => {
    const bigint = BigInt('9007199254740992')
    const str = serializer.stringify(bigint)
    expect(serializer.parse(str)).toEqual(bigint)
  })
  it('should parse object foo=bigint', () => {
    const bigint = BigInt('9007199254740992')
    const obj = { foo: bigint }
    const str = serializer.stringify(obj)
    expect(serializer.parse(str)).toEqual(obj)
  })
})
