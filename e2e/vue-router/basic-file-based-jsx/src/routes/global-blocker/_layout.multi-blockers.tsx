import { createFileRoute } from '@tanstack/vue-router'
import { MultiBlockersComponent } from '../../components/MultiBlockersComponent'

export const Route = createFileRoute('/global-blocker/_layout/multi-blockers')({
  component: MultiBlockersComponent,
})
