// Inlined match ids must not look like relative URLs to crawlers, and must only
// contain characters that are valid in the HTML input stream. The client
// compares ids in this encoded form, so no decoder is needed.
export function dehydrateSsrMatchId(id: string): string {
  return id.replaceAll('/', '\uFFFD')
}
