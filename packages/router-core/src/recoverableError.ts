export const RECOVERABLE_ERROR = 'TSR_RecoverableError'

export function isRecoverableError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes(RECOVERABLE_ERROR)
  }
  return false
}

export function createRecoverableError(message: string): Error {
  const error = new Error(`${RECOVERABLE_ERROR}: ${message}`)
  return error
}
