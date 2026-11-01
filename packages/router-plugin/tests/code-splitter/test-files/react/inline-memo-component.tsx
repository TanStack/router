import { memo } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: memo(() => {
    const label: string = 'Inline memo component'
    return <div>{label}</div>
  }),
})
