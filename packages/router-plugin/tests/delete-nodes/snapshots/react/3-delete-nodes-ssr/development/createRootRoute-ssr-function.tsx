import { createRootRoute } from '@tanstack/react-router';
export const Route = createRootRoute({
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