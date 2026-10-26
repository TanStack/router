/**
 * String helpers for generated code (DESIGN §1.2 `strings.ts`). Generated
 * glue never contains a raw CR, U+2028 or U+2029: the OutputBuilder counts
 * only LF in glue, and the escaper keeps every other line terminator out.
 */

/** A character `stringLiteral` escapes (the common specifier or name has none). */
const NEEDS_ESCAPE = /[\\\n\r\u2028\u2029'"]/

/** Prints a JavaScript string literal with the given quote. */
export function stringLiteral(value: string, quote: "'" | '"' = "'"): string {
  if (!NEEDS_ESCAPE.test(value)) {
    return quote + value + quote
  }
  let out = quote
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    switch (c) {
      case 92:
        out += '\\\\'
        break
      case 10:
        out += '\\n'
        break
      case 13:
        out += '\\r'
        break
      case 0x2028:
        out += '\\u2028'
        break
      case 0x2029:
        out += '\\u2029'
        break
      case 39:
        out += quote === "'" ? "\\'" : "'"
        break
      case 34:
        out += quote === '"' ? '\\"' : '"'
        break
      default:
        out += value[i]
    }
  }
  return out + quote
}

/** Prints a module specifier literal, reusing the quote of an original literal when given. */
export function specifierLiteral(specifier: string, original?: string): string {
  const quote = original?.startsWith('"') ? '"' : "'"
  return stringLiteral(specifier, quote)
}

/** Reads the value of a string literal's raw source text (quotes included). */
export function readStringLiteral(raw: string): string {
  const q = raw[0]
  if ((q !== "'" && q !== '"') || raw[raw.length - 1] !== q) {
    throw new Error(`not a string literal: ${raw}`)
  }
  // Specifier literals in practice never contain escapes; handle the common ones.
  return raw
    .slice(1, -1)
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\(.)/g, (_, c: string) => {
      switch (c) {
        case 'n':
          return '\n'
        case 'r':
          return '\r'
        case 't':
          return '\t'
        case 'b':
          return '\b'
        case 'f':
          return '\f'
        case 'v':
          return '\v'
        case '0':
          return '\0'
        default:
          return c
      }
    })
}

const RESERVED = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'arguments',
  'eval',
])

/** Whether `name` can be a binding identifier in a module. */
export function isValidIdentifier(name: string): boolean {
  if (name.length === 0 || RESERVED.has(name)) {
    return false
  }
  return /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u.test(name)
}

/** Replaces every character that cannot be part of an identifier (for name bases built from paths/keys). */
export function identifierBase(raw: string): string {
  const cleaned = raw.replace(/[^\p{ID_Continue}$_]/gu, '_')
  return /^[\p{ID_Start}$_]/u.test(cleaned) ? cleaned : `_${cleaned}`
}

/** Whether a JSX tag name denotes a component (not an intrinsic element). */
export function isComponentTagName(name: string): boolean {
  const c = name.charCodeAt(0)
  return (c >= 65 && c <= 90) || name.includes('.') || c > 127
}

/** Escapes text that goes into JSX children (`<`, `>`, `{`, `}`). */
export function jsxText(text: string): string {
  return text.replace(/[<>{}]/g, (c) => `{${stringLiteral(c, "'")}}`)
}
