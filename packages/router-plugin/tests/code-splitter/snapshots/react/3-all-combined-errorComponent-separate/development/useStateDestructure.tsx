const $$splitComponentImporter = () => import('useStateDestructure.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { startProject } from '~/projects/start';
import { createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
export const Route = createFileRoute('/_libraries/start/$version/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr),
  meta: () => seo({
    title: startProject.name,
    description: startProject.description
  })
});
export function TSRDummyComponent() {
  return null;
}