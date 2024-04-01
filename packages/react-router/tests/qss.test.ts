/* eslint-disable */
import { describe, it, expect } from 'vitest'
import { encode, decode } from '../src/qss'

describe('encode function', () => {
  it('should encode an object into a query string without a prefix', () => {
    const obj = { token: 'foo', key: 'value' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo&key=value')
  })

  // it('should encode an object into a query string with a prefix', () => {
  //   const obj = { token: 'foo', key: 'value' }
  //   const queryString = encode(obj, 'prefix_')
  //   expect(queryString).toEqual('prefix_token=foo&prefix_key=value')
  // })

  it('should handle encoding an object with empty values and trailing equal signs', () => {
    const obj = { token: '', key: 'value=' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=&key=value%3D') // token=&key=value=
  })

  it('should handle encoding an object with array values', () => {
    const obj = { token: ['foo', 'bar'], key: 'value' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo&token=bar&key=value')
  })

  it('should handle encoding an object with special characters', () => {
    const obj = { token: 'foo?', key: 'value=' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo%3F&key=value%3D')
  })
})

describe('decode function', () => {
  it('should decode a query string without a prefix', () => {
    const queryString = 'token=foo&key=value'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: 'foo', key: 'value' })
  })

  // it('should decode a query string with a prefix', () => {
  //   const queryString = 'prefix_token=foo&prefix_key=value'
  //   const decodedObj = decode(queryString, 'prefix_')
  //   expect(decodedObj).toEqual({ token: 'foo', key: 'value' })
  // })

  it('should handle missing values and trailing equal signs', () => {
    const queryString = 'token=&key=value='
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: '', key: 'value=' })
  })

  it('should handle decoding a query string with array values', () => {
    const queryString = 'token=foo&token=bar&key=value'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: ['foo', 'bar'], key: 'value' })
  })

  it('should handle decoding a query string with special characters', () => {
    const queryString = 'token=foo%3F&key=value%3D'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: 'foo?', key: 'value=' })
  })
})
