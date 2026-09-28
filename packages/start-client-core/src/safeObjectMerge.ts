/* eslint-disable @typescript-eslint/prefer-for-of -- indexed loops avoid the iterator protocol on every merge */
function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

/**
 * Merge target and source into a new null-proto object, filtering dangerous keys.
 */
export function safeObjectMerge<T extends Record<string, unknown>>(
  target: T | undefined,
  source: Record<string, unknown> | null | undefined,
): T {
  const result: Record<string, unknown> = Object.create(null)
  if (target) {
    const keys = Object.keys(target)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (isSafeKey(key)) {
        result[key] = target[key]
      }
    }
  }
  if (source && typeof source === 'object') {
    const keys = Object.keys(source)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (isSafeKey(key)) {
        result[key] = source[key]
      }
    }
  }
  return result as T
}

/**
 * Create a null-prototype object, optionally copying from source.
 */
export function createNullProtoObject<T extends object>(
  source?: T,
): { [K in keyof T]: T[K] } {
  return safeObjectMerge(
    source as Record<string, unknown> | undefined,
    undefined,
  ) as { [K in keyof T]: T[K] }
}
