const encodedSsrMatchIdPrefix = '__TSR__'

export function dehydrateSsrMatchId(id: string): string {
  if (
    !id.includes('/') &&
    !id.includes('\0') &&
    !id.includes('\uFFFD') &&
    !id.startsWith(encodedSsrMatchIdPrefix)
  ) {
    return id
  }

  return `${encodedSsrMatchIdPrefix}${btoa(encodeURIComponent(id))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')}`
}

export function hydrateSsrMatchId(id: string): string {
  if (id.startsWith(encodedSsrMatchIdPrefix)) {
    try {
      const base64 = id
        .slice(encodedSsrMatchIdPrefix.length)
        .replaceAll('-', '+')
        .replaceAll('_', '/')
      const paddedBase64 = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        '=',
      )
      return decodeURIComponent(atob(paddedBase64))
    } catch {
      return id
    }
  }

  return id.replaceAll('\0', '/').replaceAll('\uFFFD', '/')
}
