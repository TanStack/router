export function sortJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sortJson) as T
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const key of Object.keys(obj).sort()) {
    out[key] = sortJson(obj[key])
  }

  return out as T
}
