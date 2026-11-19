console.warn(
  '[tanstack-router] These exports from "retain-exports-class-shared-group.tsx" will not be code-split and will increase your bundle size:\n- Layout\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
)
import { Layout } from 'retain-exports-class-shared-group.tsx?tsr-shared=1'
const $$splitLoaderImporter = () =>
  import('retain-exports-class-shared-group.tsx?tsr-split=loader')
import { lazyFn } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: lazyFn($$splitLoaderImporter, 'loader'),
})
export { Layout } from 'retain-exports-class-shared-group.tsx?tsr-shared=1'
