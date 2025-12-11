import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getIntlayer } from 'intlayer';
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


// GET request (default)
export const getData = createServerFn().handler(async () => {
  const locale = await getLocale();

  const { message } = getIntlayer('app', locale);

  return { message };
});

function App() {
  const { locale } = useLocale();
  const { helloWorld } = useIntlayer('app');

  const { data, isPending } = useQuery({
    queryFn: () => getData(),
    queryKey: ['app-message', locale],
  });

  if (isPending) return <div className="text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col justify-center text-white items-center gap-2">
      <h1 className="text-4xl">{helloWorld}</h1>
      <span>{data?.message}</span>
    </div>
  );
}
