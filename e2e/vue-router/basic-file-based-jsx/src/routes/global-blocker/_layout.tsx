import { createFileRoute } from '@tanstack/vue-router'
import { GlobalBlockerLayoutComponent } from '../../components/GlobalBlockerLayoutComponent'

export const Route = createFileRoute('/global-blocker/_layout')({
  component: GlobalBlockerLayoutComponent,
})
