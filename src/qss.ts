export function encode(obj: Record<string, unknown>, pfx: string): string {
  var k,
    i,
    tmp: any,
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

function toValue(mix?: string) {
  if (!mix) return ''
  var str = decodeURIComponent(mix)
  if (str === 'false') return false
  if (str === 'true') return true
  return +str * 0 === 0 ? +str : str
}

export function decode<T extends Record<string, unknown>>(str: string): T {
  var tmp,
    k,
    out: any = {},
    arr = str.split('&')

  while ((tmp = arr.shift())) {
    tmp = tmp.split('=')
    k = tmp.shift()
    if (k) {
      if (out[k] !== void 0) {
        let next = tmp.shift()
        if (next) {
          const toConcat: any = toValue(next)
          out[k] = [].concat(out[k], toConcat)
        }
      } else {
        out[k] = toValue(tmp.shift())
      }
    }
  }

  return out
}
