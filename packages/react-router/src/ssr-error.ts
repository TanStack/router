const message = 'SSR has been disabled for this route'

export function createSsrError() {
  return new Error(message)
}

export function isSsrError(error: any): error is Error {
  return error instanceof Error && error.message.includes(message)
}
