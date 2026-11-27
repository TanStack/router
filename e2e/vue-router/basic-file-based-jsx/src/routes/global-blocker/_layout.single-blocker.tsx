import { createFileRoute } from '@tanstack/vue-router'
import { SingleBlockerComponent } from '../../components/SingleBlockerComponent'

export const Route = createFileRoute('/global-blocker/_layout/single-blocker')({
  component: SingleBlockerComponent,
})
