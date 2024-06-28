// qss has been slightly modified and inlined here for our use cases (and compression's sake). We've included it as a hard dependency for MIT license attribution.

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
  let k,
    i,
    tmp,
    str = ''

  for (k in obj) {
    if ((tmp = obj[k]) !== void 0) {
      if (Array.isArray(tmp)) {
        for (i = 0; i < tmp.length; i++) {
          str && (str += '&')
          str += encodeURIComponent(k) + '=' + encodeURIComponent(tmp[i])
        }
      } else {
        str && (str += '&')
        str += encodeURIComponent(k) + '=' + encodeURIComponent(tmp)
      }
    }
  }

  return (pfx || '') + str
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
  const str = decodeURIComponent(mix)
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
export function decode(str: any, pfx?: string) {
  let tmp, k
  const out: any = {},
    arr = (pfx ? str.substr(pfx.length) : str).split('&')

  while ((tmp = arr.shift())) {
    const equalIndex = tmp.indexOf('=')
    if (equalIndex !== -1) {
      k = tmp.slice(0, equalIndex)
      const value = tmp.slice(equalIndex + 1)
      if (out[k] !== void 0) {
        // @ts-expect-error
        out[k] = [].concat(out[k], toValue(value))
      } else {
        out[k] = toValue(value)
      }
    } else {
      k = tmp
      out[k] = ''
    }
  }

  return out
}
