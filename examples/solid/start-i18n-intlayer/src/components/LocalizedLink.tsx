import { Link, type LinkProps } from '@tanstack/solid-router'
import { getPrefix } from 'intlayer'
import { useLocale } from 'solid-intlayer'
import type { JSX } from 'solid-js'

export const LOCALE_ROUTE = '{-$locale}' as const

// Renamed 'T' to 'TVal' to be explicit, though 'T' is usually allowed.
// Renamed 'S' to 'TString' to satisfy the linter.
export type RemoveLocaleParam<TVal> = TVal extends string
  ? RemoveLocaleFromString<TVal>
  : TVal

export type To = RemoveLocaleParam<LinkProps['to']>

// 'TString' replaces 'S', 'THead' replaces 'H', 'TTail' replaces 'T'
type CollapseDoubleSlashes<TString extends string> =
  TString extends `${infer THead}//${infer TTail}`
    ? CollapseDoubleSlashes<`${THead}/${TTail}`>
    : TString

type LocalizedLinkProps = Omit<LinkProps, 'to'> & {
  to?: To
} & JSX.AnchorHTMLAttributes<HTMLAnchorElement>

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

const LocalizedLink = (props: LocalizedLinkProps) => {
  const { locale } = useLocale()

  return (
    <Link
      {...props}
      params={{
        locale: getPrefix(locale()).localePrefix,
        ...(typeof props.params === 'object' ? props.params : {}),
      }}
      to={`/${LOCALE_ROUTE}${props.to ?? ''}` as LinkProps['to']}
    />
  )
}

export { LocalizedLink as Link }
