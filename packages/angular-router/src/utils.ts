/**
 *
 * @deprecated use `jsesc` instead
 */
export function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
}

export function shallow<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (const item of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, item) ||
      !Object.is(objA[item as keyof T], objB[item as keyof T])
    ) {
      return false
    }
  }
  return true
}

export function pick<TValue, TKey extends keyof TValue>(
  parent: TValue,
  keys: Array<TKey>,
): Pick<TValue, TKey> {
  return keys.reduce((obj: any, key: TKey) => {
    obj[key] = parent[key]
    return obj
  }, {} as any)
}