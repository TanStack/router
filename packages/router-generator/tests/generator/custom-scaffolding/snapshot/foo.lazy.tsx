import React, { useState } from 'react'

export const Route = createLazyFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return 'Hello /foo!'
}
