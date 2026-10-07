const $$splitErrorComponentImporter = () => import('method-shorthand.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('method-shorthand.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
export const Route = createFileRoute('/posts')({
  loader: function () {
    return fetchPosts();
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});