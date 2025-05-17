const $$splitNotFoundComponentImporter = () => import('using.tsx?tsr-split=notFoundComponent');
const $$splitComponentImporter = () => import('using.tsx?tsr-split=component');
const $$splitErrorComponentImporter = () => import('using.tsx?tsr-split=errorComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const DummyPostResource = (postId: string) => ({
  postData: {
    id: postId,
    title: 'dummy',
    body: 'dummy'
  },
  [Symbol.dispose]: () => console.log('disposing!')
});
export const Route = createFileRoute({
  loader: ({
    params: {
      postId
    }
  }) => {
    using dummyPost = DummyPostResource(postId);
    return dummyPost.postData;
  },
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, 'notFoundComponent')
});
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route);
    }
  });
}