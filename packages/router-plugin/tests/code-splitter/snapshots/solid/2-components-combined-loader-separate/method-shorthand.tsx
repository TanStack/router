const $$splitErrorComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/solid-router';
const $$splitLoaderImporter = () => import('method-shorthand.tsx?tsr-split=loader');
import { lazyFn } from '@tanstack/solid-router';
import * as Solid from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
export const Route = createFileRoute('/posts')({
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});