import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/no-title')({
  component: NoTitle,
})

function NoTitle() {
  return (
    <div>
      <h1>Hello!</h1>
      <p>This page has no title.</p>
    </div>
  )
}
