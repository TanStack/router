const $$splitComponentImporter = () => import('random-number.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute, defer } from '@tanstack/react-router';
import { getSponsorsForSponsorPack } from '~/server/sponsors';
export const textColors = [`text-rose-500`, `text-yellow-500`, `text-teal-500`, `text-blue-500`];
export const gradients = [`from-rose-500 to-yellow-500`, `from-yellow-500 to-teal-500`, `from-teal-500 to-violet-500`, `from-blue-500 to-pink-500`];
export const Route = createFileRoute('/')({
  loader: () => {
    return {
      randomNumber: Math.random(),
      sponsorsPromise: defer(getSponsorsForSponsorPack())
    };
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url)
});