import { createLazyFileRoute } from '@tanstack/react-router'
import Expensive from './-components/Expensive'

export const Route = createLazyFileRoute('/expensive/')({
  component: () => Expensive
})
