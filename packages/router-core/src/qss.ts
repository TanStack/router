/**
 * Program is a reimplementation of the `qss` package:
 * Copyright (c) Luke Edwards luke.edwards05@gmail.com, MIT License
 * https://github.com/lukeed/qss/blob/master/license.md
 *
 * This reimplementation uses modern browser APIs
 * (namely URLSearchParams) and TypeScript while still
 * maintaining the original functionality and interface.
 */
import { hasUriEncodedChars } from './utils'

/**
 * Encodes an object into a query string.
 * @param obj - The object to encode into a query string.
 * @param [pfx] - An optional prefix to add before the query string.
 * @returns The encoded query string.
 * @example
 * ```
 * // Example input: encode({ token: 'foo', key: 'value' })
 * // Expected output: "token=foo&key=value"
 * ```
 */
export function encode(obj: any, pfx?: string) {
  const normalizedObject = Object.entries(obj).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((v) => [key, String(v)])
    } else {
      return [[key, String(value)]]
    }
  })

  const searchParams = new URLSearchParams(normalizedObject)

  return (pfx || '') + searchParams.toString()
}

/**
 * Converts a string value to its appropriate type (string, number, boolean).
 * @param mix - The string value to convert.
 * @returns The converted value.
 * @example
 * // Example input: toValue("123")
 * // Expected output: 123
 */
function toValue(mix: any) {
  if (!mix) return ''
  const str = hasUriEncodedChars(mix)
    ? decodeURIComponent(mix)
    : decodeURIComponent(encodeURIComponent(mix))

  if (str === 'false') return false
  if (str === 'true') return true
  return +str * 0 === 0 && +str + '' === str ? +str : str
}

/**
 * Decodes a query string into an object.
 * @param str - The query string to decode.
 * @param [pfx] - An optional prefix to filter out from the query string.
 * @returns The decoded key-value pairs in an object format.
 * @example
 * // Example input: decode("token=foo&key=value")
 * // Expected output: { "token": "foo", "key": "value" }
 */
export function decode(str: any, pfx?: string): any {
  const searchParamsPart = pfx ? str.slice(pfx.length) : str
  const searchParams = new URLSearchParams(searchParamsPart)

  const entries = [...searchParams.entries()]

  return entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
    const previousValue = acc[key]
    if (previousValue == null) {
      acc[key] = toValue(value)
    } else {
      acc[key] = Array.isArray(previousValue)
        ? [...previousValue, toValue(value)]
        : [previousValue, toValue(value)]
    }

    return acc
  }, {})
}
