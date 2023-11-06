import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const route = new FileRoute('/_layout/layout-a').createRoute({
  component: () => {
    return <div>I'm A!</div>
  },
})
