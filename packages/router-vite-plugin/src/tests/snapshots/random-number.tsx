import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitComponentImporter = () => import('tsr-split:/Users/tannerlinsley/GitHub/router/packages/router-vite-plugin/random-number.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('tsr-split:/Users/tannerlinsley/GitHub/router/packages/router-vite-plugin/random-number.tsx?tsr-split');
import { createFileRoute } from '@tanstack/react-router';
export const textColors = [`text-rose-500`, `text-yellow-500`, `text-teal-500`, `text-blue-500`];
export const gradients = [`from-rose-500 to-yellow-500`, `from-yellow-500 to-teal-500`, `from-teal-500 to-violet-500`, `from-blue-500 to-pink-500`];
export const Route = createFileRoute('/')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});