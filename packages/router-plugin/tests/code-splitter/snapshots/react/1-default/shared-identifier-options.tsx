import { read } from "shared-identifier-options.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-identifier-options.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
const options = {
  codeSplitGroupings: [['component'], ['loader']],
  loader: () => read(),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
};
export const Route = createFileRoute('/shared-identifier-options')(options);