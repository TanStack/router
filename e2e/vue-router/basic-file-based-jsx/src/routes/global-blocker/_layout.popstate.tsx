import { createFileRoute } from '@tanstack/vue-router'
import { PopstateBlockerComponent } from '../../components/PopstateBlockerComponent'

export const Route = createFileRoute('/global-blocker/_layout/popstate')({
  component: PopstateBlockerComponent,
})
