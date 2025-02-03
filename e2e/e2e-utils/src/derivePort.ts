import * as crypto from 'node:crypto'

/**
 * Hash a string and map it to a range [min, max].
 * @param {string} input - The string to hash.
 * @param {number} min - Minimum port value.
 * @param {number} max - Maximum port value.
 * @returns {number} A port within the range [min, max].
 */
export function derivePort(
  input: string,
  min: number = 5600,
  max: number = 65535,
): number {
  // Hash the input using SHA-256
  const hash = crypto.createHash('sha256').update(input).digest('hex')

  // Convert hash to an integer
  const hashInt = parseInt(hash.slice(0, 8), 16) // Use the first 8 characters

  // Map hash value to the port range
  const port = min + (hashInt % (max - min + 1))

  console.info(`Mapped "${input}" to port ${port}`)

  return port
}
