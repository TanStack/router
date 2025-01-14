export function isServerSideError(error: unknown): error is {
  __isServerError: true
  data: Record<string, any>
} {
  if (!(typeof error === 'object' && error && 'data' in error)) return false
  if (!('__isServerError' in error && error.__isServerError)) return false
  if (!(typeof error.data === 'object' && error.data)) return false

  return error.__isServerError === true
}

export function defaultDeserializeError(serializedData: Record<string, any>) {
  if ('name' in serializedData && 'message' in serializedData) {
    const error = new Error(serializedData.message)
    error.name = serializedData.name
    if (process.env.NODE_ENV === 'development') {
      error.stack = serializedData.stack
    }
    return error
  }

  return serializedData.data
}
