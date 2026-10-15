const $$splitComponentImporter = () =>
  import('ambient-declarations.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
declare function gtag(event: string): void
declare enum Flags {
  On = 1,
}
declare namespace Analytics {
  function track(event: string): void
}
declare const buildId: string
declare class Tracker {
  static send(event: string): void
}
export const Route = createFileRoute('/')({
  loader: () => {
    gtag('load')
    Analytics.track(buildId)
    Tracker.send('load')
    return Flags.On
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
