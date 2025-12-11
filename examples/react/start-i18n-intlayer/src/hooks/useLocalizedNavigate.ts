import { useNavigate } from '@tanstack/react-router'
import { getPrefix } from 'intlayer'
import { useLocale } from 'react-intlayer'

import type { FileRouteTypes } from '@/routeTree.gen'

import { LOCALE_ROUTE } from '@/components/localized-link'

export const useLocalizedNavigate = () => {
  const navigate = useNavigate()

  const { locale } = useLocale()

  type StripLocalePrefix<T extends string> = T extends
    | `/${typeof LOCALE_ROUTE}/`
    | `/${typeof LOCALE_ROUTE}`
    ? '/'
    : T extends `/${typeof LOCALE_ROUTE}/${infer Rest}`
      ? `/${Rest}`
      : never

  type LocalizedTo = StripLocalePrefix<FileRouteTypes['to']>

  type LocalizedNavigate = (
    args: ({ to: LocalizedTo } & Record<string, unknown>) | LocalizedTo,
  ) => ReturnType<typeof navigate>

  const localizedNavigate: LocalizedNavigate = (args) => {
    if (typeof args === 'string') {
      return navigate({
        params: { locale: getPrefix(locale).localePrefix },
        to: `/${LOCALE_ROUTE}${args}`,
      })
    }

    const { params: existingParams, to, ...rest } = args

    const localizedTo = `/${LOCALE_ROUTE}${to}`

    return navigate({
      ...rest,
      params: {
        locale: getPrefix(locale).localePrefix,
        ...(existingParams ?? {}),
      },
      to: localizedTo,
    })
  }

  return localizedNavigate
}
