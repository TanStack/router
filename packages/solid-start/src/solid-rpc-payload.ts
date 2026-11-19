const START_PAYLOAD_DATA_ARG = 1

export function encodeSolidStartPayload(args: Array<any>): Array<any> {
  if (args.length !== 1 || !isObject(args[0])) {
    return args
  }

  const payload = args[0]
  const data = payload.data
  const solidPayload = stripUndefined({
    method: payload.method,
    headers: normalizeHeaders(payload.headers as HeadersInit | undefined),
    context: stripUndefined(payload.context),
  })

  if (isFormDataLike(data)) {
    return [solidPayload, normalizeFormData(data)]
  }

  return [
    stripUndefined({
      ...solidPayload,
      data,
    }),
  ]
}

export function decodeSolidStartPayload(args: Array<any>): any {
  const payload = args[0]

  if (
    args.length > START_PAYLOAD_DATA_ARG &&
    isObject(payload) &&
    isFormDataLike(args[START_PAYLOAD_DATA_ARG])
  ) {
    return {
      ...payload,
      data: normalizeFormData(args[START_PAYLOAD_DATA_ARG]),
    }
  }

  if (args.length === 1 && isFormDataLike(payload)) {
    return { data: normalizeFormData(payload), method: 'POST' }
  }

  return payload
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) {
    return undefined
  }

  const normalized: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    normalized[key] = value
  })
  return normalized
}

interface FormDataLike {
  append: (name: string, value: unknown) => void
  entries: () => IterableIterator<[string, FormDataEntryValue]>
  get: (name: string) => FormDataEntryValue | null
}

function isFormDataLike(value: unknown): value is FormDataLike {
  return (
    typeof FormData !== 'undefined' &&
    isObject(value) &&
    typeof value.append === 'function' &&
    typeof value.entries === 'function' &&
    typeof value.get === 'function'
  )
}

function normalizeFormData(value: FormDataLike) {
  if (value instanceof FormData) {
    return value
  }

  const normalized = new FormData()
  for (const [name, entry] of value.entries()) {
    normalized.append(name, entry)
  }
  return normalized
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const stripped: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue !== undefined) {
      stripped[key] = stripUndefined(nestedValue)
    }
  }
  return stripped as T
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
