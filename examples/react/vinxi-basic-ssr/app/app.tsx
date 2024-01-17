import React from 'react'

import './style.css'
import { Router, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = new Router({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App({ assets }: { assets: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        {assets}
      </head>
      <body>
        <RouterProvider router={router} />
      </body>
    </html>
  )
}
