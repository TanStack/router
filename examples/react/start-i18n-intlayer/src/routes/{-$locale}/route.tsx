import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { validatePrefix } from 'intlayer';
import { IntlayerProvider, useLocale } from 'react-intlayer';

import Header from '@/components/Header';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { useI18nHTMLAttributes } from '@/hooks/useI18nHTMLAttributes';
import { NotFoundComponent } from './404';

const queryClient = new QueryClient();

export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    // Get locale from route params (not from server headers, as beforeLoad runs on both client and server)
    const localeParam = params.locale;

    // If no locale provided (optional param), it's valid (will use default)
    // In prefix-all mode, the locale is required to be a valid locale
    const { isValid, localePrefix } = validatePrefix(localeParam);

    if (isValid) {
      // If locale is valid, continue
      return;
    }

    throw redirect({
      to: '/{-$locale}/404',
      params: { locale: localePrefix },
    });
  },
  component: RouteComponent,
  notFoundComponent: NotFoundLayout,
});

function RouteComponent() {
  const { defaultLocale } = useLocale();
  const { locale } = Route.useParams();

  useI18nHTMLAttributes();

  return (
    <IntlayerProvider locale={locale ?? defaultLocale}>
      <QueryClientProvider client={queryClient}>
        <Header />
        <Outlet />
        <LocaleSwitcher />
      </QueryClientProvider>
    </IntlayerProvider>
  );
}

function NotFoundLayout() {
  const { defaultLocale } = useLocale();
  const { locale } = Route.useParams();

  return (
    <IntlayerProvider locale={locale ?? defaultLocale}>
      <NotFoundComponent />
      <LocaleSwitcher />
    </IntlayerProvider>
  );
}
