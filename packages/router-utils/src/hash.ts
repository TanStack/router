import crypto from 'node:crypto'
import type { BinaryLike, BinaryToTextEncoding } from 'node:crypto'

const nativeHashAvailable = typeof crypto.hash === 'function'

export function hash(
  algorithm: string,
  data: BinaryLike,
  outputEncoding: BinaryToTextEncoding = 'hex',
): string {

  if (nativeHashAvailable) {
    return crypto.hash(algorithm, data, outputEncoding)
  }

  return crypto.createHash(algorithm).update(data).digest(outputEncoding)
}
