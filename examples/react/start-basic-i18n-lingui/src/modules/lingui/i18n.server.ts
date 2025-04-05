import {
  getHeaders,
  getRequestHeaders,
  getWebRequest,
  setHeader,
} from '@tanstack/react-start/server'
import { parse, serialize } from 'cookie-es'
import { defaultLocale, dynamicActivate, isLocaleValid } from './i18n'
import { i18n } from '@lingui/core'

export function getLocaleFromRequest() {
  const request = getWebRequest()
  const headers = getHeaders()
  const cookie = parse(headers.cookie ?? '')

  if (request) {
    const url = new URL(request.url)
    const queryLocale = url.searchParams.get('locale') ?? ''

    if (isLocaleValid(queryLocale)) {
      setHeader(
        'Set-Cookie',
        serialize('locale', queryLocale, {
          maxAge: 30 * 24 * 60 * 60,
          path: '/',
        }),
      )

      return queryLocale
    }
  }

  if (cookie.locale && isLocaleValid(cookie.locale)) {
    return cookie.locale
  }

  setHeader(
    'Set-Cookie',
    serialize('locale', defaultLocale, {
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    }),
  )

  return defaultLocale
}

export async function setupLocaleFromRequest() {
  await dynamicActivate(getLocaleFromRequest())
}
