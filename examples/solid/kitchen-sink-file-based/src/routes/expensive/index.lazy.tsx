import { createLazyFileRoute } from '@tanstack/solid-router'
import Expensive from './-components/Expensive'

export const Route = createLazyFileRoute('/expensive/')({
  component: Expensive,
})
