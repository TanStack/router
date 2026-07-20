export function dehydrateSsrMatchId(id: string): string {
  return id
    .replaceAll('~', '~~')
    .replaceAll('\0', '~0')
    .replaceAll('\uFFFD', '~r')
    .replaceAll('/', '\0')
}

export function hydrateSsrMatchId(id: string): string {
  return id
    .replaceAll('\0', '/')
    .replaceAll('\uFFFD', '/')
    .replace(/~([~0r])/g, (_, code) =>
      code === '0' ? '\0' : code === 'r' ? '\uFFFD' : code,
    )
}
