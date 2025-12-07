import {
  HeadContent,
  Outlet,
  Scripts,
  createFileRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlayerProvider, useLocale } from 'react-intlayer'
import { useState } from 'react'
import Header from '@/components/Header'
import { LocaleSwitcher } from '@/components/locale-switcher'

export const Route = createFileRoute('/{-$locale}')({
  component: RouteComponent,
})

function RouteComponent() {
  const { locale } = Route.useParams()
  const { defaultLocale } = useLocale()
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang={locale ?? defaultLocale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />

        <IntlayerProvider locale={locale ?? defaultLocale}>
          <QueryClientProvider client={queryClient}>
            <Outlet />
          </QueryClientProvider>
          <LocaleSwitcher />
        </IntlayerProvider>

        <Scripts />
      </body>
    </html>
  )
}
