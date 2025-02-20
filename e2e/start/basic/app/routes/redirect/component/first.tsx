import { createFileRoute, redirect } from '@tanstack/react-router'
import React from 'react'

export const Route = createFileRoute('/redirect/component/first')({
  component: RouteComponent,
})

function useThrowRedirect() {
  throw redirect({ to: '/redirect/component/second' })
}

function RouteComponent() {
  useThrowRedirect()
  return (
    <div data-testid="first">
      <h1>Redirecting...</h1>
    </div>
  )
}
