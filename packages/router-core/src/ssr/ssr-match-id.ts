// Inlined match ids must not look like relative URLs to crawlers, and must only
// contain characters that are valid in the HTML input stream. '#' cannot come
// from a decoded pathname or an encoded param, Seroval emits it unescaped, and
// it keeps the HTML one-byte: a single char above U+00FF makes V8 widen the
// whole concatenated HTML string to two bytes per char, which slows SSR.
// The client compares ids in this encoded form, so no decoder is needed.
export function dehydrateSsrMatchId(id: string): string {
  return id.replaceAll('/', '#')
}

// Manifest route ids are looked up by their original id on the client, so they
// are decoded on hydration. A key from an older server is still raw and starts
// with '/' or is the root id, so only encoded keys are decoded.
export function hydrateSsrManifestRouteId(id: string): string {
  return id.startsWith('#') ? id.replaceAll('#', '/') : id
}
