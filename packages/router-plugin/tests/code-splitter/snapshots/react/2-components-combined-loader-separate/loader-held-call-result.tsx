const $$splitComponentImporter = () =>
  import('loader-held-call-result.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { makeLoader } from '../loaders'
// a call result may be an object-form loader: split with the mark
const postsLoader = makeLoader('/posts')
export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
