import { createFileRoute } from '@tanstack/react-router';
import { useIntlayer } from 'react-intlayer';

export const Route = createFileRoute('/{-$locale}/about')({
  component: AboutPage,
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
