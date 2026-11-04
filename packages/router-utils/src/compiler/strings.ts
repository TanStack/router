/**
 * String helpers for generated code. Generated
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

const IDENTIFIER_NAME = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u

/** Whether `name` can be a binding identifier in a module. */
export function isValidIdentifier(name: string): boolean {
  if (name.length === 0 || RESERVED.has(name)) {
    return false
  }
  return IDENTIFIER_NAME.test(name)
}

/** An export name as a specifier writes it: a string literal unless it is an identifier name (`export { a as 'a-b' }`). */
export function specifierName(name: string): string {
  return IDENTIFIER_NAME.test(name) ? name : stringLiteral(name)
}

/** Replaces every character that cannot be part of an identifier (for name bases built from paths/keys). */
export function identifierBase(raw: string): string {
  const cleaned = raw.replace(/[^\p{ID_Continue}$_]/gu, '_')
  return /^[\p{ID_Start}$_]/u.test(cleaned) ? cleaned : `_${cleaned}`
}

/**
 * A table's entry for a name user code chose (a specifier, an export, a
 * member): `constructor` or `__proto__` must not find `Object.prototype`.
 */
export function ownEntry<T>(
  table: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}
