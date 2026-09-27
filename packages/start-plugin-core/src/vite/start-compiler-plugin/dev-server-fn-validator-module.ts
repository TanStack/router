import { SERVER_FN_NOT_FOUND } from '@tanstack/start-server-core/constants'

/**
 * Dev-only `getServerFnById`: it defers the id check to the
 * `validateServerFnIdVirtualModule` loader, which calls
 * `this.error('Invalid server function ID: …')` for an unknown id. That error
 * is flagged with `SERVER_FN_NOT_FOUND` so the request handler answers 404 for a
 * stale id, matching production; without the flag dev answered 500 and a caller
 * could tell dev and production apart, or probe which server-only ids exist.
 */
export function getDevServerFnValidatorModule(
  validateServerFnIdVirtualModule: string,
): string {
  return `
export async function getServerFnById(id, _access) {
  const validateIdImport = ${JSON.stringify(validateServerFnIdVirtualModule)} + '?id=' + id
  try {
    await import(/* @vite-ignore */ '/@id/__x00__' + validateIdImport)
  } catch (error) {
    if (error && typeof error.message === 'string' && error.message.includes('Invalid server function ID')) {
      error[${JSON.stringify(SERVER_FN_NOT_FOUND)}] = true
    }
    throw error
  }
  const decoded = Buffer.from(id, 'base64url').toString('utf8')
  const devServerFn = JSON.parse(decoded)
  const mod = await import(/* @vite-ignore */ devServerFn.file)
  return mod[devServerFn.export]
}
`
}
