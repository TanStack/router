import { Link } from '@tanstack/react-router'
import { getPrefix } from 'intlayer'
import { useLocale } from 'react-intlayer'
import type { FC } from 'react'
import type { LinkComponentProps } from '@tanstack/react-router'

export const LOCALE_ROUTE = '{-$locale}' as const

// Renamed 'T' to 'TVal' to be explicit, though 'T' is usually allowed.
// Renamed 'S' to 'TString' to satisfy the linter.
export type RemoveLocaleParam<TVal> = TVal extends string
  ? RemoveLocaleFromString<TVal>
  : TVal

export type To = RemoveLocaleParam<LinkComponentProps['to']>

// 'TString' replaces 'S', 'THead' replaces 'H', 'TTail' replaces 'T'
type CollapseDoubleSlashes<TString extends string> =
  TString extends `${infer THead}//${infer TTail}`
    ? CollapseDoubleSlashes<`${THead}/${TTail}`>
    : TString

type LocalizedLinkProps = {
  to?: To
} & Omit<LinkComponentProps, 'to'>

// 'TString' replaces 'S', 'TSub' replaces 'Sub'
type RemoveAll<
  TString extends string,
  TSub extends string,
> = TString extends `${infer THead}${TSub}${infer TTail}`
  ? RemoveAll<`${THead}${TTail}`, TSub>
  : TString

type RemoveLocaleFromString<TString extends string> = CollapseDoubleSlashes<
  RemoveAll<TString, typeof LOCALE_ROUTE>
>

export const LocalizedLink: FC<LocalizedLinkProps> = (props) => {
  const { locale } = useLocale()

  return (
    <Link
      {...props}
      params={{
        locale: getPrefix(locale).localePrefix,
        ...(typeof props.params === 'object' ? props.params : {}),
      }}
      to={`/${LOCALE_ROUTE}${props.to}` as LinkComponentProps['to']}
    />
  )
}
