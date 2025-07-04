import { createRootRoute } from '@tanstack/react-router';
import crypto from 'node:crypto';
export const Route = createRootRoute({
  ssr: () => {
    if (crypto.randomInt(0, 2) === 0) {
      return 'data-only';
    }
    return false;
  },
  component: () => {
    return <div className="p-2">hello world</div>;
  }
});
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule && newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}