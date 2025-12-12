import { createFileRoute } from '@tanstack/react-router';
import { useIntlayer } from 'react-intlayer';

import { LocalizedLink } from '@/components/localized-link';

export const Route = createFileRoute('/{-$locale}/404')({
  component: NotFoundComponent,
});

export function NotFoundComponent() {
  const { title, subtitle, backHome, lostMessage } = useIntlayer('not-found');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 px-4 text-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-64 w-64 animate-pulse rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 animate-pulse rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          <h1 className="font-bold text-[10rem] text-white leading-none tracking-tighter opacity-10 md:text-[14rem]">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-bold text-6xl text-white md:text-8xl">
              404
            </span>
          </div>
        </div>

        <h2 className="font-bold text-2xl text-white md:text-4xl">{title}</h2>

        <p className="font-medium text-cyan-400 text-lg italic">
          {lostMessage}
        </p>

        <p className="max-w-md text-slate-400 text-xl">{subtitle}</p>

        <LocalizedLink
          to="/"
          className="mt-4 rounded-xl bg-blue-600 px-8 py-4 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-blue-500/25 hover:shadow-lg"
        >
          {backHome}
        </LocalizedLink>
      </div>
    </div>
  );
}
