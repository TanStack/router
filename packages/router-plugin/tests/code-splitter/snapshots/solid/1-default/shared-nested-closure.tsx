const $$splitComponentImporter = () => import('shared-nested-closure.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import { createFileRoute } from '@tanstack/solid-router';

// Nested closure - ensure we track through closures
const cfg = {
  api: 'http://api.com'
};
const makeLoader = () => () => cfg.api;
export const Route = createFileRoute('/test')({
  loader: makeLoader(),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});