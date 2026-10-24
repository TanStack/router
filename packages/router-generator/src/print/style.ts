/** The code style of what the generator prints (`quoteStyle`, `semicolons`). */
export interface CodeStyle {
  quote: "'" | '"'
  semicolons: boolean
}

export function styleOf(config: {
  quoteStyle: 'single' | 'double'
  semicolons: boolean
}): CodeStyle {
  return {
    quote: config.quoteStyle === 'double' ? '"' : "'",
    semicolons: config.semicolons,
  }
}

/** A string literal of `value` in quote `quote`, escaped as needed. */
export function lit(value: string, quote: "'" | '"' | '`' = "'"): string {
  let out = quote
  for (const char of value) {
    switch (char) {
      case '\\':
        out += '\\\\'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case ' ':
        out += '\\u2028'
        break
      case ' ':
        out += '\\u2029'
        break
      default:
        if (char === quote || (quote === '`' && char === '$')) {
          out += `\\${char}`
        } else {
          out += char
        }
    }
  }
  return out + quote
}

const identifierRegex = /^[A-Za-z_$][\w$]*$/

/** An object or interface key: the name itself when it is an identifier. */
export function key(name: string, style: CodeStyle): string {
  return identifierRegex.test(name) ? name : lit(name, style.quote)
}
