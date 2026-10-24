// Inlined match ids must not look like relative URLs to crawlers, and must only
// contain characters that are valid in the HTML input stream. '#' cannot come
// from a decoded pathname or an encoded param, Seroval emits it unescaped, and
// it keeps the HTML one-byte: a single char above U+00FF makes V8 widen the
// whole concatenated HTML string to two bytes per char, which slows SSR.
// The client compares match ids in this encoded form, so they are never decoded.
// The dehydrated manifest's route keys use the same encoding on the wire and
// are decoded back to route ids once in `hydrate`. Route ids are assumed not to
// contain '#' ('/a#b' and '/a/b' would collide).
export function dehydrateSsrMatchId(id: string): string {
  return id.replaceAll('/', '#')
}
