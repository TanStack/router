import { createFileRoute } from '@tanstack/vue-router'
import type { RouteComponent } from '@tanstack/vue-router'
import { EditingAComponent } from '../components/EditingAComponent'

export const Route = createFileRoute('/editing-a')({
  component: EditingAComponent as unknown as RouteComponent,
})
