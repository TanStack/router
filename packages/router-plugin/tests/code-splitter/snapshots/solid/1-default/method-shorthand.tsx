const $$splitErrorComponentImporter = () => import('method-shorthand.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/solid-router';
import * as Solid from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/posts')({
  loader: function () {
    return fetchPosts();
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});