/**
 * String helpers for generated code (DESIGN §1.2 `strings.ts`). Generated
 * glue never contains a raw CR, U+2028 or U+2029: the OutputBuilder counts
 * only LF in glue, and the escaper keeps every other line terminator out.
 */

/** Prints a JavaScript string literal with the given quote. */
export function stringLiteral(value: string, quote: "'" | '"' = "'"): string {
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
