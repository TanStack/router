import { describe, expect, test } from 'vitest'

import { defaultTransformer } from '../src/transformer'

describe('transformer.stringify', () => {
  test('should stringify dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(defaultTransformer.stringify(date)).toMatchInlineSnapshot(`
      "{"$date":"2021-08-19T20:00:00.000Z"}"
    `)
  })

  test('should stringify undefined', () => {
    expect(defaultTransformer.stringify(undefined)).toMatchInlineSnapshot(`
      "{"$undefined":""}"
    `)
  })

  test('should stringify object foo="bar"', () => {
    expect(defaultTransformer.stringify({ foo: 'bar' })).toMatchInlineSnapshot(`
      "{"foo":"bar"}"
    `)
  })

  test('should stringify object foo=undefined', () => {
    expect(defaultTransformer.stringify({ foo: undefined }))
      .toMatchInlineSnapshot(`
      "{"foo":{"$undefined":""}}"
    `)
  })

  test('should stringify object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(defaultTransformer.stringify({ foo: date })).toMatchInlineSnapshot(`
      "{"foo":{"$date":"2021-08-19T20:00:00.000Z"}}"
    `)
  })
})

describe('transformer.parse', () => {
  test('should parse dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const str = defaultTransformer.stringify(date)
    expect(defaultTransformer.parse(str)).toEqual(date)
  })

  test('should parse undefined', () => {
    const str = defaultTransformer.stringify(undefined)
    expect(defaultTransformer.parse(str)).toBeUndefined()
  })

  test('should parse object foo="bar"', () => {
    const obj = { foo: 'bar' }
    const str = defaultTransformer.stringify(obj)
    expect(defaultTransformer.parse(str)).toEqual(obj)
  })

  test('should parse object foo=undefined', () => {
    const obj = { foo: undefined }
    const str = defaultTransformer.stringify(obj)
    expect(defaultTransformer.parse(str)).toEqual(obj)
  })

  test('should parse object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const obj = { foo: date }
    const str = defaultTransformer.stringify(obj)
    expect(defaultTransformer.parse(str)).toEqual(obj)
  })
})
