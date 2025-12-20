import * as React from 'react'
import { RouterProvider } from '../RouterProvider'
import type { Register, RegisteredRouter } from '@tanstack/router-core'

export function RouterServer<TRegister extends Register = Register>(props: {
  router: RegisteredRouter<TRegister>
}) {
  return <RouterProvider router={props.router} />
}
