import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout/route-b')(
  {
    component: LayoutBComponent,
  },
)

/**
 * Renders a simple layout component that displays "I'm B!".
 *
 * @returns A JSX element containing a `div` with the text "I'm B!".
 */
function LayoutBComponent() {
  return <div>I'm B!</div>
}
