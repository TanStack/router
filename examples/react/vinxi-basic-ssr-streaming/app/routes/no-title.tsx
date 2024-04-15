import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

async function action() {
  'use server'
  console.log('hola from the server')
  return new Promise<string>((r) => {
    setTimeout(() => r('Server says hello, too!'), 500)
  })
}

export const Route = createFileRoute('/no-title')({
  component: NoTitle,
})

function NoTitle() {
  const [hola, setHola] = React.useState('')
  React.useEffect(() => {
    action().then((h) => {
      setHola(h)
    })
  }, [])
  return (
    <div>
      {hola}
      <h1>Hello!</h1>
      <p>This page has no title.</p>
    </div>
  )
}
