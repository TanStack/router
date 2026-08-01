export function dehydrateSsrMatchId(id: string): string {
  return id.replaceAll('/', '\uFFFD')
}

export function hydrateSsrMatchId(id: string): string {
  return id.replaceAll('\0', '/').replaceAll('\uFFFD', '/')
}
