import { RouterProvider } from '@tanstack/react-router'
import React from 'react'
import { Router } from '../router'

const router = new Router()

export default function App(props: {
  dehydratedRouter: ReturnType<typeof router.dehydrate>
}) {
  React.useState(() => {
    router.hydrate(props.dehydratedRouter)
  })

  return <RouterProvider router={router} />
}
