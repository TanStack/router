const $$splitComponentImporter = () => import('retain-exports-loader.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
export function loaderFn() {
  return {
    foo: 'bar'
  };
}
export const Route = createFileRoute('/_layout')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  loader: loaderFn
});
export const SIDEBAR_WIDTH = '150px';
export const SIDEBAR_MINI_WIDTH = '80px';
const ASIDE_WIDTH = '250px';