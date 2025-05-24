const $$splitNotFoundComponentImporter = () => import('export-default-component-and-normal-notFound.tsx?tsr-split=notFoundComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/home')({
  component: Home,
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent')
});
export default function Home() {
  const [one, setOne] = useState('this is from a state');
  return <div>
      <h1>{one}</h1>
    </div>;
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}