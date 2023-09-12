import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const route = new FileRoute('/').createRoute({
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})
