import { createFileRoute } from '@tanstack/react-router';
import { defaultLocale, getIntlayer, getLocalizedUrl, localeMap } from 'intlayer';
import { useIntlayer } from 'react-intlayer';

export const Route = createFileRoute('/{-$locale}/about')({
  component: AboutPage,
  head: ({ params }) => {
    const { locale } = params;
    const path = '/about';

    const { meta } = getIntlayer('about', locale);

    return {
      links: [
        { rel: 'canonical', href: getLocalizedUrl(path, locale) },
        ...localeMap(({ locale: mapLocale }) => ({
          rel: 'alternate',
          hrefLang: mapLocale,
          href: getLocalizedUrl(path, mapLocale),
        })),
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
    };
  },
});

function AboutPage() {
  const { title, description } = useIntlayer('about');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <h1 className="text-4xl">{title}</h1>
      <p className="text-gray-300">{description}</p>
    </div>
  );
}
