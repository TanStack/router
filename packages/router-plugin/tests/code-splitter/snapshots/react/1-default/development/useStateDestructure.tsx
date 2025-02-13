const $$splitComponentImporter = () => import('useStateDestructure.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { FaBolt, FaBook, FaCheckCircle, FaCogs } from 'react-icons/fa';
import { VscPreview, VscWand } from 'react-icons/vsc';
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