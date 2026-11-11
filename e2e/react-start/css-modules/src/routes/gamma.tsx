import { createFileRoute } from '@tanstack/react-router'
import { formatTitle } from '../utils/formatTitle'

export const Route = createFileRoute('/gamma')({ component: Gamma })

function Gamma() {
  return <div data-testid="route-page">{formatTitle('Gamma')}</div>
}
