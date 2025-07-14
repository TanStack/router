import * as crypto from 'node:crypto'

export const minPort = 5610
export const maxPort = 65535

export async function getPort(packageName: string) {
  const isRunning = await serverIsRunning()

  if (!isRunning) {
    console.info('Server not found. Issuing port using derivePort')
    return derivePort(packageName, minPort, maxPort)
  }

  try {
    const res = await fetch(
      `http://localhost:5600/getPort?packageName=${packageName}`,
      {
        method: 'GET',
      },
    )

    const json = await res.json()
    console.info(`Retrieved port: ${json.port} from server.`)
    return json.port
  } catch (error) {
    console.error('Error fetching port:', error)
    console.error('Issuing port using derivePort')

    return derivePort(packageName, minPort, maxPort)
  }
}

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

export async function serverIsRunning() {
  let result = false

  try {
    const serverResponse = await fetch('http://localhost:5600/status', {
      method: 'GET',
    })

    result = serverResponse.ok
  } catch (error) {
    result = false
  }

  return result
}
