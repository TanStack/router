const dehydrateCache = new Map<string, string>()
const DEHYDRATE_CACHE_MAX = 256
const DEHYDRATE_CACHE_MAX_ID_LENGTH = 4096

export function dehydrateSsrMatchId(id: string): string {
  const cached = dehydrateCache.get(id)
  if (cached !== undefined) {
    return cached
  }

  const result = dehydrateSsrMatchIdUncached(id)
  if (id.length > DEHYDRATE_CACHE_MAX_ID_LENGTH) {
    return result
  }
  if (dehydrateCache.size >= DEHYDRATE_CACHE_MAX) {
    dehydrateCache.delete(dehydrateCache.keys().next().value!)
  }
  dehydrateCache.set(id, result)
  return result
}

function dehydrateSsrMatchIdUncached(id: string): string {
  const len = id.length
  let last = 0
  let out = ''
  for (let i = 0; i < len; i++) {
    const c = id.charCodeAt(i)
    if (c === 126) {
      out += id.slice(last, i) + '~~'
      last = i + 1
    } else if (c === 0) {
      out += id.slice(last, i) + '~0'
      last = i + 1
    } else if (c === 0xfffd) {
      out += id.slice(last, i) + '~r'
      last = i + 1
    } else if (c === 47) {
      out += id.slice(last, i) + '\0'
      last = i + 1
    }
  }
  return last === 0 ? id : out + id.slice(last)
}

export function hydrateSsrMatchId(id: string): string {
  if (
    id.indexOf('\0') === -1 &&
    id.indexOf('\uFFFD') === -1 &&
    id.indexOf('~') === -1
  ) {
    return id
  }
  return id
    .replaceAll('\0', '/')
    .replaceAll('\uFFFD', '/')
    .replace(/~([~0r])/g, (_, code) =>
      code === '0' ? '\0' : code === 'r' ? '\uFFFD' : code,
    )
}
