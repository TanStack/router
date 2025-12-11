import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout/route-a')(
  {
    component: LayoutAComponent,
  },
)

/**
 * Renders the layout A component showing "I'm A!".
 *
 * @returns A JSX element containing a div with the text "I'm A!".
 */
function LayoutAComponent() {
  return <div>I'm A!</div>
}
