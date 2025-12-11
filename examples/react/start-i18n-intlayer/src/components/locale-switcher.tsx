import { useLocation } from '@tanstack/react-router'
import {
  getHTMLTextDir,
  getLocaleName,
  getPathWithoutLocale,
  getPrefix,
} from 'intlayer'
import { setLocaleInStorage, useIntlayer, useLocale } from 'react-intlayer'

import { LocalizedLink } from './localized-link'
import type { To } from './localized-link'
import type { FC } from 'react'

export const LocaleSwitcher: FC = () => {
  const { localeSwitcherLabel } = useIntlayer('locale-switcher')
  const { pathname } = useLocation()

  const { availableLocales, locale } = useLocale()

  const pathWithoutLocale = getPathWithoutLocale(pathname)

  return (
    <ol className="divide-text/20 divide-y divide-dashed rounded-2xl bg-cyan-600 overflow-y-auto p-1 absolute top-10 right-10">
      {availableLocales.map((localeEl) => (
        <li className="py-1" key={localeEl}>
          <LocalizedLink
            aria-current={localeEl === locale ? 'page' : undefined}
            aria-label={
              localeSwitcherLabel({ language: getLocaleName(localeEl) }).value
            }
            onClick={() => setLocaleInStorage(localeEl)}
            params={{ locale: getPrefix(localeEl).localePrefix }}
            to={pathWithoutLocale as To}
          >
            <div className="flex flex-row items-center hover:bg-cyan-700 text-white rounded-md justify-between gap-3 px-2 py-1">
              <div className="flex flex-col text-nowrap">
                <span dir={getHTMLTextDir(localeEl)} lang={localeEl}>
                  {getLocaleName(localeEl)}
                </span>
                <span className="text-neutral text-xs">
                  {getLocaleName(localeEl, localeEl)}
                </span>
              </div>
              <span className="text-neutral text-sm text-nowrap">
                {localeEl.toUpperCase()}
              </span>
            </div>
          </LocalizedLink>
        </li>
      ))}
    </ol>
  )
}
