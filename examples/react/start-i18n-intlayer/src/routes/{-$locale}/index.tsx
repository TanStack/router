import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  defaultLocale,
  getIntlayer,
  getLocalizedUrl,
  localeMap,
} from 'intlayer'
import { useIntlayer, useLocale } from 'react-intlayer'

import { queryClient } from '@/router'
import { getLocale } from '@/utils/getLocale'

export const Route = createFileRoute('/{-$locale}/')({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ),
  head: ({ params }) => {
    const { locale } = params
    const path = '/' // The path for this route

    const { meta } = getIntlayer('app', locale)

    return {
      links: [
        // Canonical link: Points to the current localized page
        { rel: 'canonical', href: getLocalizedUrl(path, locale) },

        // Hreflang: Tell Google about all localized versions
        ...localeMap(({ locale: mapLocale }) => ({
          rel: 'alternate',
          hrefLang: mapLocale,
          href: getLocalizedUrl(path, mapLocale),
        })),

        // x-default: For users in unmatched languages
        // Define the default fallback locale (usually your primary language)
        {
          rel: 'alternate',
          hrefLang: 'x-default',
          href: getLocalizedUrl(path, defaultLocale),
        },
      ],
      meta: [
        { title: meta.title },
        { name: 'description', content: meta.description },
      ],
    }
  },
})

export const getData = createServerFn().handler(async () => {
  const locale = await getLocale()

  const { message } = getIntlayer('app', locale)

  return { message }
})

function App() {
  const { locale } = useLocale()
  const { helloWorld } = useIntlayer('app')

  const { data, error, isLoading } = useQuery({
    queryFn: () => getData(),
    queryKey: ['app-message', locale],
  })

  if (isLoading) return <div className="text-white">Loading...</div>
  if (error) return <div className="text-red-500">Error loading message</div>

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <h1 className="text-4xl">{helloWorld}</h1>
      <span>{data?.message}</span>
    </div>
  )
}
