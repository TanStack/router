import '@tanstack/react-start/server-only'
const configuredOrigin = process.env.APP_ORIGIN
if (!configuredOrigin) {
  throw new Error('Set APP_ORIGIN to the public origin of this application')
}
const url = new URL(configuredOrigin)
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.origin !== configuredOrigin
) {
  throw new Error(
    'APP_ORIGIN must be an HTTP or HTTPS origin without a trailing slash',
  )
}
export const siteOrigin = url.origin
