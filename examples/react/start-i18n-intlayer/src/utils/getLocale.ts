import { getRequestHeader } from '@tanstack/react-start/server'
import { getCookie, getLocale as getLocaleCore } from 'intlayer'
import type { Locale } from 'intlayer'

export const getLocale = async (): Promise<Locale> =>
  getLocaleCore({
    // Get the cookie from the request (default: 'INTLAYER_LOCALE')
    getCookie: (name) => {
      const cookieString = getRequestHeader('cookie')

      return getCookie(name, cookieString)
    },
    // Get the header from the request (default: 'x-intlayer-locale')
    // Fallback using Accept-Language negotiation
    getHeader: (name) => getRequestHeader(name),
  })
