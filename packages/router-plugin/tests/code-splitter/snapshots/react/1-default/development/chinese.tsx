const $$splitComponentImporter = () => import('chinese.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr)
});
interface DemoProps {
  title: string;
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}