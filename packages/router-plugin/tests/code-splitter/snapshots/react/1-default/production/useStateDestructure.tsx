const $$splitComponentImporter = () => import('useStateDestructure.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { startProject } from '~/projects/start';
import { createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
export const Route = createFileRoute('/_libraries/start/$version/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component', () => Route.ssr, import.meta.url),
  meta: () => seo({
    title: startProject.name,
    description: startProject.description
  })
});