import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useIntlayer, useLocale } from 'react-intlayer';

import { getLocale } from '@/utils/getLocale';

export const Route = createFileRoute('/{-$locale}/')({
  component: App,
  head: ({ params }) => {
    const { locale } = params;
    const { meta } = getIntlayer('app', locale);

    return {
      meta: [meta],
    };
  },
});

import { createServerFn } from '@tanstack/react-start';
import { getIntlayer } from 'intlayer';

export const getData = createServerFn().handler(async () => {
  const locale = await getLocale();

  const { message } = getIntlayer('app', locale);

  return { message };
});

function App() {
  const { locale } = useLocale();
  const { helloWorld } = useIntlayer('app');

  const { data, error, isLoading } = useQuery({
    queryFn: () => getData(),
    queryKey: ['app-message', locale],
  });

  if (isLoading) return <div className="text-white">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading message</div>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <h1 className="text-4xl">{helloWorld}</h1>
      <span>{data?.message}</span>
    </div>
  );
}
