import * as React from 'react'
import { FileRoute } from '@tanstack/router-core'

export const route = new FileRoute('/_layout/layout-b').createRoute({
  component: () => {
    return <div>I'm B!</div>
  },
})
