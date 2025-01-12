import { describe, expect, it } from 'vitest'

import { defaultTransformer as tf } from '../src/transformer'

describe('transformer.stringify', () => {
  it('should stringify dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(tf.stringify(date)).toMatchInlineSnapshot(`
      "{"$date":"2021-08-19T20:00:00.000Z"}"
    `)
  })

  it('should stringify undefined', () => {
    expect(tf.stringify(undefined)).toMatchInlineSnapshot(`"{"$undefined":0}"`)
  })

  it('should stringify object foo="bar"', () => {
    expect(tf.stringify({ foo: 'bar' })).toMatchInlineSnapshot(`
      "{"foo":"bar"}"
    `)
  })

  it('should stringify object foo=undefined', () => {
    expect(tf.stringify({ foo: undefined })).toMatchInlineSnapshot(
      `"{"foo":{"$undefined":0}}"`,
    )
  })

  it('should stringify object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    expect(tf.stringify({ foo: date })).toMatchInlineSnapshot(`
      "{"foo":{"$date":"2021-08-19T20:00:00.000Z"}}"
    `)
  })

  it('should stringify empty FormData', () => {
    const formData = new FormData()
    expect(tf.stringify(formData)).toMatchInlineSnapshot(`"{"$formData":{}}"`)
  })

  it('should stringify FormData with key-value pairs of foo="bar",name="Sean"', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('name', 'Sean')
    expect(tf.stringify(formData)).toMatchInlineSnapshot(
      `"{"$formData":{"foo":"bar","name":"Sean"}}"`,
    )
  })
})

describe('transformer.parse', () => {
  it('should parse dates', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const str = tf.stringify(date)
    expect(tf.parse(str)).toEqual(date)
  })

  it('should parse undefined', () => {
    const str = tf.stringify(undefined)
    expect(tf.parse(str)).toBeUndefined()
  })

  it('should parse object foo="bar"', () => {
    const obj = { foo: 'bar' }
    const str = tf.stringify(obj)
    expect(tf.parse(str)).toEqual(obj)
  })

  it('should parse object foo=undefined', () => {
    const obj = { foo: undefined }
    const str = tf.stringify(obj)
    expect(tf.parse(str)).toEqual(obj)
  })

  it('should parse object foo=Date', () => {
    const date = new Date('2021-08-19T20:00:00.000Z')
    const obj = { foo: date }
    const str = tf.stringify(obj)
    expect(tf.parse(str)).toEqual(obj)
  })

  it('should parse empty FormData', () => {
    const formData = new FormData()
    const str = tf.stringify(formData)
    const parsed = tf.parse(str) as FormData
    expect(parsed).toBeInstanceOf(FormData)
    expect([...parsed.entries()]).toEqual([])
  })

  it('should parse FormData with key-value pairs of foo="bar",name="Sean"', () => {
    const formData = new FormData()
    formData.append('foo', 'bar')
    formData.append('name', 'Sean')
    const str = tf.stringify(formData)
    const parsed = tf.parse(str) as FormData
    expect(parsed).toBeInstanceOf(FormData)
    expect([...parsed.entries()]).toEqual([
      ['foo', 'bar'],
      ['name', 'Sean'],
    ])
  })
})
